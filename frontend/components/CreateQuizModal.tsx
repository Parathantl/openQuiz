'use client'

import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { toast } from 'react-hot-toast'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

interface CreateQuizFormData {
  title: string
  description: string
  questions: {
    text: string
    time_limit: number
    order: number
    options: {
      text: string
      is_correct: boolean
      order: number
    }[]
  }[]
}

interface CreateQuizModalProps {
  onClose: () => void
  onQuizCreated: (quiz: any) => void
}

export function CreateQuizModal({ onClose, onQuizCreated }: CreateQuizModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { token } = useAuthStore()

  const { register, control, handleSubmit, formState: { errors }, watch } = useForm<CreateQuizFormData>({
    defaultValues: {
      title: '',
      description: '',
      questions: [
        {
          text: '',
          time_limit: 30,
          order: 1,
          options: [
            { text: '', is_correct: true, order: 1 },
            { text: '', is_correct: false, order: 2 },
            { text: '', is_correct: false, order: 3 },
            { text: '', is_correct: false, order: 4 }
          ]
        }
      ]
    }
  })

  const { fields: questionFields, append: appendQuestion, remove: removeQuestionField } = useFieldArray({
    control,
    name: 'questions'
  })

  const { fields: optionFields, append: appendOption, remove: removeOption } = useFieldArray({
    control,
    name: 'questions.0.options'
  })

  const onSubmit = async (data: CreateQuizFormData) => {
    setIsSubmitting(true)
    
    try {
      const response = await fetch('/api/quizzes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create quiz')
      }

      const quiz = await response.json()
      onQuizCreated(quiz)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create quiz')
    } finally {
      setIsSubmitting(false)
    }
  }

  const addQuestion = () => {
    const newOrder = questionFields.length + 1
    appendQuestion({
      text: '',
      time_limit: 30,
      order: newOrder,
      options: [
        { text: '', is_correct: true, order: 1 },
        { text: '', is_correct: false, order: 2 },
        { text: '', is_correct: false, order: 3 },
        { text: '', is_correct: false, order: 4 }
      ]
    })
  }

  const removeQuestion = (index: number) => {
    if (questionFields.length > 1) {
      removeQuestionField(index)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-900">Create New Quiz</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
          {/* Quiz Basic Info */}
          <div className="space-y-4">
            <div className="form-group">
              <label className="form-label">Quiz Title</label>
              <Input
                {...register('title', { required: 'Title is required' })}
                placeholder="Enter quiz title"
                error={errors.title?.message}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Description (Optional)</label>
              <Input
                {...register('description')}
                placeholder="Enter quiz description"
                error={errors.description?.message}
              />
            </div>
          </div>

          {/* Questions */}
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">Questions</h3>
              <Button type="button" onClick={addQuestion} variant="secondary">
                Add Question
              </Button>
            </div>

            {questionFields.map((question, questionIndex) => (
              <div key={question.id} className="border border-gray-200 rounded-lg p-4 space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="font-medium text-gray-900">Question {questionIndex + 1}</h4>
                  {questionFields.length > 1 && (
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={() => removeQuestion(questionIndex)}
                    >
                      Remove
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="form-group">
                    <label className="form-label">Question Text</label>
                    <Input
                      {...register(`questions.${questionIndex}.text`, { required: 'Question text is required' })}
                      placeholder="Enter question text"
                      error={errors.questions?.[questionIndex]?.text?.message}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Time Limit (seconds)</label>
                    <Input
                      type="number"
                      {...register(`questions.${questionIndex}.time_limit`, { 
                        required: 'Time limit is required',
                        min: { value: 5, message: 'Minimum 5 seconds' },
                        max: { value: 300, message: 'Maximum 300 seconds' }
                      })}
                      placeholder="30"
                      error={errors.questions?.[questionIndex]?.time_limit?.message}
                    />
                  </div>
                </div>

                {/* Options */}
                <div className="space-y-3">
                  <label className="form-label">Options</label>
                  {questionFields[questionIndex]?.options?.map((option, optionIndex) => (
                    <div key={optionIndex} className="flex items-center space-x-3">
                      <input
                        type="radio"
                        {...register(`questions.${questionIndex}.options.${optionIndex}.is_correct`)}
                        name={`correct-${questionIndex}`}
                        value={optionIndex.toString()}
                        className="text-primary-600 focus:ring-primary-500"
                      />
                      <Input
                        {...register(`questions.${questionIndex}.options.${optionIndex}.text`, { 
                          required: 'Option text is required' 
                        })}
                        placeholder={`Option ${optionIndex + 1}`}
                        className="flex-1"
                        error={errors.questions?.[questionIndex]?.options?.[optionIndex]?.text?.message}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Form Actions */}
          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Quiz'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
