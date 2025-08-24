package models

import (
	"time"

	"gorm.io/gorm"
)

type Question struct {
	ID        uint           `json:"id" gorm:"primaryKey"`
	QuizID    uint           `json:"quiz_id" gorm:"not null"`
	Text      string         `json:"text" gorm:"not null"`
	TimeLimit int            `json:"time_limit" gorm:"not null;default:30"` // seconds
	Order     int            `json:"order" gorm:"not null"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`

	// Relationships
	Quiz    Quiz     `json:"quiz,omitempty"`
	Options []Option `json:"options,omitempty" gorm:"foreignKey:QuestionID"`
}
