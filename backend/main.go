package main

import (
	"log"
	"openquiz/config"
	"openquiz/handlers"
	"openquiz/middleware"
	"openquiz/models"
	"openquiz/routes"
	"openquiz/services"

	"github.com/gin-gonic/gin"
)

func main() {
	// Load configuration
	cfg := config.Load()

	// Initialize database
	db, err := config.InitDB(cfg)
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	// Auto-migrate database models
	err = db.AutoMigrate(
		&models.User{},
		&models.Quiz{},
		&models.Question{},
		&models.Option{},
		&models.Game{},
		&models.Player{},
		&models.GameAnswer{},
	)
	if err != nil {
		log.Fatal("Failed to migrate database:", err)
	}

	// Initialize Redis
	redisClient := config.InitRedis(cfg)

	// Initialize services
	authService := services.NewAuthService(db, cfg.JWTSecret)
	quizService := services.NewQuizService(db)
	gameService := services.NewGameService(db, redisClient)

	// Initialize WebSocket hub
	hub := services.NewHub(gameService)
	go hub.Run()

	// Initialize handlers
	authHandler := handlers.NewAuthHandler(authService)
	quizHandler := handlers.NewQuizHandler(quizService)
	gameHandler := handlers.NewGameHandler(gameService, hub)

	// Setup Gin router
	router := gin.Default()

	// Add CORS middleware
	router.Use(middleware.CORS())

	// Setup routes
	routes.SetupRoutes(router, authHandler, quizHandler, gameHandler, hub, gameService, cfg.JWTSecret)

	// Start server
	log.Printf("Server starting on port %s", cfg.Port)
	if err := router.Run(":" + cfg.Port); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}
