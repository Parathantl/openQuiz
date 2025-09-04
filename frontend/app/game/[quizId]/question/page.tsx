'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { toast } from 'react-hot-toast'
import { QuizQuestion } from '@/components/QuizQuestion'
import { GameLeaderboard } from '@/components/GameLeaderboard'
import { QuestionResults } from '@/components/QuestionResults'

interface Game {
  id: number
  pin: string
  status: string
  quiz: {
    id: number
    title: string
    description: string
    questions: Question[]
  }
  players: Player[]
}

interface Quiz {
  id: number
  title: string
  description: string
  questions: Question[]
}

interface Question {
  id: number
  text: string
  time_limit: number
  options: Option[]
}

interface Option {
  id: number
  text: string
  is_correct: boolean
}

interface Player {
  id: number
  name: string
  score: number
}

export default function QuestionPage() {
  const [game, setGame] = useState<Game | null>(null)
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  
  // Quiz gameplay state
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(-1)
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [gamePhase, setGamePhase] = useState<'waiting' | 'question' | 'results' | 'finished'>('waiting')
  const [playerAnswers, setPlayerAnswers] = useState<any[]>([])
  const [timeLeft, setTimeLeft] = useState<number>(0)
  const [gamePlayers, setGamePlayers] = useState<Player[]>([])
  
  const { quizId } = useParams()
  const router = useRouter()
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!quizId) {
      router.push('/dashboard')
      return
    }

    // Get token from localStorage
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/')
      return
    }

    fetchGame()
    
    // Connect to WebSocket for real-time updates
    if (quizId) {
      let ws: WebSocket | null = null
      let reconnectAttempts = 0
      const maxReconnectAttempts = 5
      const reconnectDelay = 1000

      const connectWebSocket = () => {
        try {
          const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080'
          ws = new WebSocket(`${wsUrl}/ws/creator/${quizId}?token=${token}`)
          wsRef.current = ws
          
          ws.onopen = () => {
            console.log('WebSocket connected successfully for creator')
            reconnectAttempts = 0
          }
          
          ws.onmessage = (event) => {
            console.log('WebSocket message received:', event.data)
            try {
              const data = JSON.parse(event.data)
              handleWebSocketMessage(data)
            } catch (error) {
              console.error('Error parsing WebSocket message:', error)
            }
          }
          
          ws.onerror = (error) => {
            console.error('WebSocket error:', error)
          }
          
          ws.onclose = (event) => {
            console.log('WebSocket disconnected:', { code: event.code, reason: event.reason })
            
            if (event.code !== 1000 && reconnectAttempts < maxReconnectAttempts) {
              reconnectAttempts++
              console.log(`Attempting to reconnect... (${reconnectAttempts}/${maxReconnectAttempts})`)
              setTimeout(connectWebSocket, reconnectDelay * reconnectAttempts)
            }
          }
        } catch (error) {
          console.error('Failed to create WebSocket connection:', error)
        }
      }

      connectWebSocket()
      
      return () => {
        if (ws) {
          ws.close(1000, 'Component unmounting')
        }
      }
    }
  }, [quizId, router])

  const handleWebSocketMessage = (data: any) => {
    console.log('Handling WebSocket message:', data.type, data.payload)
    
    switch (data.type) {
      case 'pong':
        console.log('WebSocket connection confirmed with pong response')
        break
        
      case 'quiz_started':
        console.log('Quiz started message received')
        setGamePhase('waiting')
        toast.success(data.payload.message || 'Quiz started! Get ready for questions!')
        break
        
      case 'question_start':
        console.log('Received question_start message:', data.payload)
        
        const questionData = data.payload.question
        if (questionData && questionData.id && questionData.text && questionData.options) {
          console.log('Setting current question from WebSocket:', questionData)
          
          setCurrentQuestion(questionData)
          setCurrentQuestionIndex(data.payload.question_index)
          setTimeLeft(questionData.time_limit)
          setGamePhase('question')
          
          setQuiz(prevQuiz => {
            const updatedQuiz = prevQuiz ? { ...prevQuiz } : {
              id: 0,
              title: 'Quiz',
              description: '',
              questions: []
            }
            
            if (!updatedQuiz.questions) {
              updatedQuiz.questions = []
            }
            while (updatedQuiz.questions.length <= data.payload.question_index) {
              updatedQuiz.questions.push({} as any)
            }
            updatedQuiz.questions[data.payload.question_index] = questionData
            
            return updatedQuiz
          })
          
          toast.success(`Question ${data.payload.question_index + 1} is now active!`)
        } else {
          console.error('Invalid question data received:', questionData)
          toast.error('Failed to load question data')
        }
        break
        
      case 'question_end':
        setGamePhase('results')
        setPlayerAnswers(data.payload.answers || [])
        // Update the current question with correct answers revealed
        if (data.payload.question) {
          setCurrentQuestion(data.payload.question)
        }
        if (data.payload.players) {
          setGamePlayers(data.payload.players)
        }
        break
        
      case 'timer_update':
        console.log('Timer update:', data.payload.time_left)
        setTimeLeft(data.payload.time_left)
        break
        
      case 'game_end':
        setGamePhase('finished')
        toast.success('Quiz completed!')
        break
        
      case 'game_state_sync':
        console.log('Received game state sync:', data.payload)
        
        if (data.payload.game_status === 'active') {
          const questionIndex = data.payload.current_question_index
          const currentQuestionData = data.payload.current_question
          
          if (questionIndex >= 0 && currentQuestionData) {
            console.log('Syncing to active quiz with question:', currentQuestionData)
            setCurrentQuestion(currentQuestionData)
            setCurrentQuestionIndex(questionIndex)
            setTimeLeft(currentQuestionData.time_limit)
            setGamePhase('question')
            
            setQuiz(prevQuiz => {
              const updatedQuiz = prevQuiz ? { ...prevQuiz } : {
                id: 0,
                title: 'Quiz',
                description: '',
                questions: []
              }
              
              if (!updatedQuiz.questions) {
                updatedQuiz.questions = []
              }
              while (updatedQuiz.questions.length <= questionIndex) {
                updatedQuiz.questions.push({} as any)
              }
              updatedQuiz.questions[questionIndex] = currentQuestionData
              
              return updatedQuiz
            })
            
            toast.success('Quiz is already in progress!')
          } else {
            setGamePhase('waiting')
            toast.success('Connected to active game! Waiting for next question...')
          }
        } else if (data.payload.game_status === 'waiting') {
          setGamePhase('waiting')
          toast.success('Connected to game! Waiting for players to join...')
        }
        
        if (data.payload.players) {
          setGamePlayers(data.payload.players)
        }
        break
    }
  }

  const fetchGame = async () => {
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        router.push('/')
        return
      }

      const response = await fetch(`/api/quizzes/${quizId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch quiz')
      }

      const quizData = await response.json()
      console.log('Quiz data received:', quizData)
      
      setQuiz(quizData)
      
      // Check if there's an active game for this quiz
      const gameResponse = await fetch(`/api/quizzes/${quizId}/game`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (gameResponse.ok) {
        const gameData = await gameResponse.json()
        setGame(gameData)
        
        if (gameData.status === 'active') {
          setGamePhase('waiting')
          toast.success('Game is active - connecting to current state...')
        }
      }
      
      setIsLoading(false)
    } catch (error) {
      console.error('Error fetching quiz:', error)
      toast.error('Failed to fetch quiz')
      router.push('/dashboard')
    }
  }

  const endQuestion = async () => {
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        router.push('/')
        return
      }

      const response = await fetch(`/api/games/${game?.pin}/end-question`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to end question')
      }

      toast.success('Question ended!')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to end question')
    }
  }

  const nextQuestion = async () => {
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        router.push('/')
        return
      }

      const response = await fetch(`/api/games/${game?.pin}/next`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to advance to next question')
      }
      
      toast.success('Moving to next question...')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to advance to next question')
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading question...</p>
        </div>
      </div>
    )
  }

  if (!quiz) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Quiz Not Found</h2>
          <p className="text-gray-600 mb-6">The quiz you're looking for doesn't exist.</p>
          <Button onClick={() => router.push('/dashboard')}>
            Back to Dashboard
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{quiz.title}</h1>
              <p className="text-gray-600">Question Mode</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Game PIN</p>
              <p className="font-medium text-gray-900">{game?.pin || 'Not started'}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Show question if we have current question data and game phase is 'question' */}
        {gamePhase === 'question' && currentQuestion ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Question */}
            <div className="lg:col-span-2">
              <QuizQuestion
                question={currentQuestion}
                onAnswerSubmit={() => {}} // Creator doesn't submit answers
                isCreator={true}
                currentQuestionIndex={currentQuestionIndex}
                totalQuestions={quiz?.questions?.length || 1}
                timeLeft={timeLeft}
              />
              
              {/* Quiz Controls */}
              <div className="text-center mt-8">
                <Button onClick={endQuestion} size="lg">
                  End Question
                </Button>
              </div>
            </div>
            
            {/* Leaderboard */}
            <div className="lg:col-span-1">
              <GameLeaderboard
                players={gamePlayers}
                currentQuestionIndex={currentQuestionIndex}
                totalQuestions={quiz.questions.length}
              />
            </div>
          </div>
        ) : gamePhase === 'results' && currentQuestion ? (
          <div className="space-y-8">
            <QuestionResults
              question={currentQuestion}
              playerAnswers={playerAnswers}
              onNextQuestion={nextQuestion}
              isCreator={true}
            />
            
            {/* Next Question Button */}
            <div className="text-center">
              <Button 
                onClick={nextQuestion}
                size="lg"
              >
                Next Question
              </Button>
            </div>
          </div>
        ) : gamePhase === 'finished' ? (
          <div className="text-center py-12">
            <div className="mx-auto h-24 w-24 text-green-500 mb-6">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">🎉 Quiz Complete!</h2>
            <p className="text-lg text-gray-600 mb-6">
              All questions have been answered. Here are the final results:
            </p>
            
            {/* Final Leaderboard */}
            <div className="max-w-2xl mx-auto">
              <GameLeaderboard
                players={gamePlayers}
                currentQuestionIndex={quiz?.questions?.length || 0}
                totalQuestions={quiz?.questions?.length || 0}
              />
            </div>
            
            {/* Back to Dashboard Button */}
            <div className="mt-8">
              <Button 
                onClick={() => router.push('/dashboard')}
                size="lg"
                variant="secondary"
              >
                Back to Dashboard
              </Button>
            </div>
          </div>
        ) : (
          /* Waiting states */
          <div className="text-center py-12">
            <div className="mx-auto h-24 w-24 text-blue-400 mb-6">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Waiting for Question</h3>
            <p className="text-lg text-gray-600 mb-8">
              The next question will appear here when it starts.
            </p>
            <div className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
              Ready for questions
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
