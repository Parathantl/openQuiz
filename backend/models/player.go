package models

import (
	"time"

	"gorm.io/gorm"
)

type Player struct {
	ID        uint           `json:"id" gorm:"primaryKey"`
	GameID    uint           `json:"game_id" gorm:"not null"`
	Name      string         `json:"name" gorm:"not null"`
	Score     int            `json:"score" gorm:"not null;default:0"`
	JoinedAt  time.Time      `json:"joined_at"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`

	// Relationships
	Game Game `json:"game,omitempty"`
}
