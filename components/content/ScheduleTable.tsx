interface Game {
  id: string
  date: string
  time: string
  homeTeam: string
  awayTeam: string
  venue: string
  level: string
  officials: string[]
  status?: 'scheduled' | 'completed' | 'cancelled'
}

interface ScheduleTableProps {
  games: Game[]
  showOfficials?: boolean
}

export default function ScheduleTable({ games, showOfficials = true }: ScheduleTableProps) {
  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600'
      case 'cancelled':
        return 'text-red-600'
      default:
        return 'text-blue-400'
    }
  }
  
  return (
    <div className="overflow-x-auto">
      <table className="w-full bg-white rounded-lg overflow-hidden shadow-lg">
        <thead className="bg-brand-secondary text-white">
          <tr>
            <th className="px-4 py-3 text-left">Date</th>
            <th className="px-4 py-3 text-left">Time</th>
            <th className="px-4 py-3 text-left">Teams</th>
            <th className="px-4 py-3 text-left">Venue</th>
            <th className="px-4 py-3 text-left">Level</th>
            {showOfficials && <th className="px-4 py-3 text-left">Officials</th>}
            <th className="px-4 py-3 text-left">Status</th>
          </tr>
        </thead>
        <tbody>
          {games.map((game, index) => (
            <tr 
              key={game.id}
              className={`border-b ${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'} hover:bg-gray-100 transition-colors`}
            >
              <td className="px-4 py-3">
                {new Date(game.date).toLocaleDateString('en-CA', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </td>
              <td className="px-4 py-3">{game.time}</td>
              <td className="px-4 py-3">
                <div className="font-semibold">{game.homeTeam}</div>
                <div className="text-sm text-gray-600">vs {game.awayTeam}</div>
              </td>
              <td className="px-4 py-3">{game.venue}</td>
              <td className="px-4 py-3">
                <span className="bg-brand-primary text-white px-2 py-1 rounded text-sm">
                  {game.level}
                </span>
              </td>
              {showOfficials && (
                <td className="px-4 py-3">
                  <div className="text-sm">
                    {game.officials.length > 0 ? (
                      game.officials.join(', ')
                    ) : (
                      <span className="text-gray-400">TBA</span>
                    )}
                  </div>
                </td>
              )}
              <td className="px-4 py-3">
                <span className={`font-semibold ${getStatusColor(game.status)}`}>
                  {game.status ? game.status.charAt(0).toUpperCase() + game.status.slice(1) : 'Scheduled'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}