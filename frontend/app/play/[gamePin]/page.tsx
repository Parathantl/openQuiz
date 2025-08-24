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
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
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
          console.log('Player ID:', playerId, 'Type:', typeof playerId)
          console.log('Player Name:', playerName)
          
          ws = new WebSocket(`ws://localhost:8080/ws/${gamePin}/${playerId}?playerName=${encodeURIComponent(playerName || '')}`)
          wsRef.current = ws
          
          ws.onopen = () => {
            console.log('WebSocket connected successfully for player')
            console.log('Connection details:', { gamePin, playerId, playerName })
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
              console.log('Current game state before handling message:', { gamePhase, currentQuestionIndex, quiz: quiz?.questions?.length })
              handleWebSocketMessage(data)
              console.log('Current game state after handling message:', { gamePhase, currentQuestionIndex, quiz: quiz?.questions?.length })
            } catch (error) {
              console.error('Error parsing WebSocket message:', error)
            }
          }
          
          ws.onerror = (error) => {
            console.error('WebSocket error:', error)
            console.error('WebSocket error details:', { gamePin, playerId, playerName })
          }
          
          ws.onclose = (event) => {
            console.log('WebSocket disconnected:', { code: event.code, reason: event.reason, gamePin, playerId, playerName })
            
            // Attempt to reconnect if not a normal closure and we haven't exceeded max attempts
            if (event.code !== 1000 && reconnectAttempts < maxReconnectAttempts) {
              reconnectAttempts++
              console.log(`Attempting to reconnect... (${reconnectAttempts}/${maxReconnectAttempts})`)
              setTimeout(connectWebSocket, reconnectDelay * reconnectAttempts)
            }
          }
        } catch (error) {
          console.error('Failed to create WebSocket connection:', error)
          console.error('Connection attempt details:', { gamePin, playerId, playerName })
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
  
  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])

  // Debug: Log quiz state changes
  useEffect(() => {
    console.log('Quiz state changed:', { 
      quizId: quiz?.id, 
      questionsCount: quiz?.questions?.length,
      questions: quiz?.questions?.map(q => ({ id: q.id, text: q.text?.substring(0, 50) }))
    })
    
    // Force a re-render when quiz state changes to ensure UI updates
    if (quiz?.questions && quiz.questions.length > 0) {
      console.log('Quiz questions loaded, triggering re-render')
    }
  }, [quiz])

  // Debug: Log gamePhase state changes
  useEffect(() => {
    console.log('Game phase changed:', gamePhase)
  }, [gamePhase])

  // Debug: Log currentQuestionIndex changes
  useEffect(() => {
    console.log('Current question index changed:', currentQuestionIndex)
  }, [currentQuestionIndex])

  const handleWebSocketMessage = (data: any) => {
    console.log('Handling WebSocket message:', data.type, data.payload)
    console.log('Current state before handling:', { gamePhase, currentQuestionIndex, quiz: quiz?.questions?.length, timeLeft })
    
    switch (data.type) {
      case 'pong':
        console.log('WebSocket connection confirmed with pong response')
        break
      case 'quiz_started':
        // Quiz has started, move to question phase
        console.log('Quiz started message received, updating state...')
        setGamePhase('question')
        setCurrentQuestionIndex(0)
        setCurrentPlayerAnswer(null)
        // Reset timer to first question time limit
        if (quiz?.questions?.[0]?.time_limit) {
          setTimeLeft(quiz.questions[0].time_limit)
        }
        toast.success(data.payload.message || 'Quiz started! First question is now active.')
        break
      case 'player_update':
        if (data.payload.action === 'joined') {
          // Refresh game data to get updated player list
          fetchGame()
          toast.success(`${data.payload.player.name} joined the game!`)
        } else if (data.payload.action === 'left') {
          // Refresh game data to get updated player list
          fetchGame()
          toast.success(`${data.payload.player.name} left the game!`)
        }
        break
      case 'question_start':
        console.log('Received question_start message:', data.payload)
        console.log('Current state before question_start:', { gamePhase, currentQuestionIndex, quiz: quiz?.questions?.length, timeLeft })
        
        // Update quiz data first if question data is provided
        if (data.payload.question) {
          const question = data.payload.question
          console.log('Processing question data:', question)
          
          // Validate that the question has all required properties
          if (question.id && question.text && question.time_limit && question.options) {
            setQuiz(prevQuiz => {
              if (!prevQuiz) {
                // If no quiz exists, create a new one with this question
                const newQuiz = {
                  id: 0,
                  title: 'Quiz',
                  description: '',
                  questions: [question]
                }
                console.log('Created new quiz with question:', newQuiz)
                return newQuiz
              }
              
              // Update existing quiz
              const updatedQuiz = { ...prevQuiz }
              // Ensure questions array exists and has enough elements
              if (!updatedQuiz.questions) {
                updatedQuiz.questions = []
              }
              // Ensure the array has enough elements
              while (updatedQuiz.questions.length <= data.payload.question_index) {
                updatedQuiz.questions.push({} as any)
              }
              updatedQuiz.questions[data.payload.question_index] = question
              console.log('Updated quiz with question:', updatedQuiz)
              return updatedQuiz
            })
          } else {
            console.warn('Received incomplete question data:', question)
          }
        }
        
        // Now update the game state after quiz data is processed
        setCurrentQuestionIndex(data.payload.question_index)
        setCurrentPlayerAnswer(null)
        
        // Reset timer to question time limit
        if (data.payload.question && data.payload.question.time_limit) {
          setTimeLeft(data.payload.question.time_limit)
        }
        
        // Set game phase to question last, after all data is ready
        setGamePhase('question')
        
        console.log('State after question_start processing:', { gamePhase: 'question', questionIndex: data.payload.question_index, timeLeft: data.payload.question?.time_limit })
        toast.success(`Question ${data.payload.question_index + 1} is now active!`)
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
        // Update timer for current question
        console.log('Timer update:', data.payload.time_left)
        setTimeLeft(data.payload.time_left)
        break
      case 'game_end':
        setGamePhase('finished')
        toast.success('Quiz completed!')
        break
      case 'game_state_sync':
        // Server is sending current game state
        console.log('Received game state sync:', data.payload)
        if (data.payload.game_status === 'active') {
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
    if (!game?.quiz?.questions) return
    
    setCurrentPlayerAnswer(optionId)
    
    // Calculate time spent (for now, just send 0 - in a real app you'd track actual time)
    const timeSpent = 0
    
    // Send answer to backend
    fetch(`/api/games/${gamePin}/answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        player_id: parseInt(playerId || '0'),
        question_id: game.quiz.questions[currentQuestionIndex]?.id,
        option_id: optionId,
        time_spent: timeSpent,
      }),
    }).catch(error => {
      console.error('Failed to submit answer:', error)
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
      console.log('Quiz data:', gameData.quiz)
      console.log('Questions count:', gameData.quiz?.questions?.length)
      
      setGame(gameData)
      
      // Set quiz data from the game response (now includes questions and options)
      if (gameData.quiz) {
        console.log('Setting quiz data:', gameData.quiz)
        setQuiz(gameData.quiz)
      } else {
        console.warn('No quiz data in game response')
      }
      
      // Check if quiz is already active and update state accordingly
      if (gameData.status === 'active') {
        console.log('Game is already active, setting question phase')
        setGamePhase('question')
        setCurrentQuestionIndex(0)
        toast.success('Quiz is already in progress!')
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
        {game.status === 'waiting' ? (
          <div className="text-center py-12">
            <div className="mx-auto h-24 w-24 text-gray-400 mb-6">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Waiting for Host</h3>
            <p className="text-lg text-gray-600 mb-8">
              The quiz host will start the game soon. Get ready!
            </p>
            <div className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
              Waiting...
            </div>
          </div>
        ) : game.status === 'active' ? (
          <>
            {/* Quiz Question */}
            {gamePhase === 'question' && quiz?.questions && quiz.questions[currentQuestionIndex] ? (
              <div className="space-y-8">
                <QuizQuestion
                  question={quiz.questions[currentQuestionIndex]}
                  onAnswerSubmit={handleAnswerSubmit}
                  isCreator={false}
                  currentQuestionIndex={currentQuestionIndex}
                  totalQuestions={quiz.questions.length}
                  timeLeft={timeLeft}
                />
                
                {/* Leaderboard */}
                <div className="max-w-2xl mx-auto">
                  <GameLeaderboard
                    players={game.players}
                    currentQuestionIndex={currentQuestionIndex}
                    totalQuestions={quiz.questions.length}
                  />
                </div>
              </div>
            ) : gamePhase === 'question' ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Loading Question...</h3>
                <p className="text-gray-600 mb-4">Preparing question {currentQuestionIndex + 1}</p>
                <div className="text-sm text-gray-500 space-y-1">
                  <p>Debug Info:</p>
                  <p>Game Phase: {gamePhase}</p>
                  <p>Current Question Index: {currentQuestionIndex}</p>
                  <p>Quiz Questions Count: {quiz?.questions?.length || 0}</p>
                  <p>Current Question Exists: {quiz?.questions?.[currentQuestionIndex] ? 'Yes' : 'No'}</p>
                  {quiz?.questions?.[currentQuestionIndex] && (
                    <p>Question Text: {quiz.questions[currentQuestionIndex].text?.substring(0, 50)}...</p>
                  )}
                </div>
              </div>
            ) : null}

            {/* Question Results */}
            {gamePhase === 'results' && quiz?.questions && quiz.questions[currentQuestionIndex] && (
              <div className="space-y-8">
                <QuestionResults
                  question={quiz.questions[currentQuestionIndex]}
                  playerAnswers={playerAnswers}
                  onNextQuestion={() => {}} // Players don't control next question
                  isCreator={false}
                />
              </div>
            )}

            {/* Quiz Finished */}
            {gamePhase === 'finished' && (
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
            )}

            {/* Waiting for Questions */}
            {gamePhase === 'waiting' && (
              <div className="text-center py-12">
                <div className="mx-auto h-24 w-24 text-blue-400 mb-6">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Waiting for Questions</h3>
                <p className="text-lg text-gray-600 mb-8">
                  The host will start the quiz questions soon. Get ready to answer!
                </p>
                <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                  Ready
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Game Ended</h3>
            <p className="text-lg text-gray-600 mb-8">
              This quiz has finished. Check the final results below.
            </p>
          </div>
        )}

        {/* Players List */}
        <div className="card p-6 mt-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Players</h3>
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

        {/* Game Status */}
        <div className="card p-6 mt-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Game Status</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-sm text-gray-500">Status</p>
              <p className="text-lg font-semibold text-gray-900 capitalize">{game.status}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Players</p>
              <p className="text-lg font-semibold text-gray-900">{game.players.length}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Game PIN</p>
              <p className="text-lg font-mono font-semibold text-primary-600">{game.pin}</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
