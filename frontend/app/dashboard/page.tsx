'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/Button'
import { QuizCard } from '@/components/QuizCard'
import { CreateQuizModal } from '@/components/CreateQuizModal'
import { toast } from 'react-hot-toast'

interface Quiz {
  id: number
  title: string
  description: string
  questions: Question[]
  created_at: string
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

export default function DashboardPage() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const { user, token, logout } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (!user || !token) {
      router.push('/')
      return
    }
    fetchQuizzes()
  }, [user, token, router])

  const fetchQuizzes = async () => {
    try {
      const response = await fetch('/api/quizzes', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch quizzes')
      }

      const data = await response.json()
      setQuizzes(data)
    } catch (error) {
      toast.error('Failed to fetch quizzes')
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogout = () => {
    logout()
    router.push('/')
  }

  const handleQuizCreated = (newQuiz: Quiz) => {
    setQuizzes([newQuiz, ...quizzes])
    setShowCreateModal(false)
    toast.success('Quiz created successfully!')
  }

  const handleQuizDeleted = (quizId: number) => {
    setQuizzes(quizzes.filter(quiz => quiz.id !== quizId))
    toast.success('Quiz deleted successfully!')
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
              <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-gray-600">Welcome back, {user?.username}!</p>
            </div>
            <div className="flex items-center space-x-4">
              <Button onClick={() => setShowCreateModal(true)}>
                Create Quiz
              </Button>
              <Button variant="secondary" onClick={handleLogout}>
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {quizzes.length === 0 ? (
          <div className="text-center py-12">
            <div className="mx-auto h-24 w-24 text-gray-400">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="mt-4 text-lg font-medium text-gray-900">No quizzes yet</h3>
            <p className="mt-2 text-gray-500">Get started by creating your first quiz!</p>
            <Button onClick={() => setShowCreateModal(true)} className="mt-4">
              Create Quiz
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {quizzes.filter(quiz => quiz.questions).map((quiz) => (
              <QuizCard
                key={quiz.id}
                quiz={quiz}
                onDelete={handleQuizDeleted}
                onStartGame={(quizId) => router.push(`/game/${quizId}`)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Create Quiz Modal */}
      {showCreateModal && (
        <CreateQuizModal
          onClose={() => setShowCreateModal(false)}
          onQuizCreated={handleQuizCreated}
        />
      )}
    </div>
  )
}
