'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { toast } from 'react-hot-toast'
import { useAuthStore } from '@/stores/authStore'

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

interface QuizCardProps {
  quiz: Quiz
  onDelete: (quizId: number) => void
  onStartGame: (quizId: number) => void
}

export function QuizCard({ quiz, onDelete, onStartGame }: QuizCardProps) {
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this quiz?')) {
      return
    }

    setIsDeleting(true)
    try {
      const { token } = useAuthStore.getState()
      const response = await fetch(`/api/quizzes/${quiz.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to delete quiz')
      }

      onDelete(quiz.id)
    } catch (error) {
      toast.error('Failed to delete quiz')
    } finally {
      setIsDeleting(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  return (
    <div className="card p-6 hover:shadow-xl transition-shadow duration-200">
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <h3 className="text-xl font-semibold text-gray-900 mb-2">{quiz.title}</h3>
          {quiz.description && (
            <p className="text-gray-600 text-sm mb-3">{quiz.description}</p>
          )}
          <div className="flex items-center text-sm text-gray-500">
            <span>{quiz.questions?.length || 0} questions</span>
            <span className="mx-2">•</span>
            <span>Created {formatDate(quiz.created_at)}</span>
          </div>
        </div>
      </div>

      <div className="flex space-x-3">
        <Button
          onClick={() => onStartGame(quiz.id)}
          className="flex-1"
        >
          Start Game
        </Button>
        <Button
          variant="secondary"
          onClick={() => {/* TODO: Edit quiz */}}
          className="flex-1"
        >
          Edit
        </Button>
        <Button
          variant="danger"
          onClick={handleDelete}
          disabled={isDeleting}
          size="sm"
        >
          {isDeleting ? 'Deleting...' : 'Delete'}
        </Button>
      </div>
    </div>
  )
}
