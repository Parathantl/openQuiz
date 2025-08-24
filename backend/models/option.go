package models

import (
	"time"

	"gorm.io/gorm"
)

type Option struct {
	ID         uint           `json:"id" gorm:"primaryKey"`
	QuestionID uint           `json:"question_id" gorm:"not null"`
	Text       string         `json:"text" gorm:"not null"`
	IsCorrect  bool           `json:"is_correct" gorm:"not null;default:false"`
	Order      int            `json:"order" gorm:"not null"`
	CreatedAt  time.Time      `json:"created_at"`
	UpdatedAt  time.Time      `json:"updated_at"`
	DeletedAt  gorm.DeletedAt `json:"-" gorm:"index"`

	// Relationships
	Question Question `json:"question,omitempty"`
}
