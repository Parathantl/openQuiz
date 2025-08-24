package routes

import (
	"fmt"
	"log"
	"net/http"
	"strings"

	"openquiz/handlers"
	"openquiz/middleware"
	"openquiz/services"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for development
	},
}

func SetupRoutes(
	router *gin.Engine,
	authHandler *handlers.AuthHandler,
	quizHandler *handlers.QuizHandler,
	gameHandler *handlers.GameHandler,
	hub *services.Hub,
	gameService *services.GameService,
	jwtSecret string,
) {
	// API routes
	api := router.Group("/api")
	{
		// Auth routes (public)
		auth := api.Group("/auth")
		{
			auth.POST("/register", authHandler.Register)
			auth.POST("/login", authHandler.Login)
		}

		// Protected routes
		protected := api.Group("/")
		protected.Use(middleware.AuthMiddleware(jwtSecret))
		{
			// User profile
			protected.GET("/auth/profile", authHandler.GetProfile)

			// Quiz routes
			quizzes := protected.Group("/quizzes")
			{
				quizzes.GET("", quizHandler.GetUserQuizzes)
				quizzes.POST("", quizHandler.CreateQuiz)
				quizzes.GET("/:id", quizHandler.GetQuizByID)
				quizzes.PUT("/:id", quizHandler.UpdateQuiz)
				quizzes.DELETE("/:id", quizHandler.DeleteQuiz)
			}

			// Game routes
			games := protected.Group("/games")
			{
				games.POST("", gameHandler.StartGame)
				games.POST("/:pin/start", gameHandler.StartQuiz)
				games.POST("/:pin/next", gameHandler.NextQuestion)
			}
		}

		// Public game routes
		games := api.Group("/games")
		{
			games.POST("/:pin/join", gameHandler.JoinGame)
			games.GET("/:pin", gameHandler.GetGameByPin)
			games.POST("/:pin/answer", gameHandler.SubmitAnswer)
		}
	}

	// WebSocket endpoint for real-time game communication
	router.GET("/ws/:gamePin/:playerID", func(c *gin.Context) {
		gamePin := strings.ToLower(c.Param("gamePin")) // Normalize game pin to lowercase
		playerIDStr := c.Param("playerID")
		playerName := c.Query("playerName") // Get player name from query parameter

		log.Printf("WebSocket connection attempt - Game: %s, PlayerID: %s, PlayerName: %s", gamePin, playerIDStr, playerName)

		// Parse player ID (can be either user ID for host or player ID for players)
		var playerID uint
		log.Printf("Attempting to parse player ID string '%s' to uint for game %s", playerIDStr, gamePin)
		if _, err := fmt.Sscanf(playerIDStr, "%d", &playerID); err != nil {
			log.Printf("Failed to parse player ID '%s' for game %s: %v", playerIDStr, gamePin, err)
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid player ID"})
			return
		}
		log.Printf("Successfully parsed player ID: %s -> %d (uint) for game %s", playerIDStr, playerID, gamePin)

		// Validate that the player exists in the game
		// This prevents unauthorized access to game WebSocket
		if err := validatePlayerAccess(gameService, gamePin, playerID); err != nil {
			log.Printf("Player access validation failed for game %s, player %d: %v", gamePin, playerID, err)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Player not found in game"})
			return
		}

		// Upgrade HTTP connection to WebSocket
		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			log.Printf("WebSocket upgrade failed for game %s, player %s: %v", gamePin, playerIDStr, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upgrade connection"})
			return
		}

		// If no player name provided, try to get it from the game service
		if playerName == "" {
			// Get player name from the game service
			if player, err := gameService.GetPlayerByID(playerID); err == nil {
				playerName = player.Name
				log.Printf("Retrieved player name '%s' for player %d in game %s", playerName, playerID, gamePin)
			} else {
				playerName = "Unknown Player"
				log.Printf("Could not retrieve player name for player %d in game %s, using default", playerName, playerID, gamePin)
			}
		}

		log.Printf("WebSocket connection established successfully for game %s, player %d (%s)", gamePin, playerID, playerName)

		// Register client with hub - this will handle all message processing
		hub.RegisterClient(conn, gamePin, playerID, playerName)
	})

	// Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})
}

// validatePlayerAccess checks if a player has access to a specific game
func validatePlayerAccess(gameService *services.GameService, gamePin string, playerID uint) error {
	// Normalize game pin to lowercase for consistent comparison
	gamePin = strings.ToLower(gamePin)

	// First check if the game exists
	game, err := gameService.GetGameByPin(gamePin)
	if err != nil {
		return fmt.Errorf("game not found: %v", err)
	}

	// Check if the player exists in this game
	for _, player := range game.Players {
		if player.ID == playerID {
			return nil // Player found in game
		}
	}

	// If player not found in game.Players, check if this might be the host (quiz creator)
	// The host would have a user ID that matches the quiz creator's user_id
	if game.Quiz.UserID == playerID {
		return nil // Host found
	}

	return fmt.Errorf("player %d not found in game %s", playerID, gamePin)
}
