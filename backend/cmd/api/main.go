package main

import (
	"context"
	"log"
	"os"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"pulseboard/api/internal/http"
)

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	mongoClient, err := mongo.Connect(ctx, options.Client().ApplyURI(env("MONGO_URI", "mongodb://localhost:27017")))
	if err != nil {
		log.Fatal(err)
	}
	if err = mongoClient.Ping(ctx, nil); err != nil {
		log.Fatal(err)
	}
	_, err = mongoClient.Database(env("MONGO_DATABASE", "pulseboard")).Collection("users").Indexes().CreateOne(ctx, mongo.IndexModel{Keys: bson.D{{Key: "email", Value: 1}}, Options: options.Index().SetUnique(true)})
	if err != nil {
		log.Fatal(err)
	}
	redisClient := redis.NewClient(&redis.Options{Addr: env("REDIS_ADDR", "localhost:6379")})
	if err = redisClient.Ping(ctx).Err(); err != nil {
		log.Fatal(err)
	}

	app := http.New(mongoClient.Database(env("MONGO_DATABASE", "pulseboard")), redisClient, env("JWT_SECRET", "development-only-secret"))
	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery(), cors.New(cors.Config{AllowOrigins: []string{env("CORS_ORIGIN", "http://localhost:5173")}, AllowMethods: []string{"GET", "POST", "DELETE", "OPTIONS"}, AllowHeaders: []string{"Authorization", "Content-Type"}, AllowCredentials: true, MaxAge: 12 * time.Hour}))
	app.Register(router)
	log.Printf("Pulseboard API listening on :%s", env("PORT", "8080"))
	if err := router.Run(":" + env("PORT", "8080")); err != nil {
		log.Fatal(err)
	}
}
