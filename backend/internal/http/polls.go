package http

import (
	"encoding/json"
	"fmt"
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
	"golang.org/x/crypto/bcrypt"
)

type createInput struct {
	Question      string   `json:"question"`
	Options       []string `json:"options"`
	Template      string   `json:"template"`
	Visibility    string   `json:"visibility"`
	Password      string   `json:"password"`
	InviteCode    string   `json:"inviteCode"`
	AllowComments bool     `json:"allowComments"`
	AllowMultiple bool     `json:"allowMultiple"`
	MaxSelections int      `json:"maxSelections"`
}

type updateInput struct {
	Question      string         `json:"question"`
	Options       []updateOption `json:"options"`
	Template      string         `json:"template"`
	Visibility    string         `json:"visibility"`
	Password      string         `json:"password"`
	InviteCode    string         `json:"inviteCode"`
	AllowComments bool           `json:"allowComments"`
	AllowMultiple bool           `json:"allowMultiple"`
	MaxSelections int            `json:"maxSelections"`
}

type reactionInput struct {
	Emoji string `json:"emoji"`
}

type commentInput struct {
	UserName string `json:"userName"`
	Message  string `json:"message"`
}

type updateOption struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

func (a *App) createPoll(c *gin.Context) {
	var in createInput
	if c.ShouldBindJSON(&in) != nil || len(strings.TrimSpace(in.Question)) < 5 || len(in.Question) > 280 || len(in.Options) < 2 || len(in.Options) > 10 {
		apiError(c, 400, "Question must be 5-280 characters with 2-10 options")
		return
	}
	visibility := strings.ToLower(strings.TrimSpace(in.Visibility))
	if visibility == "" {
		visibility = "public"
	}
	if visibility != "public" && visibility != "private" {
		apiError(c, 400, "Visibility must be public or private")
		return
	}
	template := strings.TrimSpace(in.Template)
	if template == "" {
		template = "multiple-choice"
	}
	maxSelections, err := selectionLimit(in.AllowMultiple, in.MaxSelections, len(in.Options))
	if err != nil {
		apiError(c, 400, err.Error())
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
	poll := model.Poll{
		OwnerID:       ownerID(c),
		ShareID:       randomID(),
		Question:      strings.TrimSpace(in.Question),
		Options:       options,
		Active:        true,
		CreatedAt:     time.Now().Unix(),
		Template:      template,
		Visibility:    visibility,
		AllowMultiple: in.AllowMultiple,
		MaxSelections: maxSelections,
		InviteCode:    strings.TrimSpace(in.InviteCode),
		AllowComments: in.AllowComments,
		Comments:      []model.Comment{},
		Reactions:     map[string]int64{"👍": 0, "😄": 0, "🎯": 0, "🚀": 0},
	}
	if visibility == "private" {
		if len(strings.TrimSpace(in.Password)) < 4 {
			apiError(c, 400, "Private polls need a password of at least 4 characters")
			return
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
		if err != nil {
			apiError(c, 500, "Could not secure private poll")
			return
		}
		poll.PasswordHash = string(hash)
	}
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

func (a *App) updatePoll(c *gin.Context) {
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
		apiError(c, 403, "Only the owner can edit this poll")
		return
	}
	var in updateInput
	if c.ShouldBindJSON(&in) != nil || len(strings.TrimSpace(in.Question)) < 5 || len(in.Question) > 280 || len(in.Options) < 2 || len(in.Options) > 10 {
		apiError(c, 400, "Question must be 5-280 characters with 2-10 options")
		return
	}
	maxSelections, err := selectionLimit(in.AllowMultiple, in.MaxSelections, len(in.Options))
	if err != nil {
		apiError(c, 400, err.Error())
		return
	}
	existing := map[string]model.Option{}
	for _, option := range poll.Options {
		existing[option.ID] = option
	}
	seen := map[string]bool{}
	updated := make([]model.Option, 0, len(in.Options))
	for _, raw := range in.Options {
		text := strings.TrimSpace(raw.Text)
		key := strings.ToLower(text)
		if len(text) < 1 || len(text) > 80 || seen[key] {
			apiError(c, 400, "Options must be unique and 1-80 characters")
			return
		}
		seen[key] = true
		if raw.ID != "" {
			option, ok := existing[raw.ID]
			if !ok {
				apiError(c, 400, "That option does not belong to this poll")
				return
			}
			option.Text = text
			updated = append(updated, option)
			delete(existing, raw.ID)
		} else {
			updated = append(updated, model.Option{ID: randomID()[:8], Text: text})
		}
	}
	for _, removed := range existing {
		if removed.Votes > 0 {
			apiError(c, 409, "Options with votes cannot be removed")
			return
		}
	}
	if _, err := a.db.Collection("polls").UpdateOne(c, bson.M{"shareId": poll.ShareID, "ownerId": ownerID(c)}, bson.M{"$set": bson.M{"question": strings.TrimSpace(in.Question), "options": updated, "allowComments": in.AllowComments, "allowMultiple": in.AllowMultiple, "maxSelections": maxSelections}}); err != nil {
		apiError(c, 500, "Could not update poll")
		return
	}

	values := map[string]interface{}{}
	for _, option := range updated {
		values[option.ID] = option.Votes
	}
	if err := a.cache.HSet(c, "poll:"+poll.ShareID, values).Err(); err != nil {
		apiError(c, 503, "Poll updated but live cache could not refresh")
		return
	}
	for _, removed := range existing {
		_ = a.cache.HDel(c, "poll:"+poll.ShareID, removed.ID).Err()
	}
	poll.Question = strings.TrimSpace(in.Question)
	poll.Options = updated
	poll.AllowComments = in.AllowComments
	poll.AllowMultiple = in.AllowMultiple
	poll.MaxSelections = maxSelections
	c.JSON(http.StatusOK, poll)
}

func selectionLimit(allowMultiple bool, requested, optionCount int) (int, error) {
	if !allowMultiple {
		return 1, nil
	}
	if requested < 2 || requested > optionCount {
		return 0, fmt.Errorf("Maximum selections must be between 2 and the number of choices")
	}
	return requested, nil
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

func (a *App) accessPoll(c *gin.Context) {
	poll, err := a.findPoll(c, c.Param("shareID"))
	if err == mongo.ErrNoDocuments {
		apiError(c, 404, "Poll not found")
		return
	}
	if err != nil {
		apiError(c, 500, "Could not load poll")
		return
	}
	if poll.Visibility != "private" {
		c.JSON(200, gin.H{"granted": true})
		return
	}
	var in struct {
		Password string `json:"password"`
	}
	if c.ShouldBindJSON(&in) != nil {
		apiError(c, 400, "Password is required")
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(poll.PasswordHash), []byte(in.Password)) != nil {
		apiError(c, 403, "This poll is private. Enter the correct password.")
		return
	}
	c.JSON(200, gin.H{"granted": true})
}

type voteInput struct {
	OptionID          string   `json:"optionId"`
	PreviousOptionID  string   `json:"previousOptionId"`
	OptionIDs         []string `json:"optionIds"`
	PreviousOptionIDs []string `json:"previousOptionIds"`
}

func (a *App) getComments(c *gin.Context) {
	poll, err := a.findPoll(c, c.Param("shareID"))
	if err == mongo.ErrNoDocuments {
		apiError(c, 404, "Poll not found")
		return
	}
	if err != nil {
		apiError(c, 500, "Could not load comments")
		return
	}
	c.JSON(200, gin.H{"comments": poll.Comments})
}

func (a *App) addComment(c *gin.Context) {
	poll, err := a.findPoll(c, c.Param("shareID"))
	if err == mongo.ErrNoDocuments {
		apiError(c, 404, "Poll not found")
		return
	}
	if err != nil {
		apiError(c, 500, "Could not load poll")
		return
	}
	var in commentInput
	if c.ShouldBindJSON(&in) != nil || len(strings.TrimSpace(in.Message)) < 2 || len(strings.TrimSpace(in.Message)) > 280 {
		apiError(c, 400, "Comment must be 2-280 characters")
		return
	}
	if poll.AllowComments {
		if _, ok := a.requestUserID(c); !ok {
			apiError(c, 401, "Sign in to comment on this poll")
			return
		}
	}
	name := strings.TrimSpace(in.UserName)
	if name == "" {
		name = "Guest"
	}
	comment := model.Comment{ID: randomID()[:10], UserName: name, Message: strings.TrimSpace(in.Message), CreatedAt: time.Now().Unix()}
	poll.Comments = append(poll.Comments, comment)
	if _, err := a.db.Collection("polls").UpdateOne(c, bson.M{"shareId": poll.ShareID}, bson.M{"$set": bson.M{"comments": poll.Comments}}); err != nil {
		apiError(c, 500, "Could not save comment")
		return
	}
	c.JSON(201, comment)
}

func (a *App) getReactions(c *gin.Context) {
	poll, err := a.findPoll(c, c.Param("shareID"))
	if err == mongo.ErrNoDocuments {
		apiError(c, 404, "Poll not found")
		return
	}
	if err != nil {
		apiError(c, 500, "Could not load reactions")
		return
	}
	if poll.Reactions == nil {
		poll.Reactions = map[string]int64{"👍": 0, "😄": 0, "🎯": 0, "🚀": 0}
	}
	c.JSON(200, gin.H{"reactions": poll.Reactions})
}

func (a *App) addReaction(c *gin.Context) {
	poll, err := a.findPoll(c, c.Param("shareID"))
	if err == mongo.ErrNoDocuments {
		apiError(c, 404, "Poll not found")
		return
	}
	if err != nil {
		apiError(c, 500, "Could not load poll")
		return
	}
	var in reactionInput
	if c.ShouldBindJSON(&in) != nil || in.Emoji == "" {
		apiError(c, 400, "Choose a reaction")
		return
	}
	if poll.Reactions == nil {
		poll.Reactions = map[string]int64{"👍": 0, "😄": 0, "🎯": 0, "🚀": 0}
	}
	if _, ok := poll.Reactions[in.Emoji]; !ok {
		poll.Reactions[in.Emoji] = 0
	}
	poll.Reactions[in.Emoji]++
	if _, err := a.db.Collection("polls").UpdateOne(c, bson.M{"shareId": poll.ShareID}, bson.M{"$set": bson.M{"reactions": poll.Reactions}}); err != nil {
		apiError(c, 500, "Could not save reaction")
		return
	}
	c.JSON(200, gin.H{"reactions": poll.Reactions})
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
	if c.ShouldBindJSON(&in) != nil {
		apiError(c, 400, "Select a valid option")
		return
	}
	selected := uniqueIDs(in.OptionIDs)
	previous := uniqueIDs(in.PreviousOptionIDs)
	if len(selected) == 0 && in.OptionID != "" {
		selected = []string{in.OptionID}
	}
	if len(previous) == 0 && in.PreviousOptionID != "" {
		previous = []string{in.PreviousOptionID}
	}
	if len(selected) == 0 {
		apiError(c, 400, "Select a valid option")
		return
	}
	if poll.AllowComments {
		if _, ok := a.requestUserID(c); !ok {
			apiError(c, 401, "Sign in to vote on this poll")
			return
		}
	}
	validIDs := map[string]bool{}
	for _, option := range poll.Options {
		validIDs[option.ID] = true
	}
	for _, optionID := range append(selected, previous...) {
		if !validIDs[optionID] {
			apiError(c, 400, "That option does not belong to this poll")
			return
		}
	}
	if !poll.AllowMultiple && len(selected) != 1 {
		apiError(c, 400, "This poll accepts one choice")
		return
	}
	maxSelections := poll.MaxSelections
	if maxSelections < 1 {
		maxSelections = 1
	}
	if len(selected) > maxSelections {
		apiError(c, 400, fmt.Sprintf("Choose up to %d options", maxSelections))
		return
	}
	if !poll.Active {
		apiError(c, 409, "This poll is closed")
		return
	}
	selectedSet := map[string]bool{}
	for _, optionID := range selected {
		selectedSet[optionID] = true
	}
	removed := make([]string, 0, len(previous))
	for _, optionID := range previous {
		if !selectedSet[optionID] {
			removed = append(removed, optionID)
		}
	}
	added := make([]string, 0, len(selected))
	previousSet := map[string]bool{}
	for _, optionID := range previous {
		previousSet[optionID] = true
	}
	for _, optionID := range selected {
		if !previousSet[optionID] {
			added = append(added, optionID)
		}
	}
	if len(removed) == 0 && len(added) == 0 {
		c.JSON(200, gin.H{"optionIds": selected})
		return
	}
	for _, optionID := range removed {
		if _, err := a.cache.HIncrBy(c, "poll:"+poll.ShareID, optionID, -1).Result(); err != nil {
			apiError(c, 503, "Live voting is temporarily unavailable")
			return
		}
	}
	for _, optionID := range added {
		if _, err := a.cache.HIncrBy(c, "poll:"+poll.ShareID, optionID, 1).Result(); err != nil {
			apiError(c, 503, "Live voting is temporarily unavailable")
			return
		}
	}
	inc := bson.M{}
	filters := []interface{}{}
	for index, optionID := range added {
		name := fmt.Sprintf("selected%d", index)
		inc["options.$["+name+"].votes"] = 1
		filters = append(filters, bson.M{name + ".id": optionID})
	}
	for index, optionID := range removed {
		name := fmt.Sprintf("previous%d", index)
		inc["options.$["+name+"].votes"] = -1
		filters = append(filters, bson.M{name + ".id": optionID})
	}
	if _, err = a.db.Collection("polls").UpdateOne(c, bson.M{"shareId": poll.ShareID, "active": true}, bson.M{"$inc": inc}, options.Update().SetArrayFilters(options.ArrayFilters{Filters: filters})); err != nil {
		apiError(c, 500, "Could not save vote")
		return
	}
	now := time.Now()
	_ = a.cache.ZAdd(c, "poll:activity:"+poll.ShareID, redis.Z{Score: float64(now.Unix()), Member: randomID()}).Err()
	_ = a.cache.ZRemRangeByScore(c, "poll:activity:"+poll.ShareID, "-inf", strconv.FormatInt(now.Add(-15*time.Minute).Unix(), 10)).Err()
	events := []gin.H{}
	for _, optionID := range append(added, removed...) {
		if current, readErr := a.cache.HGet(c, "poll:"+poll.ShareID, optionID).Int64(); readErr == nil {
			events = append(events, gin.H{"optionId": optionID, "votes": current})
		}
	}
	for _, update := range events {
		event, _ := json.Marshal(update)
		_ = a.cache.Publish(c, "poll-events:"+poll.ShareID, event).Err()
	}
	c.JSON(201, gin.H{"optionIds": selected})
}

func uniqueIDs(ids []string) []string {
	seen := map[string]bool{}
	result := make([]string, 0, len(ids))
	for _, id := range ids {
		if id != "" && !seen[id] {
			seen[id] = true
			result = append(result, id)
		}
	}
	return result
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
	leader := model.Option{}
	if len(poll.Options) > 0 {
		leader = poll.Options[0]
	}
	second := model.Option{}
	for _, option := range poll.Options {
		if option.Votes > leader.Votes {
			second = leader
			leader = option
			continue
		}
		if second.Votes < option.Votes && option.ID != leader.ID {
			second = option
		}
	}
	total := int64(0)
	for _, option := range poll.Options {
		total += option.Votes
	}
	winnerPercent := int64(0)
	if total > 0 {
		winnerPercent = int64((float64(leader.Votes) / float64(total)) * 100)
	}
	margin := int64(0)
	if leader.Votes > 0 && second.Votes > 0 {
		margin = leader.Votes - second.Votes
	}
	closeRace := second.Votes > 0 && leader.Votes-second.Votes <= max(2, int64(float64(total)*0.12))
	engagement := "low"
	switch {
	case lastMinute >= 5:
		engagement = "high"
	case lastMinute >= 2:
		engagement = "steady"
	}
	summary := "No votes yet — this poll is waiting for its first responder."
	switch {
	case total == 0:
		summary = "No votes yet — this poll is waiting for its first responder."
	case closeRace && total > 0:
		summary = "This is a close race. The top two choices are nearly tied and the outcome can still shift."
	case leader.Votes == total && total > 0:
		summary = "This poll has a clear winner and the room is already aligned behind one option."
	case winnerPercent >= 60:
		summary = "The current leader is pulling away and is clearly setting the tone for the room."
	case winnerPercent >= 45:
		summary = "The room is leaning toward one option, but there is still enough split sentiment to keep it interesting."
	default:
		summary = "Responses are spread across the board, which suggests the audience is still deciding."
	}
	c.JSON(200, gin.H{
		"responsesLastMinute": lastMinute,
		"total":               total,
		"leader":              leader.Text,
		"leaderVotes":         leader.Votes,
		"winnerPercent":       winnerPercent,
		"margin":              margin,
		"closeRace":           closeRace,
		"engagement":          engagement,
		"summary":             summary,
	})
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
