package models

import (
	"time"

	"gorm.io/gorm"
)

type Game struct {
	ID        uint           `json:"id" gorm:"primaryKey"`
	QuizID    uint           `json:"quiz_id" gorm:"not null"`
	Pin       string         `json:"pin" gorm:"uniqueIndex;not null"`
	Status    string         `json:"status" gorm:"not null;default:'waiting'"` // waiting, active, finished
	StartedAt *time.Time     `json:"started_at"`
	EndedAt   *time.Time     `json:"ended_at"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`

	// Relationships
	Quiz    Quiz         `json:"quiz,omitempty"`
	Players []Player     `json:"players,omitempty" gorm:"foreignKey:GameID"`
	Answers []GameAnswer `json:"answers,omitempty" gorm:"foreignKey:GameID"`
}
