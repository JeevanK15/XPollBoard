package http

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"pulseboard/api/internal/model"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type createInput struct {
	Question string   `json:"question"`
	Options  []string `json:"options"`
}

func (a *App) createPoll(c *gin.Context) {
	var in createInput
	if c.ShouldBindJSON(&in) != nil || len(strings.TrimSpace(in.Question)) < 5 || len(in.Question) > 280 || len(in.Options) < 2 || len(in.Options) > 10 {
		apiError(c, 400, "Question must be 5-280 characters with 2-10 options")
		return
	}
	options := make([]model.Option, 0, len(in.Options))
	seen := map[string]bool{}
	for _, raw := range in.Options {
		text := strings.TrimSpace(raw)
		key := strings.ToLower(text)
		if len(text) < 1 || len(text) > 80 || seen[key] {
			apiError(c, 400, "Options must be unique and 1-80 characters")
			return
		}
		seen[key] = true
		options = append(options, model.Option{ID: randomID()[:8], Text: text})
	}
	poll := model.Poll{OwnerID: ownerID(c), ShareID: randomID(), Question: strings.TrimSpace(in.Question), Options: options, Active: true, CreatedAt: time.Now().Unix()}
	if _, err := a.db.Collection("polls").InsertOne(c, poll); err != nil {
		apiError(c, 500, "Could not create poll")
		return
	}
	if _, err := a.db.Collection("users").UpdateOne(c, bson.M{"_id": ownerID(c)}, bson.M{"$inc": bson.M{"pollsCreated": 1}}); err != nil {
		apiError(c, 500, "Poll created but account statistics could not be updated")
		return
	}
	values := map[string]interface{}{}
	for _, o := range options {
		values[o.ID] = 0
	}
	if err := a.cache.HSet(c, "poll:"+poll.ShareID, values).Err(); err != nil {
		apiError(c, 503, "Poll saved but live cache could not initialize")
		return
	}
	c.JSON(201, poll)
}
func (a *App) addLiveCounts(c *gin.Context, poll *model.Poll) {
	counts, err := a.cache.HGetAll(c, "poll:"+poll.ShareID).Result()
	if err != nil || len(counts) == 0 {
		return
	}
	for i := range poll.Options {
		if n, err := strconv.ParseInt(counts[poll.Options[i].ID], 10, 64); err == nil {
			poll.Options[i].Votes = n
		}
	}
}
func (a *App) getPoll(c *gin.Context) {
	poll, err := a.findPoll(c, c.Param("shareID"))
	if err == mongo.ErrNoDocuments {
		apiError(c, 404, "Poll not found")
		return
	}
	if err != nil {
		apiError(c, 500, "Could not load poll")
		return
	}
	a.addLiveCounts(c, &poll)
	if userID, ok := a.requestUserID(c); ok {
		poll.IsOwner = poll.OwnerID == userID
	}
	c.JSON(200, poll)
}

type voteInput struct {
	OptionID         string `json:"optionId"`
	PreviousOptionID string `json:"previousOptionId"`
}

func (a *App) vote(c *gin.Context) {
	poll, err := a.findPoll(c, c.Param("shareID"))
	if err == mongo.ErrNoDocuments {
		apiError(c, 404, "Poll not found")
		return
	}
	if err != nil {
		apiError(c, 500, "Could not load poll")
		return
	}
	var in voteInput
	if c.ShouldBindJSON(&in) != nil || in.OptionID == "" {
		apiError(c, 400, "Select a valid option")
		return
	}
	valid := false
	for _, option := range poll.Options {
		if option.ID == in.OptionID {
			valid = true
		}
	}
	if !valid {
		apiError(c, 400, "That option does not belong to this poll")
		return
	}
	if !poll.Active {
		apiError(c, 409, "This poll is closed")
		return
	}
	if in.PreviousOptionID != "" && in.PreviousOptionID != in.OptionID {
		previousValid := false
		for _, option := range poll.Options {
			if option.ID == in.PreviousOptionID {
				previousValid = true
				break
			}
		}
		if !previousValid {
			apiError(c, 400, "Previous option does not belong to this poll")
			return
		}
	}
	if in.PreviousOptionID == in.OptionID {
		current, err := a.cache.HGet(c, "poll:"+poll.ShareID, in.OptionID).Int64()
		if err != nil {
			apiError(c, 503, "Live voting is temporarily unavailable")
			return
		}
		c.JSON(200, gin.H{"optionId": in.OptionID, "votes": current})
		return
	}
	if in.PreviousOptionID != "" {
		if _, err := a.cache.HIncrBy(c, "poll:"+poll.ShareID, in.PreviousOptionID, -1).Result(); err != nil {
			apiError(c, 503, "Live voting is temporarily unavailable")
			return
		}
	}
	votes, err := a.cache.HIncrBy(c, "poll:"+poll.ShareID, in.OptionID, 1).Result()
	if err != nil {
		apiError(c, 503, "Live voting is temporarily unavailable")
		return
	}
	update := bson.M{"$inc": bson.M{"options.$[selected].votes": 1}}
	filters := []interface{}{bson.M{"selected.id": in.OptionID}}
	if in.PreviousOptionID != "" {
		update["$inc"].(bson.M)["options.$[previous].votes"] = -1
		filters = append(filters, bson.M{"previous.id": in.PreviousOptionID})
	}
	if _, err = a.db.Collection("polls").UpdateOne(c, bson.M{"shareId": poll.ShareID, "active": true}, update, options.Update().SetArrayFilters(options.ArrayFilters{Filters: filters})); err != nil {
		apiError(c, 500, "Could not save vote")
		return
	}
	now := time.Now()
	_ = a.cache.ZAdd(c, "poll:activity:"+poll.ShareID, redis.Z{Score: float64(now.Unix()), Member: randomID()}).Err()
	_ = a.cache.ZRemRangeByScore(c, "poll:activity:"+poll.ShareID, "-inf", strconv.FormatInt(now.Add(-15*time.Minute).Unix(), 10)).Err()
	events := []gin.H{{"optionId": in.OptionID, "votes": votes}}
	if in.PreviousOptionID != "" {
		previousVotes, previousErr := a.cache.HGet(c, "poll:"+poll.ShareID, in.PreviousOptionID).Int64()
		if previousErr == nil {
			events = append(events, gin.H{"optionId": in.PreviousOptionID, "votes": previousVotes})
		}
	}
	for _, update := range events {
		event, _ := json.Marshal(update)
		_ = a.cache.Publish(c, "poll-events:"+poll.ShareID, event).Err()
	}
	c.JSON(201, gin.H{"optionId": in.OptionID, "votes": votes})
}
func (a *App) insights(c *gin.Context) {
	poll, err := a.findPoll(c, c.Param("shareID"))
	if err == mongo.ErrNoDocuments {
		apiError(c, 404, "Poll not found")
		return
	}
	if err != nil {
		apiError(c, 500, "Could not load poll")
		return
	}
	userID, ok := a.requestUserID(c)
	if !ok || poll.OwnerID != userID {
		apiError(c, 403, "Only the owner can view poll insights")
		return
	}
	a.addLiveCounts(c, &poll)
	lastMinute, err := a.cache.ZCount(c, "poll:activity:"+poll.ShareID, strconv.FormatInt(time.Now().Add(-time.Minute).Unix(), 10), "+inf").Result()
	if err != nil {
		lastMinute = 0
	}
	leader := poll.Options[0]
	for _, option := range poll.Options[1:] {
		if option.Votes > leader.Votes {
			leader = option
		}
	}
	total := int64(0)
	for _, option := range poll.Options {
		total += option.Votes
	}
	c.JSON(200, gin.H{"responsesLastMinute": lastMinute, "total": total, "leader": leader.Text, "leaderVotes": leader.Votes})
}
func (a *App) live(c *gin.Context) {
	if _, err := a.findPoll(c, c.Param("shareID")); err != nil {
		apiError(c, 404, "Poll not found")
		return
	}
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()
	subscription := a.cache.Subscribe(c, "poll-events:"+c.Param("shareID"))
	defer subscription.Close()
	events := subscription.Channel()
	for {
		select {
		case event := <-events:
			if event == nil {
				return
			}
			if conn.WriteMessage(websocket.TextMessage, []byte(event.Payload)) != nil {
				return
			}
		case <-c.Request.Context().Done():
			return
		}
	}
}
func (a *App) myPolls(c *gin.Context) {
	cursor, err := a.db.Collection("polls").Find(c, bson.M{"ownerId": ownerID(c)}, options.Find().SetSort(bson.M{"createdAt": -1}))
	if err != nil {
		apiError(c, 500, "Could not load polls")
		return
	}
	defer cursor.Close(c)
	polls := []model.Poll{}
	if cursor.All(c, &polls) != nil {
		apiError(c, 500, "Could not read polls")
		return
	}
	for i := range polls {
		a.addLiveCounts(c, &polls[i])
	}
	c.JSON(200, polls)
}

func (a *App) pollStats(c *gin.Context) {
	userID := ownerID(c)
	var user model.User
	if err := a.db.Collection("users").FindOne(c, bson.M{"_id": userID}).Decode(&user); err != nil {
		apiError(c, 500, "Could not load poll statistics")
		return
	}
	currentPolls, err := a.db.Collection("polls").Find(c, bson.M{"ownerId": userID})
	if err != nil {
		apiError(c, 500, "Could not load poll statistics")
		return
	}
	defer currentPolls.Close(c)
	active, deactivated, totalVotes := int64(0), int64(0), int64(0)
	for currentPolls.Next(c) {
		var poll model.Poll
		if currentPolls.Decode(&poll) != nil {
			apiError(c, 500, "Could not read poll statistics")
			return
		}
		if poll.Active {
			active++
		} else {
			deactivated++
		}
		for _, option := range poll.Options {
			totalVotes += option.Votes
		}
	}
	if err := currentPolls.Err(); err != nil {
		apiError(c, 500, "Could not read poll statistics")
		return
	}
	created := user.PollsCreated
	if created < active+deactivated {
		created = active + deactivated
	}
	c.JSON(200, gin.H{"created": created, "active": active, "deactivated": deactivated, "totalVotes": totalVotes})
}
func (a *App) closePoll(c *gin.Context) {
	poll, err := a.findPoll(c, c.Param("shareID"))
	if err == mongo.ErrNoDocuments {
		apiError(c, 404, "Poll not found")
		return
	}
	if err != nil {
		apiError(c, 500, "Could not load poll")
		return
	}
	if poll.OwnerID != ownerID(c) {
		apiError(c, 403, "Only the owner can close this poll")
		return
	}
	if _, err := a.db.Collection("polls").UpdateOne(c, bson.M{"shareId": poll.ShareID}, bson.M{"$set": bson.M{"active": false}}); err != nil {
		apiError(c, 500, "Could not close poll")
		return
	}
	c.JSON(200, gin.H{"active": false})
}

func (a *App) activatePoll(c *gin.Context) {
	poll, err := a.findPoll(c, c.Param("shareID"))
	if err == mongo.ErrNoDocuments {
		apiError(c, 404, "Poll not found")
		return
	}
	if err != nil {
		apiError(c, 500, "Could not load poll")
		return
	}
	if poll.OwnerID != ownerID(c) {
		apiError(c, 403, "Only the owner can activate this poll")
		return
	}
	if _, err := a.db.Collection("polls").UpdateOne(c, bson.M{"shareId": poll.ShareID, "ownerId": ownerID(c)}, bson.M{"$set": bson.M{"active": true}}); err != nil {
		apiError(c, 500, "Could not activate poll")
		return
	}
	c.JSON(200, gin.H{"active": true})
}

func (a *App) deletePoll(c *gin.Context) {
	poll, err := a.findPoll(c, c.Param("shareID"))
	if err == mongo.ErrNoDocuments {
		apiError(c, 404, "Poll not found")
		return
	}
	if err != nil {
		apiError(c, 500, "Could not load poll")
		return
	}
	if poll.OwnerID != ownerID(c) {
		apiError(c, 403, "Only the owner can delete this poll")
		return
	}
	if _, err := a.db.Collection("polls").DeleteOne(c, bson.M{"shareId": poll.ShareID, "ownerId": ownerID(c)}); err != nil {
		apiError(c, 500, "Could not delete poll")
		return
	}
	_ = a.cache.Del(c, "poll:"+poll.ShareID, "poll:activity:"+poll.ShareID).Err()
	c.JSON(http.StatusOK, gin.H{"deleted": true})
}
