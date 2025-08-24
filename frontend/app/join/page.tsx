'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { toast } from 'react-hot-toast'

export default function JoinGamePage() {
  const [gamePin, setGamePin] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [isJoining, setIsJoining] = useState(false)
  const router = useRouter()

  const handleJoinGame = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!gamePin.trim() || !playerName.trim()) {
      toast.error('Please enter both game PIN and player name')
      return
    }

    setIsJoining(true)
    
    try {
      const response = await fetch(`/api/games/${gamePin}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pin: gamePin,
          name: playerName,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to join game')
      }

      const player = await response.json()
      toast.success('Successfully joined the game!')
      
      // Redirect to game page
      router.push(`/play/${gamePin}?playerId=${player.id}&playerName=${encodeURIComponent(playerName)}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to join game')
    } finally {
      setIsJoining(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Join Game</h1>
          <p className="text-lg text-gray-600">Enter the game PIN to join</p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="card px-8 py-6">
          <form onSubmit={handleJoinGame} className="space-y-6">
            <div className="form-group">
              <label htmlFor="gamePin" className="form-label">
                Game PIN
              </label>
              <Input
                id="gamePin"
                type="text"
                value={gamePin}
                onChange={(e) => setGamePin(e.target.value)}
                placeholder="Enter 6-digit PIN"
                maxLength={6}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="playerName" className="form-label">
                Your Name
              </label>
              <Input
                id="playerName"
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name"
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isJoining}
            >
              {isJoining ? 'Joining...' : 'Join Game'}
            </Button>
          </form>
        </div>
      </div>

      <div className="mt-8 text-center">
        <p className="text-sm text-gray-500">
          Don't have a game PIN?{' '}
          <button
            onClick={() => router.push('/')}
            className="text-primary-600 hover:text-primary-500 font-medium"
          >
            Go back home
          </button>
        </p>
      </div>
    </div>
  )
}
