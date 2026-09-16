package http

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	"pulseboard/api/internal/model"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"golang.org/x/crypto/bcrypt"
)

type App struct {
	db     *mongo.Database
	cache  *redis.Client
	secret []byte
}

func New(db *mongo.Database, cache *redis.Client, secret string) *App {
	return &App{db: db, cache: cache, secret: []byte(secret)}
}
func (a *App) Register(r *gin.Engine) {
	r.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"ok": true}) })
	api := r.Group("/api")
	api.POST("/auth/signup", a.signup)
	api.POST("/auth/login", a.login)
	api.GET("/polls/:shareID", a.getPoll)
	api.GET("/polls/:shareID/insights", a.insights)
	api.POST("/polls/:shareID/votes", a.vote)
	api.GET("/polls/:shareID/live", a.live)
	authed := api.Group("", a.auth())
	authed.POST("/polls", a.createPoll)
	authed.GET("/polls/mine", a.myPolls)
	authed.GET("/polls/stats", a.pollStats)
	authed.POST("/polls/:shareID/close", a.closePoll)
	authed.POST("/polls/:shareID/activate", a.activatePoll)
	authed.DELETE("/polls/:shareID", a.deletePoll)
}
func apiError(c *gin.Context, status int, message string) { c.JSON(status, gin.H{"error": message}) }
func randomID() string                                    { b := make([]byte, 12); _, _ = rand.Read(b); return hex.EncodeToString(b) }
func (a *App) auth() gin.HandlerFunc {
	return func(c *gin.Context) {
		raw := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
		token, err := jwt.Parse(raw, func(t *jwt.Token) (interface{}, error) { return a.secret, nil })
		if err != nil || !token.Valid {
			apiError(c, 401, "Authentication required")
			c.Abort()
			return
		}
		claims, ok := token.Claims.(jwt.MapClaims)
		id, ok2 := claims["sub"].(string)
		if !ok || !ok2 {
			apiError(c, 401, "Invalid session")
			c.Abort()
			return
		}
		c.Set("userID", id)
		c.Next()
	}
}
func (a *App) requestUserID(c *gin.Context) (primitive.ObjectID, bool) {
	raw := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
	token, err := jwt.Parse(raw, func(t *jwt.Token) (interface{}, error) { return a.secret, nil })
	if err != nil || !token.Valid {
		return primitive.NilObjectID, false
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	id, ok := claims["sub"].(string)
	if !ok {
		return primitive.NilObjectID, false
	}
	parsed, err := primitive.ObjectIDFromHex(id)
	return parsed, err == nil
}
func (a *App) issue(user model.User) (string, error) {
	return jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"sub": user.ID.Hex(), "exp": time.Now().Add(7 * 24 * time.Hour).Unix()}).SignedString(a.secret)
}

type authInput struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

func validEmail(v string) bool {
	return len(v) <= 254 && strings.Count(v, "@") == 1 && !strings.HasPrefix(v, "@") && !strings.HasSuffix(v, "@")
}
func (a *App) signup(c *gin.Context) {
	var in authInput
	if c.ShouldBindJSON(&in) != nil || len(strings.TrimSpace(in.Name)) < 2 || !validEmail(in.Email) || len(in.Password) < 8 {
		apiError(c, 400, "Provide a name, valid email, and password of at least 8 characters")
		return
	}
	hash, _ := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	user := model.User{Name: strings.TrimSpace(in.Name), Email: strings.ToLower(strings.TrimSpace(in.Email)), PasswordHash: string(hash)}
	result, err := a.db.Collection("users").InsertOne(c, user)
	if mongo.IsDuplicateKeyError(err) {
		apiError(c, 409, "An account already exists for this email")
		return
	}
	if err != nil {
		apiError(c, 500, "Could not create account")
		return
	}
	user.ID = result.InsertedID.(primitive.ObjectID)
	token, _ := a.issue(user)
	c.JSON(201, gin.H{"token": token, "user": gin.H{"name": user.Name, "email": user.Email}})
}
func (a *App) login(c *gin.Context) {
	var in authInput
	if c.ShouldBindJSON(&in) != nil || !validEmail(in.Email) || in.Password == "" {
		apiError(c, 400, "Email and password are required")
		return
	}
	var user model.User
	err := a.db.Collection("users").FindOne(c, bson.M{"email": strings.ToLower(strings.TrimSpace(in.Email))}).Decode(&user)
	if err != nil || bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(in.Password)) != nil {
		apiError(c, 401, "Incorrect email or password")
		return
	}
	token, _ := a.issue(user)
	c.JSON(200, gin.H{"token": token, "user": gin.H{"name": user.Name, "email": user.Email}})
}
func (a *App) findPoll(c context.Context, shareID string) (model.Poll, error) {
	var poll model.Poll
	err := a.db.Collection("polls").FindOne(c, bson.M{"shareId": shareID}).Decode(&poll)
	return poll, err
}
func ownerID(c *gin.Context) primitive.ObjectID {
	id, _ := primitive.ObjectIDFromHex(c.MustGet("userID").(string))
	return id
}
