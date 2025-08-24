'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/Button'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'react-hot-toast'
import { QuizQuestion } from '@/components/QuizQuestion'
import { GameLeaderboard } from '@/components/GameLeaderboard'
import { QuestionResults } from '@/components/QuestionResults'

interface Quiz {
  id: number
  title: string
  description: string
  questions: Question[]
  user_id: number
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

interface Game {
  id: number
  pin: string
  status: string
  quiz: Quiz
}

export default function GamePage() {
  const [game, setGame] = useState<Game | null>(null)
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [quizStarted, setQuizStarted] = useState(false)
  const [isStartingQuiz, setIsStartingQuiz] = useState(false)
  
  // Quiz gameplay state
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [gamePhase, setGamePhase] = useState<'waiting' | 'question' | 'results' | 'finished'>('waiting')
  const [playerAnswers, setPlayerAnswers] = useState<any[]>([])
  const [gamePlayers, setGamePlayers] = useState<any[]>([])
  const [timeLeft, setTimeLeft] = useState<number>(0)
  
  const { quizId } = useParams()
  const { user, token } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (!user || !token) {
      router.push('/')
      return
    }
    fetchQuiz()
  }, [user, token, router, quizId])

  // WebSocket connection for real-time quiz updates
  useEffect(() => {
    if (!game?.pin || !user) return

    let ws: WebSocket | null = null
    let reconnectAttempts = 0
    const maxReconnectAttempts = 5
    const reconnectDelay = 1000 // 1 second

    const connectWebSocket = () => {
      try {
        console.log('Host attempting to connect to WebSocket:', `ws://localhost:8080/ws/${game.pin}/${user.id}?playerName=${encodeURIComponent(user.username)}`)
        console.log('Host connection details:', { gamePin: game.pin, userId: user.id, username: user.username })
        
        ws = new WebSocket(`ws://localhost:8080/ws/${game.pin}/${user.id}?playerName=${encodeURIComponent(user.username)}`)
        
        ws.onopen = () => {
          console.log('WebSocket connected successfully for quiz host')
          console.log('Host connection established:', { gamePin: game.pin, userId: user.id, username: user.username })
          reconnectAttempts = 0 // Reset reconnect attempts on successful connection
          
          // Send player ready message to get game state sync
          if (ws) {
            const readyMessage = {
              type: 'player_ready',
              payload: {
                player_id: user.id,
                player_name: user.username
              }
            }
            console.log('Host sending player ready message:', readyMessage)
            ws.send(JSON.stringify(readyMessage))
          }
        }
        
        ws.onmessage = (event) => {
          console.log('Host WebSocket message received:', event.data)
          try {
            const data = JSON.parse(event.data)
            console.log('Host parsed message:', data)
            handleWebSocketMessage(data)
          } catch (error) {
            console.error('Error parsing WebSocket message:', error)
          }
        }
        
        ws.onerror = (error) => {
          console.error('Host WebSocket error:', error)
          console.error('Host connection error details:', { gamePin: game.pin, userId: user.id, username: user.username })
        }
        
        ws.onclose = (event) => {
          console.log('Host WebSocket disconnected:', { code: event.code, reason: event.reason, gamePin: game.pin, userId: user.id })
          
          // Attempt to reconnect if not a normal closure and we haven't exceeded max attempts
          if (event.code !== 1000 && reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++
            console.log(`Host attempting to reconnect... (${reconnectAttempts}/${maxReconnectAttempts})`)
            setTimeout(connectWebSocket, reconnectDelay * reconnectAttempts)
          }
        }
      } catch (error) {
        console.error('Host failed to create WebSocket connection:', error)
        console.error('Host connection attempt details:', { gamePin: game.pin, userId: user.id, username: user.username })
      }
    }

    connectWebSocket()
    
    return () => {
      if (ws) {
        ws.close(1000, 'Component unmounting')
      }
    }
  }, [game?.pin, user])

  const fetchQuiz = async () => {
    try {
      const response = await fetch(`/api/quizzes/${quizId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch quiz')
      }

      const quiz = await response.json()
      // Store quiz data for later use
      setQuiz(quiz)
      setIsLoading(false)
    } catch (error) {
      toast.error('Failed to fetch quiz')
      router.push('/dashboard')
    }
  }

  const handleWebSocketMessage = (data: any) => {
    console.log('WebSocket message received:', data.type, data.payload)
    
    switch (data.type) {
      case 'quiz_started':
        // Quiz has started, move to question phase
        setQuizStarted(true)
        setGamePhase('question')
        setCurrentQuestionIndex(0)
        setPlayerAnswers([])
        // Reset timer to first question time limit
        if (quiz?.questions?.[0]?.time_limit) {
          setTimeLeft(quiz.questions[0].time_limit)
        }
        toast.success(data.payload.message || 'Quiz started! First question is now active.')
        break
      case 'question_start':
        setGamePhase('question')
        setCurrentQuestionIndex(data.payload.question_index)
        setPlayerAnswers([])
        // Reset timer to question time limit
        if (data.payload.question && data.payload.question.time_limit) {
          setTimeLeft(data.payload.question.time_limit)
        }
        // Update quiz data if question data is provided
        if (data.payload.question && quiz) {
          const question = data.payload.question
          // Validate that the question has all required properties
          if (question.id && question.text && question.time_limit && question.options) {
            const updatedQuiz = { ...quiz }
            // Ensure questions array exists and has enough elements
            if (!updatedQuiz.questions) {
              updatedQuiz.questions = []
            }
            // Ensure the array has enough elements
            while (updatedQuiz.questions.length <= data.payload.question_index) {
              updatedQuiz.questions.push({} as any)
            }
            updatedQuiz.questions[data.payload.question_index] = question
            setQuiz(updatedQuiz)
          } else {
            console.warn('Received incomplete question data:', question)
          }
        }
        toast.success(`Question ${data.payload.question_index + 1} is now active!`)
        break
      case 'question_end':
        setGamePhase('results')
        setPlayerAnswers(data.payload.answers || [])
        break
      case 'game_end':
        setGamePhase('finished')
        toast.success('Quiz completed!')
        break
      case 'player_joined':
        // Update player list
        fetchGameStatus(game?.pin || '')
        break
      case 'player_left':
        // Update player list
        fetchGameStatus(game?.pin || '')
        break
      case 'player_update':
        // Handle player updates
        if (data.payload.action === 'joined') {
          fetchGameStatus(game?.pin || '')
          toast.success(`${data.payload.player.name} joined the game!`)
        } else if (data.payload.action === 'left') {
          fetchGameStatus(game?.pin || '')
          toast.success(`${data.payload.player.name} left the game!`)
        }
        break
      case 'timer_update':
        // Update timer for current question
        console.log('Timer update:', data.payload.time_left)
        setTimeLeft(data.payload.time_left)
        break
      case 'game_state_sync':
        // Server is sending current game state
        console.log('Received game state sync:', data.payload)
        if (data.payload.game_status === 'active') {
          setQuizStarted(true)
          setGamePhase('question')
          setCurrentQuestionIndex(data.payload.current_question_index || 0)
          
          // Set timer based on current question
          if (data.payload.current_question && data.payload.current_question.time_limit) {
            setTimeLeft(data.payload.current_question.time_limit)
          }
          
          // Update quiz with current question if available
          if (data.payload.current_question && quiz) {
            const question = data.payload.current_question
            // Validate that the question has all required properties
            if (question.id && question.text && question.time_limit && question.options) {
              const updatedQuiz = { ...quiz }
              // Ensure questions array exists and has enough elements
              if (!updatedQuiz.questions) {
                updatedQuiz.questions = []
              }
              // Ensure the array has enough elements
              while (updatedQuiz.questions.length <= data.payload.current_question_index) {
                updatedQuiz.questions.push({} as any)
              }
              updatedQuiz.questions[data.payload.current_question_index] = question
              setQuiz(updatedQuiz)
            } else {
              console.warn('Received incomplete current question data:', question)
            }
          }
          
          toast.success('Quiz is already in progress!')
        } else if (data.payload.game_status === 'waiting') {
          setGamePhase('waiting')
          toast.success('Connected to game! Waiting for players to join...')
        }
        
        // Update players if provided
        if (data.payload.players) {
          setGamePlayers(data.payload.players)
        }
        break
    }
  }

  const fetchGameStatus = async (gamePin: string) => {
    try {
      const response = await fetch(`/api/games/${gamePin}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch game status')
      }

      const updatedGame = await response.json()
      setGame(updatedGame)
    } catch (error) {
      console.error('Failed to fetch game status:', error)
    }
  }

  const startQuestion = () => {
    if (!game?.quiz?.questions || currentQuestionIndex >= game.quiz.questions.length) {
      setGamePhase('finished')
      return
    }
    setGamePhase('question')
  }

  const endQuestion = () => {
    setGamePhase('results')
    // In a real implementation, this would be triggered by the backend
    // after the timer expires or all players have answered
  }

  const nextQuestion = () => {
    const nextIndex = currentQuestionIndex + 1
    if (nextIndex >= (quiz?.questions?.length || 0)) {
      setGamePhase('finished')
    } else {
      setCurrentQuestionIndex(nextIndex)
      setGamePhase('question')
      setPlayerAnswers([])
    }
  }

  const startGame = async () => {
    setIsStarting(true)
    
    try {
      const response = await fetch('/api/games', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          quiz_id: parseInt(quizId as string),
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to start game')
      }

      const newGame = await response.json()
      setGame(newGame)
      toast.success('Game started successfully!')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start game')
    } finally {
      setIsStarting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
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
              <h1 className="text-2xl font-bold text-gray-900">Game Setup</h1>
              <p className="text-gray-600">Get ready to start your quiz!</p>
            </div>
            <Button variant="secondary" onClick={() => router.push('/dashboard')}>
              Back to Dashboard
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!game ? (
          <div className="text-center py-12">
            <div className="mx-auto h-24 w-24 text-gray-400 mb-6">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Ready to Start?</h3>
            <p className="text-lg text-gray-600 mb-8">
              Click the button below to start your quiz and generate a game PIN for players to join.
            </p>
            <Button onClick={startGame} disabled={isStarting} size="lg">
              {isStarting ? 'Starting Game...' : 'Start Game'}
            </Button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Game Info */}
            <div className="card p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Game Started!</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-medium text-gray-700 mb-2">Game PIN</h3>
                  <div className="text-4xl font-mono font-bold text-primary-600 bg-gray-100 px-4 py-2 rounded-lg">
                    {game.pin}
                  </div>
                  <p className="text-sm text-gray-500 mt-2">
                    Share this PIN with players so they can join
                  </p>
                </div>
                <div>
                  <h3 className="font-medium text-gray-700 mb-2">Status</h3>
                  <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                    {game.status}
                  </div>
                </div>
              </div>
            </div>

            {/* QR Code */}
            <div className="card p-6 text-center">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">QR Code</h3>
              <div className="inline-block p-4 bg-white rounded-lg shadow-sm">
                <QRCodeSVG
                  value={`${window.location.origin}/join?pin=${game.pin}`}
                  size={200}
                  level="M"
                />
              </div>
              <p className="text-sm text-gray-500 mt-3">
                Players can scan this QR code to join the game
              </p>
            </div>

            {/* Instructions */}
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">How to Play</h3>
              <div className="space-y-3 text-gray-600">
                <p>1. Share the game PIN or QR code with your players</p>
                <p>2. Players can join by visiting the join page or scanning the QR code</p>
                <p>3. Once all players have joined, you can start the quiz</p>
                <p>4. Questions will be displayed one by one with timers</p>
                <p>5. Players submit answers and see real-time scores</p>
              </div>
            </div>

            {/* Start Quiz Button */}
            <div className="text-center">
              <Button 
                size="lg" 
                disabled={isStartingQuiz}
                onClick={async () => {
                  setIsStartingQuiz(true)
                  try {
                    const response = await fetch(`/api/games/${game.pin}/start`, {
                      method: 'POST',
                      headers: {
                        'Authorization': `Bearer ${token}`,
                      },
                    })
                    
                    if (!response.ok) {
                      const error = await response.json()
                      throw new Error(error.error || 'Failed to start quiz')
                    }
                    
                    toast.success('Quiz started successfully!')
                    // Update local state instead of reloading
                    setQuizStarted(true)
                    // WebSocket will handle the phase change automatically
                    // Fetch updated game status from backend
                    await fetchGameStatus(game.pin)
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : 'Failed to start quiz')
                  } finally {
                    setIsStartingQuiz(false)
                  }
                }}
              >
                {isStartingQuiz ? 'Starting Quiz...' : 'Start Quiz Questions'}
              </Button>
            </div>
          </div>
        )}

        {/* Quiz Gameplay UI */}
        {quizStarted && gamePhase === 'question' && quiz?.questions && quiz.questions[currentQuestionIndex] && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Question Display */}
              <div className="lg:col-span-2">
                <QuizQuestion
                  question={quiz.questions[currentQuestionIndex]}
                  onAnswerSubmit={() => {}} // Creator doesn't answer
                  isCreator={true}
                  currentQuestionIndex={currentQuestionIndex}
                  totalQuestions={quiz.questions.length}
                  timeLeft={timeLeft}
                />
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
            
            {/* Quiz Controls */}
            <div className="text-center">
              <Button onClick={endQuestion} size="lg">
                End Question
              </Button>
            </div>
          </div>
        )}

        {/* Question Results */}
        {quizStarted && gamePhase === 'results' && quiz?.questions && quiz.questions[currentQuestionIndex] && (
          <div className="space-y-8">
            <QuestionResults
              question={quiz.questions[currentQuestionIndex]}
              playerAnswers={playerAnswers}
              onNextQuestion={() => {}} // Creator doesn't control next question manually
              isCreator={true}
            />
            
            {/* Next Question Button */}
            <div className="text-center">
              <Button 
                onClick={async () => {
                  try {
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
                    // The WebSocket will handle the phase change automatically
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : 'Failed to advance to next question')
                  }
                }}
                size="lg"
              >
                Next Question
              </Button>
            </div>
          </div>
        )}

        {/* Quiz Finished */}
        {quizStarted && gamePhase === 'finished' && (
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
          </div>
        )}
      </main>
    </div>
  )
}
