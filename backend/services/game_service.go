package services

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"math"
	"strings"
	"time"

	"openquiz/models"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

type GameService struct {
	db    *gorm.DB
	redis *redis.Client
}

func NewGameService(db *gorm.DB, redis *redis.Client) *GameService {
	return &GameService{
		db:    db,
		redis: redis,
	}
}

type StartGameRequest struct {
	QuizID uint `json:"quiz_id" binding:"required"`
}

type JoinGameRequest struct {
	Pin  string `json:"pin" binding:"required"`
	Name string `json:"name" binding:"required"`
}

type SubmitAnswerRequest struct {
	PlayerID   uint `json:"player_id" binding:"required"`
	QuestionID uint `json:"question_id" binding:"required"`
	OptionID   uint `json:"option_id" binding:"required"`
	TimeSpent  int  `json:"time_spent"`
}

type GameState struct {
	GameID               uint          `json:"game_id"`
	QuizID               uint          `json:"quiz_id"`
	Pin                  string        `json:"pin"`
	Status               string        `json:"status"`
	CurrentQuestion      *GameQuestion `json:"current_question,omitempty"`
	CurrentQuestionIndex int           `json:"current_question_index"`
	Players              []GamePlayer  `json:"players"`
	Leaderboard          []GamePlayer  `json:"leaderboard"`
}

type GameQuestion struct {
	ID        uint         `json:"id"`
	Text      string       `json:"text"`
	TimeLimit int          `json:"time_limit"`
	Options   []GameOption `json:"options"`
	TimeLeft  int          `json:"time_left"`
}

type GameOption struct {
	ID   uint   `json:"id"`
	Text string `json:"text"`
}

type GamePlayer struct {
	ID    uint   `json:"id"`
	Name  string `json:"name"`
	Score int    `json:"score"`
}

func (s *GameService) StartGame(userID uint, req *StartGameRequest) (*models.Game, error) {
	// Check if quiz exists and belongs to user
	var quiz models.Quiz
	if err := s.db.Where("id = ? AND user_id = ?", req.QuizID, userID).First(&quiz).Error; err != nil {
		return nil, errors.New("quiz not found")
	}

	// Generate unique PIN
	pin := s.generatePin()

	// Create game
	game := models.Game{
		QuizID: req.QuizID,
		Pin:    pin,
		Status: "waiting",
	}

	if err := s.db.Create(&game).Error; err != nil {
		return nil, err
	}

	// Store game state in Redis
	gameState := &GameState{
		GameID:               game.ID,
		QuizID:               game.QuizID,
		Pin:                  game.Pin,
		Status:               game.Status,
		CurrentQuestionIndex: -1, // -1 means no question active yet
		Players:              []GamePlayer{},
	}

	// Normalize game pin to lowercase for consistent Redis storage
	normalizedPin := strings.ToLower(game.Pin)
	s.storeGameState(normalizedPin, gameState)

	return &game, nil
}

func (s *GameService) StartQuiz(gamePin string, userID uint) (*models.Game, error) {
	// Get game and verify ownership
	var game models.Game
	if err := s.db.Where("LOWER(pin) = ?", strings.ToLower(gamePin)).
		Preload("Quiz").
		Preload("Quiz.Questions").
		Preload("Quiz.Questions.Options").
		First(&game).Error; err != nil {
		return nil, errors.New("game not found")
	}

	// Check if user owns the quiz
	var quiz models.Quiz
	if err := s.db.Where("id = ? AND user_id = ?", game.QuizID, userID).First(&quiz).Error; err != nil {
		return nil, errors.New("unauthorized to start this game")
	}

	// Update game status to active
	if err := s.db.Model(&game).Update("status", "active").Error; err != nil {
		return nil, err
	}

	// Get or create game state in Redis
	// Normalize game pin to lowercase for consistent Redis lookup
	normalizedPin := strings.ToLower(gamePin)
	gameState := s.getGameState(normalizedPin)
	if gameState == nil {
		// Create new game state if it doesn't exist
		gameState = &GameState{
			GameID:               game.ID,
			QuizID:               game.QuizID,
			Pin:                  normalizedPin, // Use normalized pin for consistency
			Status:               "active",
			CurrentQuestionIndex: 0, // Start with first question
			Players:              []GamePlayer{},
		}
	} else {
		// Update existing game state
		gameState.Status = "active"
		gameState.CurrentQuestionIndex = 0 // Start with first question
	}

	// Store the updated game state
	s.storeGameState(normalizedPin, gameState)

	log.Printf("Quiz started for game %s. Starting first question...", gamePin)

	return &game, nil
}

func (s *GameService) StartFirstQuestion(gamePin string) error {
	// Get game with quiz and questions
	var game models.Game
	if err := s.db.Where("LOWER(pin) = ?", strings.ToLower(gamePin)).
		Preload("Quiz").
		Preload("Quiz.Questions").
		Preload("Quiz.Questions.Options").
		First(&game).Error; err != nil {
		return errors.New("game not found")
	}

	if len(game.Quiz.Questions) == 0 {
		return errors.New("no questions found for this quiz")
	}

	// Store current question index in Redis
	// Normalize game pin to lowercase for consistent Redis lookup
	normalizedPin := strings.ToLower(gamePin)
	gameState := s.getGameState(normalizedPin)
	if gameState != nil {
		gameState.CurrentQuestionIndex = 0
		s.storeGameState(normalizedPin, gameState)
	}

	return nil
}

// StartQuestion starts a specific question with timer
func (s *GameService) StartQuestion(gamePin string, questionIndex int, hub *Hub) error {
	// Get game with quiz and questions
	var game models.Game
	if err := s.db.Where("LOWER(pin) = ?", strings.ToLower(gamePin)).
		Preload("Quiz").
		Preload("Quiz.Questions").
		Preload("Quiz.Questions.Options").
		First(&game).Error; err != nil {
		return errors.New("game not found")
	}

	if questionIndex >= len(game.Quiz.Questions) {
		return errors.New("question index out of range")
	}

	question := game.Quiz.Questions[questionIndex]

	// Update game state in Redis
	// Normalize game pin to lowercase for consistent Redis lookup
	normalizedPin := strings.ToLower(gamePin)
	gameState := s.getGameState(normalizedPin)
	if gameState != nil {
		gameState.CurrentQuestionIndex = questionIndex
		gameState.CurrentQuestion = &GameQuestion{
			ID:        question.ID,
			Text:      question.Text,
			TimeLimit: question.TimeLimit,
			Options:   make([]GameOption, len(question.Options)),
		}
		// Copy options without revealing correct answers
		for i, option := range question.Options {
			gameState.CurrentQuestion.Options[i] = GameOption{
				ID:   option.ID,
				Text: option.Text,
			}
		}
		s.storeGameState(normalizedPin, gameState)
	}

	// Broadcast question start to all connected clients
	if hub != nil {
		// Normalize game pin to lowercase for consistent broadcasting
		normalizedPin := strings.ToLower(gamePin)
		log.Printf("Broadcasting question start to game %s: question %d", normalizedPin, questionIndex)

		// Broadcast the question start event with full question data
		hub.BroadcastToGame(normalizedPin, "question_start", gin.H{
			"question_index": questionIndex,
			"question": gin.H{
				"id":         question.ID,
				"text":       question.Text,
				"time_limit": question.TimeLimit,
				"options":    question.Options,
			},
			"total_questions": len(game.Quiz.Questions),
		})

		// Start timer for this question
		go s.runQuestionTimer(normalizedPin, questionIndex, question.TimeLimit, hub)
	}

	return nil
}

// runQuestionTimer runs a countdown timer for a question
func (s *GameService) runQuestionTimer(gamePin string, questionIndex int, timeLimit int, hub *Hub) {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	timeLeft := timeLimit
	log.Printf("Starting timer for question %d in game %s: %d seconds", questionIndex, gamePin, timeLimit)

	for timeLeft > 0 {
		<-ticker.C
		timeLeft--

		// Broadcast timer update every second
		if hub != nil {
			// Normalize game pin to lowercase for consistent function calls
			normalizedPin := strings.ToLower(gamePin)
			s.BroadcastTimerUpdate(normalizedPin, hub, questionIndex, timeLeft)
		}

		// Log timer updates for debugging
		if timeLeft%10 == 0 || timeLeft <= 5 {
			log.Printf("Timer for question %d in game %s: %d seconds remaining", questionIndex, gamePin, timeLeft)
		}
	}

	log.Printf("Timer expired for question %d in game %s", questionIndex, gamePin)

	// Time's up! End the question
	if hub != nil {
		// Normalize game pin to lowercase for consistent function calls
		normalizedPin := strings.ToLower(gamePin)
		s.EndQuestion(normalizedPin, hub, questionIndex)
	}
}

func (s *GameService) JoinGame(req *JoinGameRequest) (*models.Player, error) {
	// Convert PIN to lowercase for case-insensitive search
	pin := strings.ToLower(req.Pin)

	// First, get the game by PIN
	var game models.Game
	if err := s.db.Where("LOWER(pin) = ?", pin).First(&game).Error; err != nil {
		return nil, errors.New("game not found")
	}

	// Check if the game status allows joining
	if game.Status != "waiting" && game.Status != "active" {
		return nil, fmt.Errorf("game has status '%s' - cannot join", game.Status)
	}

	// Check if player name is already taken in this game
	var existingPlayer models.Player
	if err := s.db.Where("game_id = ? AND name = ?", game.ID, req.Name).First(&existingPlayer).Error; err == nil {
		return nil, errors.New("player name already taken")
	}

	// Create player
	player := models.Player{
		GameID:   game.ID,
		Name:     req.Name,
		Score:    0,
		JoinedAt: time.Now(),
	}

	if err := s.db.Create(&player).Error; err != nil {
		return nil, err
	}

	// Update game state in Redis
	// Normalize game pin to lowercase for consistent Redis lookup
	normalizedPin := strings.ToLower(game.Pin)
	gameState := s.getGameState(normalizedPin)
	if gameState == nil {
		// Create new game state if it doesn't exist
		gameState = &GameState{
			GameID:               game.ID,
			QuizID:               game.QuizID,
			Pin:                  normalizedPin, // Use normalized pin for consistency
			Status:               game.Status,
			CurrentQuestionIndex: -1, // No question active yet
			Players:              []GamePlayer{},
		}
	}

	// Add player to game state
	gamePlayer := GamePlayer{
		ID:    player.ID,
		Name:  player.Name,
		Score: player.Score,
	}
	gameState.Players = append(gameState.Players, gamePlayer)
	s.storeGameState(normalizedPin, gameState)

	return &player, nil
}

func (s *GameService) GetGameByPin(pin string) (*models.Game, error) {
	var game models.Game
	err := s.db.Where("LOWER(pin) = ?", strings.ToLower(pin)).
		Preload("Quiz").
		Preload("Quiz.Questions").
		Preload("Quiz.Questions.Options").
		Preload("Players").
		First(&game).Error
	return &game, err
}

// GetPlayerByID retrieves a player by their ID
func (s *GameService) GetPlayerByID(playerID uint) (*models.Player, error) {
	var player models.Player
	err := s.db.First(&player, playerID).Error
	return &player, err
}

func (s *GameService) SubmitAnswer(gamePin string, playerID uint, req *SubmitAnswerRequest, hub *Hub) error {
	// Normalize game pin to lowercase for consistent database lookup
	normalizedPin := strings.ToLower(gamePin)
	// Get game
	game, err := s.GetGameByPin(normalizedPin)
	if err != nil {
		return errors.New("game not found")
	}

	if game.Status != "active" {
		return errors.New("game is not active")
	}

	// Check if answer already submitted
	var existingAnswer models.GameAnswer
	if err := s.db.Where("game_id = ? AND player_id = ? AND question_id = ?",
		game.ID, playerID, req.QuestionID).First(&existingAnswer).Error; err == nil {
		return errors.New("answer already submitted")
	}

	// Get question and option to check if correct
	var question models.Question
	if err := s.db.First(&question, req.QuestionID).Error; err != nil {
		return errors.New("question not found")
	}

	var option models.Option
	if err := s.db.First(&option, req.OptionID).Error; err != nil {
		return errors.New("option not found")
	}

	// Provide default time spent if not provided
	timeSpent := req.TimeSpent
	if timeSpent == 0 {
		timeSpent = question.TimeLimit // Default to full time limit if not specified
	}

	// Calculate points based on time spent and correctness
	points := s.calculatePoints(timeSpent, question.TimeLimit, option.IsCorrect)

	// Create game answer
	gameAnswer := models.GameAnswer{
		GameID:     game.ID,
		PlayerID:   playerID,
		QuestionID: req.QuestionID,
		OptionID:   req.OptionID,
		IsCorrect:  option.IsCorrect,
		TimeSpent:  timeSpent,
		Points:     points,
	}

	if err := s.db.Create(&gameAnswer).Error; err != nil {
		return err
	}

	// Update player score
	if err := s.db.Model(&models.Player{}).Where("id = ?", playerID).
		Update("score", gorm.Expr("score + ?", points)).Error; err != nil {
		return err
	}

	// Update game state in Redis
	gameState := s.getGameState(normalizedPin)
	if gameState != nil {
		// Update player score in game state
		for i, player := range gameState.Players {
			if player.ID == playerID {
				gameState.Players[i].Score += points
				break
			}
		}
		s.storeGameState(normalizedPin, gameState)
	}

	// Broadcast real-time score update to all connected clients
	if hub != nil {
		// Get updated player list with scores
		var updatedGame models.Game
		if err := s.db.Where("LOWER(pin) = ?", normalizedPin).
			Preload("Players").
			First(&updatedGame).Error; err == nil {

			hub.BroadcastToGame(normalizedPin, "score_update", gin.H{
				"players":       updatedGame.Players,
				"player_id":     playerID,
				"points_earned": points,
				"is_correct":    option.IsCorrect,
			})
		}
	}

	return nil
}

func (s *GameService) generatePin() string {
	bytes := make([]byte, 3)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)[:6]
}

func (s *GameService) calculatePoints(timeSpent, timeLimit int, isCorrect bool) int {
	if !isCorrect {
		return 0
	}

	// Base points for correct answer
	basePoints := 100

	// Bonus points for quick answer (up to 50 bonus points)
	timeBonus := int(math.Max(0, float64(50*(timeLimit-timeSpent)/timeLimit)))

	return basePoints + timeBonus
}

func (s *GameService) storeGameState(pin string, state *GameState) {
	// Normalize pin to lowercase for consistent Redis key storage
	normalizedPin := strings.ToLower(pin)
	// Store in Redis with expiration (1 hour)
	s.redis.Set(context.Background(), "game:"+normalizedPin, state, time.Hour)
}

func (s *GameService) getGameState(pin string) *GameState {
	// Normalize pin to lowercase for consistent Redis key lookup
	normalizedPin := strings.ToLower(pin)
	var state GameState
	err := s.redis.Get(context.Background(), "game:"+normalizedPin).Scan(&state)
	if err != nil {
		return nil
	}
	return &state
}

func (s *GameService) BroadcastTimerUpdate(gamePin string, hub *Hub, questionIndex int, timeLeft int) {
	if hub != nil {
		// Normalize game pin to lowercase for consistent broadcasting
		normalizedPin := strings.ToLower(gamePin)
		log.Printf("Broadcasting timer update for game %s, question %d: %d seconds left", normalizedPin, questionIndex, timeLeft)
		hub.BroadcastToGame(normalizedPin, "timer_update", gin.H{
			"question_index": questionIndex,
			"time_left":      timeLeft,
		})
	}
}

// NextQuestion advances to the next question or ends the quiz
func (s *GameService) NextQuestion(gamePin string, hub *Hub) error {
	// Get current game state
	// Normalize game pin to lowercase for consistent Redis lookup
	normalizedPin := strings.ToLower(gamePin)
	gameState := s.getGameState(normalizedPin)
	if gameState == nil {
		return errors.New("game state not found")
	}

	// Get game with quiz to check total questions
	var game models.Game
	if err := s.db.Where("LOWER(pin) = ?", strings.ToLower(gamePin)).
		Preload("Quiz").
		Preload("Quiz.Questions").
		First(&game).Error; err != nil {
		return errors.New("game not found")
	}

	nextQuestionIndex := gameState.CurrentQuestionIndex + 1

	if nextQuestionIndex >= len(game.Quiz.Questions) {
		// Quiz is finished
		if err := s.db.Model(&game).Update("status", "finished").Error; err != nil {
			return err
		}

		// Update game state
		gameState.Status = "finished"
		s.storeGameState(normalizedPin, gameState)

		// Broadcast quiz end
		if hub != nil {
			hub.BroadcastToGame(normalizedPin, "game_end", gin.H{
				"message": "Quiz completed!",
			})
		}

		return nil
	}

	// Start the next question
	return s.StartQuestion(normalizedPin, nextQuestionIndex, hub)
}

// EndQuestion ends the current question and shows results
func (s *GameService) EndQuestion(gamePin string, hub *Hub, questionIndex int) error {
	// Get all answers for this question
	var answers []models.GameAnswer
	if err := s.db.Where("game_id = (SELECT id FROM games WHERE LOWER(pin) = ?)", strings.ToLower(gamePin)).
		Where("question_id = (SELECT id FROM questions WHERE quiz_id = (SELECT quiz_id FROM games WHERE LOWER(pin) = ?) LIMIT 1 OFFSET ?)",
			strings.ToLower(gamePin), questionIndex).Find(&answers).Error; err != nil {
		log.Printf("Error fetching answers: %v", err)
	}

	// Broadcast question end to all connected clients
	if hub != nil {
		// Normalize game pin to lowercase for consistent broadcasting
		normalizedPin := strings.ToLower(gamePin)
		hub.BroadcastToGame(normalizedPin, "question_end", gin.H{
			"question_index": questionIndex,
			"answers":        answers,
		})
	}

	return nil
}

// CheckGameOwnership checks if a user owns a specific game
func (s *GameService) CheckGameOwnership(gamePin string, userID uint) error {
	// Normalize game pin to lowercase for consistent database lookup
	normalizedPin := strings.ToLower(gamePin)
	var game models.Game
	if err := s.db.Where("LOWER(pin) = ?", normalizedPin).First(&game).Error; err != nil {
		return errors.New("game not found")
	}

	var quiz models.Quiz
	if err := s.db.Where("id = ? AND user_id = ?", game.QuizID, userID).First(&quiz).Error; err != nil {
		return errors.New("unauthorized to control this game")
	}

	return nil
}

// GetCurrentGameState returns the current game state for WebSocket synchronization
func (s *GameService) GetCurrentGameState(gamePin string) (*GameState, error) {
	// Normalize game pin to lowercase for consistent database lookup
	normalizedPin := strings.ToLower(gamePin)
	game, err := s.GetGameByPin(normalizedPin)
	if err != nil {
		log.Printf("GetCurrentGameState: Failed to get game by PIN %s: %v", normalizedPin, err)
		return nil, err
	}

	log.Printf("GetCurrentGameState: Game %s status: %s, players: %d", normalizedPin, game.Status, len(game.Players))

	// Get current question if game is active
	var currentQuestion *GameQuestion
	var currentQuestionIndex int = -1

	// Get current question index from Redis
	gameState := s.getGameState(normalizedPin)
	if gameState != nil {
		currentQuestionIndex = gameState.CurrentQuestionIndex
		log.Printf("GetCurrentGameState: Redis state found - question index: %d", currentQuestionIndex)
		if currentQuestionIndex >= 0 && currentQuestionIndex < len(game.Quiz.Questions) {
			question := game.Quiz.Questions[currentQuestionIndex]
			currentQuestion = &GameQuestion{
				ID:        question.ID,
				Text:      question.Text,
				TimeLimit: question.TimeLimit,
				Options:   make([]GameOption, len(question.Options)),
			}
			for i, option := range question.Options {
				currentQuestion.Options[i] = GameOption{
					ID:   option.ID,
					Text: option.Text,
				}
			}
			log.Printf("GetCurrentGameState: Current question loaded: %s", question.Text[:min(50, len(question.Text))])
		}
	} else {
		// Redis state is missing, create a fallback state
		// This ensures players always get a valid game state
		log.Printf("GetCurrentGameState: Redis state missing, creating fallback state")
		gameState = &GameState{
			GameID:               game.ID,
			QuizID:               game.QuizID,
			Pin:                  normalizedPin, // Use normalized pin for consistency
			Status:               game.Status,
			CurrentQuestionIndex: -1,
			Players:              []GamePlayer{},
		}
		// Store the fallback state
		s.storeGameState(normalizedPin, gameState)
	}

	// Convert players to GamePlayer format
	gamePlayers := make([]GamePlayer, len(game.Players))
	for i, player := range game.Players {
		gamePlayers[i] = GamePlayer{
			ID:    player.ID,
			Name:  player.Name,
			Score: player.Score,
		}
	}

	result := &GameState{
		GameID:               game.ID,
		QuizID:               game.QuizID,
		Pin:                  normalizedPin, // Use normalized pin for consistency
		Status:               game.Status,
		CurrentQuestion:      currentQuestion,
		CurrentQuestionIndex: currentQuestionIndex,
		Players:              gamePlayers,
		Leaderboard:          gamePlayers, // For now, same as players
	}

	log.Printf("GetCurrentGameState: Returning state - status: %s, question index: %d, players: %d", result.Status, result.CurrentQuestionIndex, len(result.Players))
	return result, nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
