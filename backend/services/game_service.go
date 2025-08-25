package services

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
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
	TotalQuestions       int           `json:"total_questions"`
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
	// Don't include IsCorrect during active quiz
}

type GamePlayer struct {
	ID    uint   `json:"id"`
	Name  string `json:"name"`
	Score int    `json:"score"`
}

func (s *GameService) StartGame(userID uint, req *StartGameRequest) (*models.Game, error) {
	// Check if quiz exists and belongs to user
	var quiz models.Quiz
	if err := s.db.Where("id = ? AND user_id = ?", req.QuizID, userID).
		Preload("Questions").
		Preload("Questions.Options").
		First(&quiz).Error; err != nil {
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
		TotalQuestions:       len(quiz.Questions),
	}

	// Normalize game pin to lowercase for consistent Redis storage
	normalizedPin := strings.ToLower(game.Pin)
	if err := s.storeGameState(normalizedPin, gameState); err != nil {
		log.Printf("Failed to store game state in Redis: %v", err)
	}

	return &game, nil
}

func (s *GameService) StartQuiz(gamePin string, userID uint) (*models.Game, error) {
	// Normalize pin
	normalizedPin := strings.ToLower(gamePin)

	// Get game and verify ownership
	var game models.Game
	if err := s.db.Where("LOWER(pin) = ?", normalizedPin).
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

	// Get current players from database
	var players []models.Player
	s.db.Where("game_id = ?", game.ID).Find(&players)

	// Get or create game state in Redis
	gameState := s.getGameState(normalizedPin)
	if gameState == nil {
		// Create new game state if it doesn't exist
		gameState = &GameState{
			GameID:               game.ID,
			QuizID:               game.QuizID,
			Pin:                  normalizedPin,
			Status:               "active",
			CurrentQuestionIndex: -1, // Will be set to 0 when first question starts
			Players:              []GamePlayer{},
			TotalQuestions:       len(game.Quiz.Questions),
		}
	} else {
		// Update existing game state
		gameState.Status = "active"
		gameState.TotalQuestions = len(game.Quiz.Questions)
	}

	// Update players in game state
	gameState.Players = []GamePlayer{}
	for _, player := range players {
		gameState.Players = append(gameState.Players, GamePlayer{
			ID:    player.ID,
			Name:  player.Name,
			Score: player.Score,
		})
	}

	// Store the updated game state
	if err := s.storeGameState(normalizedPin, gameState); err != nil {
		log.Printf("Failed to update game state in Redis: %v", err)
		return nil, errors.New("failed to update game state")
	}

	log.Printf("Quiz started for game %s. Ready to start first question...", gamePin)
	return &game, nil
}

// StartQuestion starts a specific question with timer
func (s *GameService) StartQuestion(gamePin string, questionIndex int, hub *Hub) error {
	normalizedPin := strings.ToLower(gamePin)

	// Get game with quiz and questions
	var game models.Game
	if err := s.db.Where("LOWER(pin) = ?", normalizedPin).
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
	gameState := s.getGameState(normalizedPin)
	if gameState == nil {
		return errors.New("game state not found in Redis")
	}

	gameState.CurrentQuestionIndex = questionIndex
	gameState.CurrentQuestion = &GameQuestion{
		ID:        question.ID,
		Text:      question.Text,
		TimeLimit: question.TimeLimit,
		Options:   make([]GameOption, len(question.Options)),
		TimeLeft:  question.TimeLimit,
	}

	// Copy options WITHOUT revealing correct answers during active quiz
	for i, option := range question.Options {
		gameState.CurrentQuestion.Options[i] = GameOption{
			ID:   option.ID,
			Text: option.Text,
			// IsCorrect is intentionally omitted during active quiz
		}
	}

	if err := s.storeGameState(normalizedPin, gameState); err != nil {
		log.Printf("Failed to store game state: %v", err)
		return errors.New("failed to update game state")
	}

	// Broadcast question start to all connected clients
	if hub != nil {
		log.Printf("Broadcasting question start to game %s: question %d", normalizedPin, questionIndex)

		// Create question data for broadcast (without correct answers)
		broadcastQuestion := gin.H{
			"id":         question.ID,
			"text":       question.Text,
			"time_limit": question.TimeLimit,
			"options":    gameState.CurrentQuestion.Options, // This doesn't include IsCorrect
		}

		hub.BroadcastToGame(normalizedPin, "question_start", gin.H{
			"question_index":  questionIndex,
			"question":        broadcastQuestion,
			"total_questions": len(game.Quiz.Questions),
		})

		// Start timer for this question
		go s.runQuestionTimer(normalizedPin, questionIndex, question.TimeLimit, hub)
	}

	return nil
}

// NextQuestion advances to the next question or ends the quiz
func (s *GameService) NextQuestion(gamePin string, hub *Hub) error {
	normalizedPin := strings.ToLower(gamePin)

	// Get current game state
	gameState := s.getGameState(normalizedPin)
	if gameState == nil {
		log.Printf("Game state not found for pin: %s", normalizedPin)
		return errors.New("game state not found")
	}

	// Get game with quiz to check total questions
	var game models.Game
	if err := s.db.Where("LOWER(pin) = ?", normalizedPin).
		Preload("Quiz").
		Preload("Quiz.Questions").
		Preload("Quiz.Questions.Options").
		First(&game).Error; err != nil {
		log.Printf("Game not found in database for pin: %s", normalizedPin)
		return errors.New("game not found")
	}

	nextQuestionIndex := gameState.CurrentQuestionIndex + 1
	log.Printf("Next question index: %d, Total questions: %d", nextQuestionIndex, len(game.Quiz.Questions))

	if nextQuestionIndex >= len(game.Quiz.Questions) {
		// Quiz is finished
		log.Printf("Quiz finished for game %s", normalizedPin)

		if err := s.db.Model(&game).Update("status", "finished").Error; err != nil {
			return err
		}

		// Update game state
		gameState.Status = "finished"
		gameState.CurrentQuestion = nil
		gameState.CurrentQuestionIndex = len(game.Quiz.Questions) // Set to total questions to indicate completion

		if err := s.storeGameState(normalizedPin, gameState); err != nil {
			log.Printf("Failed to store final game state: %v", err)
		}

		// Get final leaderboard
		var players []models.Player
		s.db.Where("game_id = ?", game.ID).Order("score DESC").Find(&players)

		finalLeaderboard := []GamePlayer{}
		for _, player := range players {
			finalLeaderboard = append(finalLeaderboard, GamePlayer{
				ID:    player.ID,
				Name:  player.Name,
				Score: player.Score,
			})
		}

		// Broadcast quiz end with final results
		if hub != nil {
			hub.BroadcastToGame(normalizedPin, "game_end", gin.H{
				"message":           "Quiz completed! Here are the final results:",
				"final_leaderboard": finalLeaderboard,
				"total_questions":   len(game.Quiz.Questions),
			})
		}

		return nil
	}

	// Start the next question
	return s.StartQuestion(normalizedPin, nextQuestionIndex, hub)
}

// runQuestionTimer runs a countdown timer for a question
func (s *GameService) runQuestionTimer(gamePin string, questionIndex int, timeLimit int, hub *Hub) {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	timeLeft := timeLimit
	normalizedPin := strings.ToLower(gamePin)
	log.Printf("Starting timer for question %d in game %s: %d seconds", questionIndex, normalizedPin, timeLimit)

	for timeLeft > 0 {
		<-ticker.C
		timeLeft--

		// Update game state with current time
		gameState := s.getGameState(normalizedPin)
		if gameState != nil && gameState.CurrentQuestion != nil {
			gameState.CurrentQuestion.TimeLeft = timeLeft
			s.storeGameState(normalizedPin, gameState)
		}

		// Broadcast timer update every second
		if hub != nil {
			hub.BroadcastToGame(normalizedPin, "timer_update", gin.H{
				"question_index": questionIndex,
				"time_left":      timeLeft,
			})
		}

		// Log timer updates for debugging
		if timeLeft%10 == 0 || timeLeft <= 5 {
			log.Printf("Timer for question %d in game %s: %d seconds remaining", questionIndex, normalizedPin, timeLeft)
		}
	}

	log.Printf("Timer expired for question %d in game %s", questionIndex, normalizedPin)

	// Time's up! End the question and show results
	if hub != nil {
		s.EndQuestion(normalizedPin, hub, questionIndex)
	}
}

// EndQuestion ends the current question and shows results with correct answers
func (s *GameService) EndQuestion(gamePin string, hub *Hub, questionIndex int) error {
	normalizedPin := strings.ToLower(gamePin)

	// Get game and question details
	var game models.Game
	if err := s.db.Where("LOWER(pin) = ?", normalizedPin).
		Preload("Quiz").
		Preload("Quiz.Questions").
		Preload("Quiz.Questions.Options").
		First(&game).Error; err != nil {
		return errors.New("game not found")
	}

	if questionIndex >= len(game.Quiz.Questions) {
		return errors.New("invalid question index")
	}

	question := game.Quiz.Questions[questionIndex]

	// Get all answers for this question
	var gameAnswers []models.GameAnswer
	if err := s.db.Where("game_id = ? AND question_id = ?", game.ID, question.ID).
		Preload("Player").
		Find(&gameAnswers).Error; err != nil {
		log.Printf("Error fetching answers: %v", err)
	}

	// Prepare answer results with correct answer revealed
	answerResults := []gin.H{}
	for _, answer := range gameAnswers {
		answerResults = append(answerResults, gin.H{
			"player_id":   answer.PlayerID,
			"player_name": answer.Player.Name,
			"option_id":   answer.OptionID,
			"is_correct":  answer.IsCorrect,
			"points":      answer.Points,
			"time_spent":  answer.TimeSpent,
		})
	}

	// Find the correct option
	var correctOption *models.Option
	for _, option := range question.Options {
		if option.IsCorrect {
			correctOption = &option
			break
		}
	}

	// Broadcast question end with results and correct answer
	if hub != nil {
		hub.BroadcastToGame(normalizedPin, "question_end", gin.H{
			"question_index":  questionIndex,
			"question":        question, // Now includes correct answers
			"correct_option":  correctOption,
			"answers":         answerResults,
			"total_questions": len(game.Quiz.Questions),
		})
	}

	return nil
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
	normalizedPin := strings.ToLower(game.Pin)
	gameState := s.getGameState(normalizedPin)
	if gameState == nil {
		// Create new game state if it doesn't exist
		gameState = &GameState{
			GameID:               game.ID,
			QuizID:               game.QuizID,
			Pin:                  normalizedPin,
			Status:               game.Status,
			CurrentQuestionIndex: -1,
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
		timeSpent = question.TimeLimit
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

	// Get updated players for broadcast
	var updatedPlayers []models.Player
	s.db.Where("game_id = ?", game.ID).Find(&updatedPlayers)

	// Broadcast real-time score update to all connected clients (but don't reveal correct answer yet)
	if hub != nil {
		hub.BroadcastToGame(normalizedPin, "score_update", gin.H{
			"players":          updatedPlayers,
			"player_id":        playerID,
			"points_earned":    points,
			"answer_submitted": true, // Don't reveal if correct until question ends
		})
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

func (s *GameService) storeGameState(pin string, state *GameState) error {
	normalizedPin := strings.ToLower(pin)

	// Convert to JSON for Redis storage
	data, err := json.Marshal(state)
	if err != nil {
		return fmt.Errorf("failed to marshal game state: %v", err)
	}

	// Store in Redis with expiration (2 hours)
	err = s.redis.Set(context.Background(), "game:"+normalizedPin, data, 2*time.Hour).Err()
	if err != nil {
		return fmt.Errorf("failed to store in Redis: %v", err)
	}

	log.Printf("Stored game state for %s: currentQuestionIndex=%d, status=%s", normalizedPin, state.CurrentQuestionIndex, state.Status)
	return nil
}

func (s *GameService) getGameState(pin string) *GameState {
	normalizedPin := strings.ToLower(pin)

	data, err := s.redis.Get(context.Background(), "game:"+normalizedPin).Result()
	if err != nil {
		if err != redis.Nil {
			log.Printf("Redis error getting game state for %s: %v", normalizedPin, err)
		}
		return nil
	}

	var state GameState
	err = json.Unmarshal([]byte(data), &state)
	if err != nil {
		log.Printf("Failed to unmarshal game state for %s: %v", normalizedPin, err)
		return nil
	}

	log.Printf("Retrieved game state for %s: currentQuestionIndex=%d, status=%s", normalizedPin, state.CurrentQuestionIndex, state.Status)
	return &state
}

// CheckGameOwnership checks if a user owns a specific game
func (s *GameService) CheckGameOwnership(gamePin string, userID uint) error {
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
	normalizedPin := strings.ToLower(gamePin)

	// Try to get from Redis first
	gameState := s.getGameState(normalizedPin)
	if gameState != nil {
		// Update with fresh player data from database
		var players []models.Player
		if gameState.GameID > 0 {
			s.db.Where("game_id = ?", gameState.GameID).Find(&players)
			gameState.Players = []GamePlayer{}
			for _, player := range players {
				gameState.Players = append(gameState.Players, GamePlayer{
					ID:    player.ID,
					Name:  player.Name,
					Score: player.Score,
				})
			}
		}
		return gameState, nil
	}

	// Fallback: get from database and create Redis state
	game, err := s.GetGameByPin(normalizedPin)
	if err != nil {
		return nil, err
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

	// Create and store new game state
	newGameState := &GameState{
		GameID:               game.ID,
		QuizID:               game.QuizID,
		Pin:                  normalizedPin,
		Status:               game.Status,
		CurrentQuestionIndex: -1, // No active question
		Players:              gamePlayers,
		TotalQuestions:       len(game.Quiz.Questions),
	}

	s.storeGameState(normalizedPin, newGameState)
	return newGameState, nil
}
