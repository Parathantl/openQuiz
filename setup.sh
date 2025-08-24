#!/bin/bash

echo "🚀 Setting up OpenQuiz - Real-time Quiz Platform"
echo "=================================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if Go is installed
if ! command -v go &> /dev/null; then
    echo "❌ Go is not installed. Please install Go 1.21+ and try again."
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ and try again."
    exit 1
fi

echo "✅ Prerequisites check passed"

# Start Docker services
echo "🐳 Starting PostgreSQL and Redis..."
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Setup backend
echo "🔧 Setting up Go backend..."
cd backend

# Install Go dependencies
echo "📦 Installing Go dependencies..."
go mod tidy

# Make run script executable
chmod +x run.sh

echo "✅ Backend setup complete"
cd ..

# Setup frontend
echo "🔧 Setting up Next.js frontend..."
cd frontend

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm install

# Make run script executable
chmod +x run.sh

echo "✅ Frontend setup complete"
cd ..

echo ""
echo "🎉 Setup complete! Here's how to run the application:"
echo ""
echo "1. Start the backend:"
echo "   cd backend && ./run.sh"
echo ""
echo "2. In a new terminal, start the frontend:"
echo "   cd frontend && ./run.sh"
echo ""
echo "3. Access the application:"
echo "   Frontend: http://localhost:3000"
echo "   Backend API: http://localhost:8080"
echo ""
echo "4. Stop services when done:"
echo "   docker-compose down"
echo ""
echo "Happy quizzing! 🎯"
