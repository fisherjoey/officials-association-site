'use client'

import { IconCheck, IconPencil } from '@tabler/icons-react'
import { UseFormWatch } from 'react-hook-form'
import { formatDate as formatDateUtil, PROVINCE_LABELS } from '@/lib/constants'

interface Step5ReviewProps {
  watch: UseFormWatch<any>
  onEditStep: (step: number) => void
  eventCount: number
}

const formatDate = (dateString: string): string => {
  if (!dateString) return 'N/A'
  return formatDateUtil(dateString, 'full')
}

// Format time to 12-hour format
const formatTime = (timeString: string): string => {
  if (!timeString) return 'N/A'
  const [hours, minutes] = timeString.split(':')
  const hour = parseInt(hours, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  return `${displayHour}:${minutes} ${ampm}`
}

const getProvinceName = (code: string): string => PROVINCE_LABELS[code] || code

export default function Step5Review({ watch, onEditStep, eventCount }: Step5ReviewProps) {
  const organizationName = watch('organizationName')

  const billingContactName = watch('billingContactName')
  const billingEmail = watch('billingEmail')
  const billingPhone = watch('billingPhone')
  const billingAddress = watch('billingAddress')
  const billingCity = watch('billingCity')
  const billingProvince = watch('billingProvince')
  const billingPostalCode = watch('billingPostalCode')

  const eventContactName = watch('eventContactName')
  const eventContactEmail = watch('eventContactEmail')
  const eventContactPhone = watch('eventContactPhone')

  const eventType = watch('eventType')
  const leagues = watch('leagues') || []
  const tournaments = watch('tournaments') || []
  const exhibitions = watch('exhibitions') || []
  const disciplinePolicy = watch('disciplinePolicy')
  const agreement = watch('agreement')

  // Get event type label
  const getEventTypeLabel = () => {
    if (eventType === 'League') return eventCount === 1 ? 'League' : 'Leagues'
    if (eventType === 'Tournament') return eventCount === 1 ? 'Tournament' : 'Tournaments'
    if (eventType === 'Exhibition Game(s)') return eventCount === 1 ? 'Exhibition' : 'Exhibitions'
    return 'Events'
  }

  return (
    <div className="space-y-6">
      {/* Organization Section */}
      <div className="border border-gray-300 rounded-lg p-6 bg-white">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-brand-secondary">Organization Information</h3>
          <button
            type="button"
            onClick={() => onEditStep(1)}
            className="flex items-center gap-1 text-sm text-brand-primary hover:text-orange-700 transition-colors"
          >
            <IconPencil size={16} />
            Edit
          </button>
        </div>
        <div>
          <p className="text-gray-900 font-medium">{organizationName || 'N/A'}</p>
        </div>
      </div>

      {/* Billing Section */}
      <div className="border border-gray-300 rounded-lg p-6 bg-white">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-brand-secondary">Billing Information</h3>
          <button
            type="button"
            onClick={() => onEditStep(2)}
            className="flex items-center gap-1 text-sm text-brand-primary hover:text-orange-700 transition-colors"
          >
            <IconPencil size={16} />
            Edit
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <p className="text-sm text-gray-600">Contact Name</p>
            <p className="text-gray-900 font-medium">{billingContactName || 'N/A'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Email</p>
            <p className="text-gray-900 font-medium">{billingEmail || 'N/A'}</p>
          </div>
          {billingPhone && (
            <div>
              <p className="text-sm text-gray-600">Phone</p>
              <p className="text-gray-900 font-medium">{billingPhone}</p>
            </div>
          )}
          <div>
            <p className="text-sm text-gray-600">Address</p>
            <p className="text-gray-900 font-medium">
              {billingAddress || 'N/A'}
              {billingAddress && <br />}
              {billingCity && billingProvince && billingPostalCode && (
                <>
                  {billingCity}, {getProvinceName(billingProvince)} {billingPostalCode}
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Event Contact Section */}
      <div className="border border-gray-300 rounded-lg p-6 bg-white">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-brand-secondary">Event Contact</h3>
          <button
            type="button"
            onClick={() => onEditStep(3)}
            className="flex items-center gap-1 text-sm text-brand-primary hover:text-orange-700 transition-colors"
          >
            <IconPencil size={16} />
            Edit
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <p className="text-sm text-gray-600">Contact Name</p>
            <p className="text-gray-900 font-medium">{eventContactName || 'N/A'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Email</p>
            <p className="text-gray-900 font-medium">{eventContactEmail || 'N/A'}</p>
          </div>
          {eventContactPhone && (
            <div>
              <p className="text-sm text-gray-600">Phone</p>
              <p className="text-gray-900 font-medium">{eventContactPhone}</p>
            </div>
          )}
        </div>
      </div>

      {/* Events Section */}
      <div className="border border-gray-300 rounded-lg p-6 bg-white">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-brand-secondary">{getEventTypeLabel()} ({eventCount})</h3>
          <button
            type="button"
            onClick={() => onEditStep(4)}
            className="flex items-center gap-1 text-sm text-brand-primary hover:text-orange-700 transition-colors"
          >
            <IconPencil size={16} />
            Edit
          </button>
        </div>

        {/* Event Type Badge */}
        <div className="mb-4">
          <span className="inline-block px-3 py-1 bg-brand-secondary text-white rounded-full text-sm font-medium">
            {eventType || 'N/A'}
          </span>
        </div>

        <div className="space-y-4">
          {/* Leagues */}
          {eventType === 'League' && leagues.map((league: any, index: number) => (
            <div key={index} className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-sm flex-shrink-0">
                  {index + 1}
                </span>
                <div className="flex-1 space-y-2">
                  <div>
                    <p className="text-sm text-gray-600">League Name</p>
                    <p className="text-gray-900 font-medium">{league.leagueName || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Dates</p>
                    <p className="text-gray-900">
                      {formatDate(league.leagueStartDate)} - {formatDate(league.leagueEndDate)}
                    </p>
                  </div>
                  {league.leagueDaysOfWeek && league.leagueDaysOfWeek.length > 0 && (
                    <div>
                      <p className="text-sm text-gray-600">Days of Week</p>
                      <p className="text-gray-900">{league.leagueDaysOfWeek.join(', ')}</p>
                    </div>
                  )}
                  {league.leaguePlayerGender && league.leaguePlayerGender.length > 0 && (
                    <div>
                      <p className="text-sm text-gray-600">Gender</p>
                      <p className="text-gray-900">{league.leaguePlayerGender.join(', ')}</p>
                    </div>
                  )}
                  {league.leagueLevelOfPlay && league.leagueLevelOfPlay.length > 0 && (
                    <div>
                      <p className="text-sm text-gray-600">Level of Play</p>
                      <p className="text-gray-900">{league.leagueLevelOfPlay.join(', ')}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Tournaments */}
          {eventType === 'Tournament' && tournaments.map((tournament: any, index: number) => (
            <div key={index} className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-green-600 text-white font-bold text-sm flex-shrink-0">
                  {index + 1}
                </span>
                <div className="flex-1 space-y-2">
                  <div>
                    <p className="text-sm text-gray-600">Tournament Name</p>
                    <p className="text-gray-900 font-medium">{tournament.tournamentName || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Dates</p>
                    <p className="text-gray-900">
                      {formatDate(tournament.tournamentStartDate)} - {formatDate(tournament.tournamentEndDate)}
                    </p>
                  </div>
                  {tournament.tournamentNumberOfGames && (
                    <div>
                      <p className="text-sm text-gray-600">Number of Games</p>
                      <p className="text-gray-900">{tournament.tournamentNumberOfGames}</p>
                    </div>
                  )}
                  {tournament.tournamentPlayerGender && tournament.tournamentPlayerGender.length > 0 && (
                    <div>
                      <p className="text-sm text-gray-600">Gender</p>
                      <p className="text-gray-900">{tournament.tournamentPlayerGender.join(', ')}</p>
                    </div>
                  )}
                  {tournament.tournamentLevelOfPlay && tournament.tournamentLevelOfPlay.length > 0 && (
                    <div>
                      <p className="text-sm text-gray-600">Level of Play</p>
                      <p className="text-gray-900">{tournament.tournamentLevelOfPlay.join(', ')}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Exhibitions */}
          {eventType === 'Exhibition Game(s)' && exhibitions.map((exhibition: any, index: number) => (
            <div key={index} className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-orange-600 text-white font-bold text-sm flex-shrink-0">
                  {index + 1}
                </span>
                <div className="flex-1 space-y-2">
                  <div>
                    <p className="text-sm text-gray-600">Facility/Location</p>
                    <p className="text-gray-900 font-medium">{exhibition.exhibitionGameLocation || 'N/A'}</p>
                  </div>
                  {exhibition.exhibitionGames && exhibition.exhibitionGames.length > 0 && (
                    <div>
                      <p className="text-sm text-gray-600">Game Times</p>
                      <div className="mt-1 space-y-1">
                        {exhibition.exhibitionGames.map((game: any, gameIndex: number) => (
                          <p key={gameIndex} className="text-gray-900 text-sm">
                            {formatDate(game.date)} at {formatTime(game.time)}
                            {game.numberOfGames && game.numberOfGames !== '1' && ` (${game.numberOfGames} games)`}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                  {exhibition.exhibitionGames && exhibition.exhibitionGames.length > 0 && (
                    <div>
                      <p className="text-sm text-gray-600">Total Number of Games</p>
                      <p className="text-gray-900">
                        {exhibition.exhibitionGames.reduce((sum: number, game: any) => {
                          const num = parseInt(game.numberOfGames || '0', 10)
                          return sum + (isNaN(num) ? 0 : num)
                        }, 0)}
                      </p>
                    </div>
                  )}
                  {exhibition.exhibitionPlayerGender && exhibition.exhibitionPlayerGender.length > 0 && (
                    <div>
                      <p className="text-sm text-gray-600">Gender</p>
                      <p className="text-gray-900">{exhibition.exhibitionPlayerGender.join(', ')}</p>
                    </div>
                  )}
                  {exhibition.exhibitionLevelOfPlay && exhibition.exhibitionLevelOfPlay.length > 0 && (
                    <div>
                      <p className="text-sm text-gray-600">Level of Play</p>
                      <p className="text-gray-900">{exhibition.exhibitionLevelOfPlay.join(', ')}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Agreements Section */}
      <div className="border border-gray-300 rounded-lg p-6 bg-white">
        <h3 className="text-lg font-bold text-brand-secondary mb-4">Agreements & Policies</h3>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <IconCheck size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-gray-600">Discipline Policy</p>
              <p className="text-gray-900 font-medium">{disciplinePolicy || 'N/A'}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <IconCheck size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-gray-600">Exclusivity Agreement</p>
              <p className="text-gray-900 font-medium">
                {agreement ? 'Acknowledged' : 'Not acknowledged'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
