'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-hot-toast'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

interface AuthFormData {
  username?: string
  email: string
  password: string
}

interface AuthFormProps {
  isLogin: boolean
}

export function AuthForm({ isLogin }: AuthFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const { login } = useAuthStore()
  const { register, handleSubmit, formState: { errors } } = useForm<AuthFormData>()

  const onSubmit = async (data: AuthFormData) => {
    setIsLoading(true)
    
    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register'
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Authentication failed')
      }

      const result = await response.json()
      login(result.user, result.token)
      toast.success(isLogin ? 'Login successful!' : 'Registration successful!')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Authentication failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {!isLogin && (
        <div className="form-group">
          <label htmlFor="username" className="form-label">
            Username
          </label>
          <Input
            id="username"
            type="text"
            {...register('username', { required: !isLogin })}
            placeholder="Enter your username"
          />
          {errors.username && (
            <p className="text-sm text-red-600">{errors.username.message}</p>
          )}
        </div>
      )}

      <div className="form-group">
        <label htmlFor="email" className="form-label">
          Email
        </label>
        <Input
          id="email"
          type="email"
          {...register('email', { 
            required: 'Email is required',
            pattern: {
              value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
              message: 'Invalid email address'
            }
          })}
          placeholder="Enter your email"
        />
        {errors.email && (
          <p className="text-sm text-red-600">{errors.email.message}</p>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="password" className="form-label">
          Password
        </label>
        <Input
          id="password"
          type="password"
          {...register('password', { 
            required: 'Password is required',
            minLength: {
              value: 6,
              message: 'Password must be at least 6 characters'
            }
          })}
          placeholder="Enter your password"
        />
        {errors.password && (
          <p className="text-sm text-red-600">{errors.password.message}</p>
        )}
      </div>

      <Button
        type="submit"
        className="w-full"
        disabled={isLoading}
      >
        {isLoading ? 'Loading...' : (isLogin ? 'Login' : 'Register')}
      </Button>
    </form>
  )
}
