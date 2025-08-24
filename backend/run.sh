#!/bin/bash

# Set environment variables
export PORT=8080
export DB_HOST=localhost
export DB_PORT=5432
export DB_USER=openquiz
export DB_PASSWORD=openquiz123
export DB_NAME=openquiz
export REDIS_HOST=localhost
export REDIS_PORT=6379
export JWT_SECRET=your-super-secret-jwt-key-change-in-production

# Run the application
echo "Starting OpenQuiz backend..."
echo "Port: $PORT"
echo "Database: $DB_HOST:$DB_PORT"
echo "Redis: $REDIS_HOST:$REDIS_PORT"

go run main.go
