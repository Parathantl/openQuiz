package models

import (
	"time"

	"gorm.io/gorm"
)

type Quiz struct {
	ID          uint           `json:"id" gorm:"primaryKey"`
	Title       string         `json:"title" gorm:"not null"`
	Description string         `json:"description"`
	UserID      uint           `json:"user_id" gorm:"not null"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `json:"-" gorm:"index"`

	// Relationships
	User      User       `json:"user,omitempty"`
	Questions []Question `json:"questions,omitempty" gorm:"foreignKey:QuizID"`
	Games     []Game     `json:"games,omitempty" gorm:"foreignKey:QuizID"`
}
