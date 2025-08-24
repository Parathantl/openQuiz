# OpenQuiz - Real-time Quiz Platform

A Kahoot-like quiz platform built with Go, Next.js, and Redis for real-time multiplayer quiz games.

## Features

- **User Authentication**: Secure login and registration system
- **Quiz Creation**: Create multiple choice questions with timers and options
- **Real-time Gameplay**: Live quiz sessions with real-time updates
- **QR Code & PIN Entry**: Easy ways for players to join games
- **Live Scoring**: Real-time score tracking and leaderboards
- **Responsive Design**: Works on desktop and mobile devices

## Tech Stack

### Backend
- **Go** - High-performance server language
- **Gin** - HTTP web framework
- **GORM** - ORM for database operations
- **PostgreSQL** - Primary database
- **Redis** - Caching and real-time data
- **WebSocket** - Real-time communication
- **JWT** - Authentication

### Frontend
- **Next.js 14** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first CSS framework
- **Socket.io Client** - Real-time client communication
- **QR Code** - Easy game joining

## Project Structure

```
openQuiz/
├── backend/          # Go backend application
├── frontend/         # Next.js frontend application
├── docker-compose.yml # Development environment setup
└── README.md         # This file
```

## Quick Start

### Prerequisites
- Go 1.21+
- Node.js 18+
- Docker & Docker Compose
- PostgreSQL
- Redis

### Development Setup

1. **Clone and setup**
   ```bash
   git clone <repository-url>
   cd openQuiz
   ```

2. **Start services**
   ```bash
   docker-compose up -d
   ```

3. **Backend setup**
   ```bash
   cd backend
   go mod tidy
   go run main.go
   ```

4. **Frontend setup**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

5. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8080

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get user profile

### Quizzes
- `GET /api/quizzes` - List user's quizzes
- `POST /api/quizzes` - Create new quiz
- `GET /api/quizzes/:id` - Get quiz details
- `PUT /api/quizzes/:id` - Update quiz
- `DELETE /api/quizzes/:id` - Delete quiz

### Games
- `POST /api/games` - Start a new game
- `GET /api/games/:pin` - Get game details
- `POST /api/games/:pin/join` - Join a game
- `POST /api/games/:pin/answer` - Submit answer

## Real-time Events

### Game Events
- `game_started` - Game has begun
- `question_displayed` - New question shown
- `answer_submitted` - Player submitted answer
- `time_up` - Question time expired
- `game_ended` - Game finished

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details
