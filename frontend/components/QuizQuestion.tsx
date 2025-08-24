'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'

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

interface QuizQuestionProps {
  question: Question
  onAnswerSubmit: (optionId: number) => void
  isCreator?: boolean
  currentQuestionIndex: number
  totalQuestions: number
  onTimeUpdate?: (timeLeft: number) => void
  externalTimeLeft?: number
  timeLeft?: number
}

export function QuizQuestion({ 
  question, 
  onAnswerSubmit, 
  isCreator = false,
  currentQuestionIndex,
  totalQuestions,
  onTimeUpdate,
  externalTimeLeft,
  timeLeft: externalTime
}: QuizQuestionProps) {
  // Safety check: ensure question exists and has required properties
  if (!question || !question.time_limit || !question.options) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center">
        <div className="text-lg text-gray-600">
          Loading question...
        </div>
      </div>
    )
  }

  const [timeLeft, setTimeLeft] = useState(externalTime || externalTimeLeft || question.time_limit)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [isAnswered, setIsAnswered] = useState(false)
  const [questionStarted, setQuestionStarted] = useState(false)

  // Start question when component mounts
  useEffect(() => {
    setQuestionStarted(true)
    setTimeLeft(externalTime || externalTimeLeft || question.time_limit)
    setSelectedOption(null)
    setIsAnswered(false)
  }, [question.id, externalTime, externalTimeLeft, question.time_limit])

  // Handle external time updates
  useEffect(() => {
    if (externalTime !== undefined) {
      setTimeLeft(externalTime)
    } else if (externalTimeLeft !== undefined) {
      setTimeLeft(externalTimeLeft)
    }
  }, [externalTime, externalTimeLeft])

  // Timer countdown
  useEffect(() => {
    if (!questionStarted || timeLeft <= 0) {
      if (timeLeft <= 0 && !isAnswered && !isCreator) {
        // Auto-submit if player hasn't answered
        onAnswerSubmit(-1) // -1 indicates no answer
      }
      return
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1)
    }, 1000)

    return () => clearInterval(timer)
  }, [timeLeft, isAnswered, isCreator, onAnswerSubmit, questionStarted])

  const handleOptionSelect = (optionId: number) => {
    if (isAnswered || isCreator) return
    
    setSelectedOption(optionId)
    setIsAnswered(true)
    onAnswerSubmit(optionId)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getTimeColor = () => {
    if (timeLeft > question.time_limit * 0.6) return 'text-green-600'
    if (timeLeft > question.time_limit * 0.3) return 'text-yellow-600'
    return 'text-red-600'
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Question Header */}
      <div className="text-center mb-8">
        <div className="text-sm text-gray-500 mb-2">
          Question {currentQuestionIndex + 1} of {totalQuestions}
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-4">
          {question.text}
        </h2>
        
        {/* Timer */}
        <div className="inline-flex items-center px-4 py-2 bg-gray-100 rounded-full">
          <div className={`text-2xl font-mono font-bold ${getTimeColor()}`}>
            {formatTime(timeLeft)}
          </div>
        </div>
      </div>

      {/* Answer Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {question.options.map((option) => (
          <Button
            key={option.id}
            variant={selectedOption === option.id ? "primary" : "secondary"}
            size="lg"
            className={`h-20 text-lg font-medium transition-all duration-200 ${
              selectedOption === option.id 
                ? 'ring-4 ring-primary-300 shadow-lg' 
                : 'hover:scale-105'
            }`}
            onClick={() => handleOptionSelect(option.id)}
            disabled={isAnswered || isCreator}
          >
            {option.text}
          </Button>
        ))}
      </div>

      {/* Status */}
      {isCreator && (
        <div className="text-center text-gray-600">
          <p>Players are answering this question...</p>
          <p className="text-sm">Time remaining: {formatTime(timeLeft)}</p>
        </div>
      )}

      {!isCreator && isAnswered && (
        <div className="text-center">
          <div className="inline-flex items-center px-4 py-2 bg-green-100 text-green-800 rounded-full">
            <span className="mr-2">✓</span>
            Answer submitted!
          </div>
        </div>
      )}
    </div>
  )
}
