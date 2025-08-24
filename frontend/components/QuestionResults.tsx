'use client'

import { useEffect, useState } from 'react'

interface Option {
  id: number
  text: string
  is_correct: boolean
}

interface Question {
  id: number
  text: string
  time_limit: number
  options: Option[]
}

interface PlayerAnswer {
  player_id: number
  player_name: string
  selected_option_id: number | null
  is_correct: boolean
  score_earned: number
  time_taken: number
}

interface QuestionResultsProps {
  question: Question
  playerAnswers: PlayerAnswer[]
  onNextQuestion: () => void
  isCreator?: boolean
  showDuration?: number
}

export function QuestionResults({ 
  question, 
  playerAnswers, 
  onNextQuestion, 
  isCreator = false,
  showDuration = 5000 
}: QuestionResultsProps) {
  const [timeLeft, setTimeLeft] = useState(showDuration / 1000)

  useEffect(() => {
    if (timeLeft <= 0) {
      if (isCreator) {
        onNextQuestion()
      }
      return
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1)
    }, 1000)

    return () => clearInterval(timer)
  }, [timeLeft, isCreator, onNextQuestion])

  const correctOption = question.options.find(opt => opt.is_correct)
  const totalPlayers = playerAnswers.length
  const correctAnswers = playerAnswers.filter(answer => answer.is_correct).length
  const averageScore = playerAnswers.reduce((sum, answer) => sum + answer.score_earned, 0) / totalPlayers

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Question Results Header */}
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Question Results</h2>
        <div className="text-lg text-gray-600 mb-2">{question.text}</div>
        
        {/* Timer for next question */}
        {isCreator && (
          <div className="inline-flex items-center px-4 py-2 bg-blue-100 text-blue-800 rounded-full">
            <span className="mr-2">⏱️</span>
            Next question in {timeLeft}s
          </div>
        )}
      </div>

      {/* Correct Answer */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-8">
        <h3 className="text-lg font-semibold text-green-800 mb-3">✅ Correct Answer</h3>
        <div className="text-xl font-medium text-green-900">
          {correctOption?.text}
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{totalPlayers}</div>
          <div className="text-sm text-blue-600">Total Players</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{correctAnswers}</div>
          <div className="text-sm text-green-600">Correct Answers</div>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-purple-600">{Math.round(averageScore)}</div>
          <div className="text-sm text-purple-600">Avg Score</div>
        </div>
      </div>

      {/* Player Performance */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Player Performance</h3>
        <div className="space-y-3">
          {playerAnswers.map((answer) => (
            <div
              key={answer.player_id}
              className={`flex items-center justify-between p-3 rounded-lg border ${
                answer.is_correct 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-red-50 border-red-200'
              }`}
            >
              <div className="flex items-center space-x-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-sm ${
                  answer.is_correct 
                    ? 'bg-green-500 text-white' 
                    : 'bg-red-500 text-white'
                }`}>
                  {answer.is_correct ? '✓' : '✗'}
                </div>
                <span className="font-medium text-gray-900">{answer.player_name}</span>
              </div>
              
              <div className="text-right">
                <div className="text-sm text-gray-600">
                  {answer.selected_option_id 
                    ? question.options.find(opt => opt.id === answer.selected_option_id)?.text
                    : 'No answer'
                  }
                </div>
                <div className="text-xs text-gray-500">
                  {answer.score_earned} pts • {answer.time_taken}s
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Next Question Button (Creator Only) */}
      {isCreator && (
        <div className="text-center mt-8">
          <button
            onClick={onNextQuestion}
            className="bg-primary-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-primary-700 transition-colors"
          >
            Next Question
          </button>
        </div>
      )}
    </div>
  )
}
