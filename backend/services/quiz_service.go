package services

import (
	"errors"

	"openquiz/models"

	"gorm.io/gorm"
)

type QuizService struct {
	db *gorm.DB
}

func NewQuizService(db *gorm.DB) *QuizService {
	return &QuizService{db: db}
}

type CreateQuizRequest struct {
	Title       string                  `json:"title" binding:"required"`
	Description string                  `json:"description"`
	Questions   []CreateQuestionRequest `json:"questions" binding:"required,min=1"`
}

type CreateQuestionRequest struct {
	Text      string                `json:"text" binding:"required"`
	TimeLimit int                   `json:"time_limit" binding:"required,min=5,max=300"`
	Order     int                   `json:"order" binding:"required"`
	Options   []CreateOptionRequest `json:"options" binding:"required,min=2,max=6"`
}

type CreateOptionRequest struct {
	Text      string `json:"text" binding:"required"`
	IsCorrect bool   `json:"is_correct"`
	Order     int    `json:"order" binding:"required"`
}

type UpdateQuizRequest struct {
	Title       string                  `json:"title"`
	Description string                  `json:"description"`
	Questions   []CreateQuestionRequest `json:"questions"`
}

func (s *QuizService) CreateQuiz(userID uint, req *CreateQuizRequest) (*models.Quiz, error) {
	// Start transaction
	tx := s.db.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// Create quiz
	quiz := models.Quiz{
		Title:       req.Title,
		Description: req.Description,
		UserID:      userID,
	}

	if err := tx.Create(&quiz).Error; err != nil {
		tx.Rollback()
		return nil, err
	}

	// Create questions and options
	for _, qReq := range req.Questions {
		question := models.Question{
			QuizID:    quiz.ID,
			Text:      qReq.Text,
			TimeLimit: qReq.TimeLimit,
			Order:     qReq.Order,
		}

		if err := tx.Create(&question).Error; err != nil {
			tx.Rollback()
			return nil, err
		}

		// Validate that only one option is correct
		correctCount := 0
		for _, optReq := range qReq.Options {
			if optReq.IsCorrect {
				correctCount++
			}
		}
		if correctCount != 1 {
			tx.Rollback()
			return nil, errors.New("each question must have exactly one correct answer")
		}

		// Create options
		for _, optReq := range qReq.Options {
			option := models.Option{
				QuestionID: question.ID,
				Text:       optReq.Text,
				IsCorrect:  optReq.IsCorrect,
				Order:      optReq.Order,
			}

			if err := tx.Create(&option).Error; err != nil {
				tx.Rollback()
				return nil, err
			}
		}
	}

	// Commit transaction
	if err := tx.Commit().Error; err != nil {
		return nil, err
	}

	// Fetch the quiz with questions and options loaded
	return s.GetQuizByID(quiz.ID, userID)
}

func (s *QuizService) GetUserQuizzes(userID uint) ([]models.Quiz, error) {
	var quizzes []models.Quiz
	err := s.db.Where("user_id = ?", userID).
		Preload("Questions", func(db *gorm.DB) *gorm.DB {
			return db.Order("questions.order")
		}).
		Preload("Questions.Options", func(db *gorm.DB) *gorm.DB {
			return db.Order("options.order")
		}).
		Order("created_at DESC").
		Find(&quizzes).Error
	return quizzes, err
}

func (s *QuizService) GetQuizByID(quizID uint, userID uint) (*models.Quiz, error) {
	var quiz models.Quiz
	err := s.db.Where("id = ? AND user_id = ?", quizID, userID).
		Preload("Questions", func(db *gorm.DB) *gorm.DB {
			return db.Order("questions.order")
		}).
		Preload("Questions.Options", func(db *gorm.DB) *gorm.DB {
			return db.Order("options.order")
		}).
		First(&quiz).Error
	return &quiz, err
}

func (s *QuizService) UpdateQuiz(quizID uint, userID uint, req *UpdateQuizRequest) (*models.Quiz, error) {
	// Check if quiz exists and belongs to user
	quiz, err := s.GetQuizByID(quizID, userID)
	if err != nil {
		return nil, err
	}

	// Start transaction
	tx := s.db.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// Update quiz basic info
	if req.Title != "" {
		quiz.Title = req.Title
	}
	if req.Description != "" {
		quiz.Description = req.Description
	}

	if err := tx.Save(quiz).Error; err != nil {
		tx.Rollback()
		return nil, err
	}

	// If questions are provided, replace all questions
	if req.Questions != nil {
		// Delete existing questions and options
		if err := tx.Where("quiz_id = ?", quizID).Delete(&models.Question{}).Error; err != nil {
			tx.Rollback()
			return nil, err
		}

		// Create new questions and options
		for _, qReq := range req.Questions {
			question := models.Question{
				QuizID:    quiz.ID,
				Text:      qReq.Text,
				TimeLimit: qReq.TimeLimit,
				Order:     qReq.Order,
			}

			if err := tx.Create(&question).Error; err != nil {
				tx.Rollback()
				return nil, err
			}

			// Validate that only one option is correct
			correctCount := 0
			for _, optReq := range qReq.Options {
				if optReq.IsCorrect {
					correctCount++
				}
			}
			if correctCount != 1 {
				tx.Rollback()
				return nil, errors.New("each question must have exactly one correct answer")
			}

			// Create options
			for _, optReq := range qReq.Options {
				option := models.Option{
					QuestionID: question.ID,
					Text:       optReq.Text,
					IsCorrect:  optReq.IsCorrect,
					Order:      optReq.Order,
				}

				if err := tx.Create(&option).Error; err != nil {
					tx.Rollback()
					return nil, err
				}
			}
		}
	}

	// Commit transaction
	if err := tx.Commit().Error; err != nil {
		return nil, err
	}

	// Fetch the updated quiz with questions and options loaded
	return s.GetQuizByID(quiz.ID, userID)
}

func (s *QuizService) DeleteQuiz(quizID uint, userID uint) error {
	// Check if quiz exists and belongs to user
	_, err := s.GetQuizByID(quizID, userID)
	if err != nil {
		return err
	}

	return s.db.Delete(&models.Quiz{}, quizID).Error
}
