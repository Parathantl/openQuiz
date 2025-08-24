package models

import (
	"time"

	"gorm.io/gorm"
)

type GameAnswer struct {
	ID         uint           `json:"id" gorm:"primaryKey"`
	GameID     uint           `json:"game_id" gorm:"not null"`
	PlayerID   uint           `json:"player_id" gorm:"not null"`
	QuestionID uint           `json:"question_id" gorm:"not null"`
	OptionID   uint           `json:"option_id" gorm:"not null"`
	IsCorrect  bool           `json:"is_correct" gorm:"not null"`
	TimeSpent  int            `json:"time_spent" gorm:"not null"` // seconds
	Points     int            `json:"points" gorm:"not null"`
	CreatedAt  time.Time      `json:"created_at"`
	UpdatedAt  time.Time      `json:"updated_at"`
	DeletedAt  gorm.DeletedAt `json:"-" gorm:"index"`

	// Relationships
	Game     Game     `json:"game,omitempty"`
	Player   Player   `json:"player,omitempty"`
	Question Question `json:"question,omitempty"`
	Option   Option   `json:"option,omitempty"`
}
