'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
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

export default function PlayGamePage() {
  const [game, setGame] = useState<Game | null>(null)
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  
  // Quiz gameplay state
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(-1) // Start with -1 (no question)
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [gamePhase, setGamePhase] = useState<'waiting' | 'question' | 'results' | 'finished'>('waiting')
  const [playerAnswers, setPlayerAnswers] = useState<any[]>([])
  const [currentPlayerAnswer, setCurrentPlayerAnswer] = useState<number | null>(null)
  const [timeLeft, setTimeLeft] = useState<number>(0)
  
  const { gamePin } = useParams()
  const searchParams = useSearchParams()
  const playerId = searchParams.get('playerId')
  const playerName = searchParams.get('playerName')
  const router = useRouter()
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!gamePin || !playerId || !playerName) {
      router.push('/join')
      return
    }
    console.log('Component mounted with:', { gamePin, playerId, playerName })
    fetchGame()
    
    // Connect to WebSocket for real-time updates
    if (gamePin && playerId) {
      let ws: WebSocket | null = null
      let reconnectAttempts = 0
      const maxReconnectAttempts = 5
      const reconnectDelay = 1000 // 1 second

      const connectWebSocket = () => {
        try {
          console.log('Attempting to connect to WebSocket:', `ws://localhost:8080/ws/${gamePin}/${playerId}?playerName=${encodeURIComponent(playerName || '')}`)
          
          ws = new WebSocket(`ws://localhost:8080/ws/${gamePin}/${playerId}?playerName=${encodeURIComponent(playerName || '')}`)
          wsRef.current = ws
          
          ws.onopen = () => {
            console.log('WebSocket connected successfully for player')
            reconnectAttempts = 0 // Reset reconnect attempts on successful connection
            
            // Send player ready message to get game state sync
            if (ws) {
              const readyMessage = {
                type: 'player_ready',
                payload: {
                  player_id: playerId,
                  player_name: playerName
                }
              }
              console.log('Sending player ready message:', readyMessage)
              ws.send(JSON.stringify(readyMessage))
            }
          }
          
          ws.onmessage = (event) => {
            console.log('WebSocket message received:', event.data)
            try {
              const data = JSON.parse(event.data)
              console.log('Parsed message:', data)
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
            
            // Attempt to reconnect if not a normal closure and we haven't exceeded max attempts
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
  }, [gamePin, playerId, playerName, router])

  const handleWebSocketMessage = (data: any) => {
    console.log('Handling WebSocket message:', data.type, data.payload)
    
    switch (data.type) {
      case 'pong':
        console.log('WebSocket connection confirmed with pong response')
        break
        
      case 'quiz_started':
        console.log('Quiz started message received')
        setGamePhase('waiting') // Set to waiting for first question
        toast.success(data.payload.message || 'Quiz started! Get ready for questions!')
        break
        
      case 'player_update':
        if (data.payload.action === 'joined') {
          fetchGame()
          toast.success(`${data.payload.player.name} joined the game!`)
        } else if (data.payload.action === 'left') {
          fetchGame()
          toast.success(`${data.payload.player.name} left the game!`)
        }
        break
        
      case 'question_start':
        console.log('Received question_start message:', data.payload)
        
        // Extract question data from the message
        const questionData = data.payload.question
        if (questionData && questionData.id && questionData.text && questionData.options) {
          console.log('Setting current question from WebSocket:', questionData)
          
          // Set the current question directly from WebSocket data
          setCurrentQuestion(questionData)
          setCurrentQuestionIndex(data.payload.question_index)
          setCurrentPlayerAnswer(null)
          setTimeLeft(questionData.time_limit)
          setGamePhase('question')
          
          // Also update the quiz state to include this question
          setQuiz(prevQuiz => {
            const updatedQuiz = prevQuiz ? { ...prevQuiz } : {
              id: 0,
              title: 'Quiz',
              description: '',
              questions: []
            }
            
            // Ensure questions array exists and has enough elements
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
        break
        
      case 'score_update':
        // Update player scores in real-time
        if (data.payload.players) {
          setGame(prev => prev ? { ...prev, players: data.payload.players } : null)
        }
        // Show points earned notification
        if (data.payload.player_id === parseInt(playerId || '0')) {
          const pointsText = data.payload.is_correct ? 
            `+${data.payload.points_earned} points!` : 
            'Incorrect answer'
          toast.success(pointsText)
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
            // Quiz is active and has a current question
            console.log('Syncing to active quiz with question:', currentQuestionData)
            setCurrentQuestion(currentQuestionData)
            setCurrentQuestionIndex(questionIndex)
            setTimeLeft(currentQuestionData.time_limit)
            setGamePhase('question')
            
            // Update quiz state
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
            // Quiz is active but no current question yet
            setGamePhase('waiting')
            toast.success('Connected to active game! Waiting for next question...')
          }
        } else if (data.payload.game_status === 'waiting') {
          setGamePhase('waiting')
          toast.success('Connected to game! Waiting for quiz to start...')
        }
        
        // Update players if provided
        if (data.payload.players) {
          setGame(prev => prev ? { ...prev, players: data.payload.players } : null)
        }
        break
    }
  }

  const handleAnswerSubmit = (optionId: number) => {
    if (!currentQuestion || optionId === -1) return
    
    setCurrentPlayerAnswer(optionId)
    
    // Calculate time spent
    const timeSpent = currentQuestion.time_limit - timeLeft
    
    // Send answer to backend
    fetch(`/api/games/${gamePin}/answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        player_id: parseInt(playerId || '0'),
        question_id: currentQuestion.id,
        option_id: optionId,
        time_spent: timeSpent,
      }),
    }).catch(error => {
      console.error('Failed to submit answer:', error)
      toast.error('Failed to submit answer')
    })
  }

  const fetchGame = async () => {
    try {
      console.log('Fetching game data for pin:', gamePin)
      const response = await fetch(`/api/games/${gamePin}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch game')
      }

      const gameData = await response.json()
      console.log('Game data received:', gameData)
      
      setGame(gameData)
      
      // Set quiz data from the game response
      if (gameData.quiz) {
        console.log('Setting quiz data:', gameData.quiz)
        setQuiz(gameData.quiz)
      }
      
      // Check if quiz is already active and update state accordingly
      if (gameData.status === 'active') {
        console.log('Game is already active')
        // Don't set question phase here - wait for WebSocket sync
        setGamePhase('waiting')
        toast.success('Game is active - connecting to current state...')
      }
      
      setIsLoading(false)
    } catch (error) {
      console.error('Error fetching game:', error)
      toast.error('Failed to fetch game')
      router.push('/join')
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading game...</p>
        </div>
      </div>
    )
  }

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Game Not Found</h2>
          <p className="text-gray-600 mb-6">The game you're looking for doesn't exist or has ended.</p>
          <Button onClick={() => router.push('/join')}>
            Join Another Game
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
              <h1 className="text-2xl font-bold text-gray-900">{game.quiz.title}</h1>
              <p className="text-gray-600">Game PIN: {game.pin}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Playing as</p>
              <p className="font-medium text-gray-900">{playerName}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Show question if we have current question data and game phase is 'question' */}
        {gamePhase === 'question' && currentQuestion ? (
          <div className="space-y-8">
            <QuizQuestion
              question={currentQuestion}
              onAnswerSubmit={handleAnswerSubmit}
              isCreator={false}
              currentQuestionIndex={currentQuestionIndex}
              totalQuestions={quiz?.questions?.length || 1}
              timeLeft={timeLeft}
            />
            
            {/* Leaderboard */}
            <div className="max-w-2xl mx-auto">
              <GameLeaderboard
                players={game.players}
                currentQuestionIndex={currentQuestionIndex}
                totalQuestions={quiz?.questions?.length || 1}
              />
            </div>
          </div>
        ) : gamePhase === 'results' && currentQuestion ? (
          <div className="space-y-8">
            <QuestionResults
              question={currentQuestion}
              playerAnswers={playerAnswers}
              onNextQuestion={() => {}} // Players don't control next question
              isCreator={false}
            />
          </div>
        ) : gamePhase === 'finished' ? (
          <div className="text-center py-12">
            <div className="mx-auto h-24 w-24 text-green-500 mb-6">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">🎉 Quiz Complete!</h2>
            <p className="text-lg text-gray-600 mb-8">
              All questions have been answered. Here are the final results:
            </p>
            
            {/* Final Leaderboard */}
            <div className="max-w-2xl mx-auto">
              <GameLeaderboard
                players={game.players}
                currentQuestionIndex={quiz?.questions?.length || 0}
                totalQuestions={quiz?.questions?.length || 0}
              />
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
            {game.status === 'waiting' ? (
              <>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Waiting for Host</h3>
                <p className="text-lg text-gray-600 mb-8">
                  The quiz host will start the game soon. Get ready!
                </p>
                <div className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                  Waiting for quiz to start...
                </div>
              </>
            ) : game.status === 'active' ? (
              <>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Get Ready!</h3>
                <p className="text-lg text-gray-600 mb-8">
                  The quiz has started. Waiting for the next question...
                </p>
                <div className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                  Ready for questions
                </div>
              </>
            ) : (
              <>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Game Ended</h3>
                <p className="text-lg text-gray-600 mb-8">
                  This quiz has finished.
                </p>
              </>
            )}
          </div>
        )}

        {/* Players List */}
        <div className="card p-6 mt-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Players ({game.players.length})</h3>
          <div className="space-y-3">
            {game.players.map((player) => (
              <div
                key={player.id}
                className={`flex justify-between items-center p-3 rounded-lg ${
                  player.id.toString() === playerId
                    ? 'bg-primary-50 border border-primary-200'
                    : 'bg-gray-50'
                }`}
              >
                <span className="font-medium text-gray-900">
                  {player.name}
                  {player.id.toString() === playerId && (
                    <span className="ml-2 text-sm text-primary-600">(You)</span>
                  )}
                </span>
                <span className="text-lg font-bold text-primary-600">
                  {player.score} pts
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Debug Info (remove in production) */}
        <div className="card p-6 mt-6 bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Debug Info</h3>
          <div className="text-xs text-gray-600 space-y-1">
            <p>Game Status: {game.status}</p>
            <p>Game Phase: {gamePhase}</p>
            <p>Current Question Index: {currentQuestionIndex}</p>
            <p>Has Current Question: {currentQuestion ? 'Yes' : 'No'}</p>
            <p>Time Left: {timeLeft}s</p>
            <p>Player Answer: {currentPlayerAnswer || 'None'}</p>
          </div>
        </div>
      </main>
    </div>
  )
}