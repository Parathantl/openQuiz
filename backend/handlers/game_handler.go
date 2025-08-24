package handlers

import (
	"log"
	"net/http"
	"strings"

	"openquiz/services"

	"github.com/gin-gonic/gin"
)

type GameHandler struct {
	gameService *services.GameService
	hub         *services.Hub
}

func NewGameHandler(gameService *services.GameService, hub *services.Hub) *GameHandler {
	return &GameHandler{
		gameService: gameService,
		hub:         hub,
	}
}

func (h *GameHandler) StartGame(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var req services.StartGameRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	game, err := h.gameService.StartGame(userID.(uint), &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, game)
}

func (h *GameHandler) JoinGame(c *gin.Context) {
	var req services.JoinGameRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	player, err := h.gameService.JoinGame(&req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Broadcast player update to all connected clients in this game
	if h.hub != nil {
		h.hub.BroadcastPlayerUpdate(req.Pin, *player, "joined")
	}

	c.JSON(http.StatusOK, player)
}

func (h *GameHandler) GetGameByPin(c *gin.Context) {
	pin := c.Param("pin")
	if pin == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Game PIN required"})
		return
	}

	// Normalize pin to lowercase for consistent handling
	normalizedPin := strings.ToLower(pin)

	game, err := h.gameService.GetGameByPin(normalizedPin)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Game not found"})
		return
	}

	c.JSON(http.StatusOK, game)
}

func (h *GameHandler) SubmitAnswer(c *gin.Context) {
	gamePin := c.Param("pin")
	if gamePin == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Game PIN required"})
		return
	}

	// Normalize game pin to lowercase for consistent handling
	normalizedPin := strings.ToLower(gamePin)

	var req services.SubmitAnswerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get player ID from the request body
	if req.PlayerID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Player ID required"})
		return
	}

	err := h.gameService.SubmitAnswer(normalizedPin, req.PlayerID, &req, h.hub)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Answer submitted successfully"})
}

func (h *GameHandler) StartQuiz(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	gamePin := c.Param("pin")
	if gamePin == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Game PIN required"})
		return
	}

	// Normalize game pin to lowercase for consistent handling
	normalizedPin := strings.ToLower(gamePin)

	// Start the quiz using the game service
	game, err := h.gameService.StartQuiz(normalizedPin, userID.(uint))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Start the first question
	if err := h.gameService.StartQuestion(normalizedPin, 0, h.hub); err != nil {
		log.Printf("Error starting first question: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start first question"})
		return
	}

	// Get connected players and log them
	connectedPlayers := h.hub.GetConnectedPlayers(normalizedPin)
	log.Printf("Quiz started for game %s. Connected players: %v", normalizedPin, connectedPlayers)

	c.JSON(http.StatusOK, gin.H{"message": "Quiz started successfully", "game": game})
}

func (h *GameHandler) NextQuestion(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	gamePin := c.Param("pin")
	if gamePin == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Game PIN required"})
		return
	}

	// Normalize game pin to lowercase for consistent handling
	normalizedPin := strings.ToLower(gamePin)

	// Check if user owns the game
	if err := h.gameService.CheckGameOwnership(normalizedPin, userID.(uint)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	// Advance to next question
	if err := h.gameService.NextQuestion(normalizedPin, h.hub); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Advanced to next question"})
}
