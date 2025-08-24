'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { AuthForm } from '@/components/AuthForm'
import { Button } from '@/components/ui/Button'

export default function HomePage() {
  const [showLogin, setShowLogin] = useState(true)
  const { user } = useAuthStore()
  const router = useRouter()

  if (user) {
    router.push('/dashboard')
    return null
  }

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">OpenQuiz</h1>
          <p className="text-lg text-gray-600">Create and play interactive quizzes in real-time</p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="card px-8 py-6">
          <div className="flex mb-6">
            <Button
              variant={showLogin ? 'primary' : 'secondary'}
              onClick={() => setShowLogin(true)}
              className="flex-1 mr-2"
            >
              Login
            </Button>
            <Button
              variant={!showLogin ? 'primary' : 'secondary'}
              onClick={() => setShowLogin(false)}
              className="flex-1 ml-2"
            >
              Register
            </Button>
          </div>

          <AuthForm isLogin={showLogin} />
        </div>
      </div>

      <div className="mt-8 text-center">
        <p className="text-sm text-gray-500">
          Want to join a game?{' '}
          <button
            onClick={() => router.push('/join')}
            className="text-primary-600 hover:text-primary-500 font-medium"
          >
            Enter Game PIN
          </button>
        </p>
      </div>
    </div>
  )
}
