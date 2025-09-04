'use client'

interface Player {
  id: number
  name: string
  score: number
}

interface GameLeaderboardProps {
  players: Player[]
  currentQuestionIndex: number
  totalQuestions: number
}

export function GameLeaderboard({ players, currentQuestionIndex, totalQuestions }: GameLeaderboardProps) {
  // Sort players by score (highest first)
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score)

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="text-center mb-6">
        <h3 className="text-xl font-bold text-gray-900 mb-2">Leaderboard</h3>
        <p className="text-sm text-gray-600">
          Question {currentQuestionIndex + 1} of {totalQuestions}
        </p>
      </div>

      <div className="space-y-3">
        {sortedPlayers.map((player, index) => (
          <div
            key={player.id}
            className={`flex items-center justify-between p-3 rounded-lg transition-all duration-200 ${
              index === 0 
                ? 'bg-yellow-50 border border-yellow-200' 
                : index === 1 
                ? 'bg-gray-50 border border-gray-200'
                : index === 2
                ? 'bg-orange-50 border border-orange-200'
                : 'bg-white border border-gray-100'
            }`}
          >
            <div className="flex items-center space-x-3">
              {/* Position Badge */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                index === 0 
                  ? 'bg-yellow-500 text-white' 
                  : index === 1 
                  ? 'bg-gray-500 text-white'
                  : index === 2
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-300 text-gray-700'
              }`}>
                {index + 1}
              </div>
              
              {/* Player Name */}
              <span className="font-medium text-gray-900">{player.name}</span>
            </div>
            
            {/* Score */}
            <div className="text-right">
              <div className="text-lg font-bold text-gray-900">{player.score}</div>
              <div className="text-xs text-gray-500">points</div>
            </div>
          </div>
        ))}
      </div>

      {/* Progress Bar */}
      <div className="mt-6">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>Progress</span>
          <span>{Math.round((Math.min(currentQuestionIndex + 1, totalQuestions) / totalQuestions) * 100)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-primary-600 h-2 rounded-full transition-all duration-500"
            style={{ width: `${(Math.min(currentQuestionIndex + 1, totalQuestions) / totalQuestions) * 100}%` }}
          ></div>
        </div>
      </div>
    </div>
  )
}
