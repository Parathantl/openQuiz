#!/bin/bash

echo "Starting OpenQuiz frontend..."
echo "Installing dependencies..."

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing npm dependencies..."
    npm install
fi

echo "Starting development server..."
npm run dev
