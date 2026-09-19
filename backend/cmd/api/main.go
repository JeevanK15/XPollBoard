package main

import (
	"context"
	"log"
	"os"
	"strings"
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

func serviceEnv(key, fallback string, production bool) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	if production {
		log.Fatalf("missing required environment variable %s; configure it with the address of the managed service", key)
	}
	return fallback
}

func redisOptions(production bool) *redis.Options {
	if redisURL := os.Getenv("REDIS_URL"); redisURL != "" {
		options, err := redis.ParseURL(redisURL)
		if err != nil {
			log.Fatalf("invalid REDIS_URL: %v", err)
		}
		return options
	}
	return &redis.Options{Addr: serviceEnv("REDIS_ADDR", "localhost:6379", production)}
}

func main() {
	production := strings.EqualFold(env("APP_ENV", "development"), "production") || strings.EqualFold(os.Getenv("RENDER"), "true")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	mongoClient, err := mongo.Connect(ctx, options.Client().ApplyURI(serviceEnv("MONGO_URI", "mongodb://localhost:27017", production)))
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
	redisClient := redis.NewClient(redisOptions(production))
	if err = redisClient.Ping(ctx).Err(); err != nil {
		log.Fatal(err)
	}

	app := http.New(mongoClient.Database(env("MONGO_DATABASE", "pulseboard")), redisClient, serviceEnv("JWT_SECRET", "development-only-secret", production))
	router := gin.New()
	configuredOrigin := env("CORS_ORIGIN", "http://localhost:5173")
	router.Use(gin.Logger(), gin.Recovery(), cors.New(cors.Config{
		AllowOriginFunc: func(origin string) bool {
			return origin == configuredOrigin || origin == "http://localhost:5173" || origin == "http://localhost:5174" || origin == "http://127.0.0.1:5173" || origin == "http://127.0.0.1:5174"
		},
		AllowMethods:     []string{"GET", "POST", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))
	app.Register(router)
	log.Printf("Pulseboard API listening on :%s", env("PORT", "8080"))
	if err := router.Run(":" + env("PORT", "8080")); err != nil {
		log.Fatal(err)
	}
}
