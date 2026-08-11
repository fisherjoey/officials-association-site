'use client'

import { useState } from 'react'
import { Controller, useFieldArray } from 'react-hook-form'
import { IconPlus, IconTrash, IconChevronDown, IconChevronUp } from '@tabler/icons-react'
import { ORG_NAME, ORG_SHORT_NAME, ORG_SPORT } from '@/lib/siteConfig'

// Constants
const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const LEVELS_OF_PLAY = [
  'U11', 'U13', 'U15', 'U17', 'U19',
  'Junior High', 'HS-JV', 'HS-SV', 'Prep',
  'College/University', 'Elite (National)', 'Adult',
  'Other'
]

const GENDERS = ['Male', 'Female', 'Mixed']

const EVENT_TYPES = ['Exhibition Game(s)', 'League', 'Tournament'] as const

/**
 * The two options a booking customer picks between, and agrees to. The choice
 * is stored on the submission, so treat this as contract text rather than
 * label copy: name only bodies that genuinely govern discipline in your
 * leagues, and keep the shipped wording generic until you have.
 */
const DISCIPLINE_POLICIES = [
  'League or governing body policy',
  'Own Policy (will provide copy)'
]

// Reusable styles
const inputStyles = "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent transition-colors"
const labelStyles = "block text-sm font-semibold text-gray-700 mb-1"
const errorStyles = "text-red-500 text-sm mt-1"

// CheckboxGroup Component
function CheckboxGroup({
  label,
  options,
  value = [],
  onChange,
  error,
  required
}: {
  label: string
  options: string[]
  value?: string[]
  onChange: (value: string[]) => void
  error?: string
  required?: boolean
}) {
  const hasOther = options.includes('Other')
  const otherEntry = value.find(v => v === 'Other' || v.startsWith('Other: '))
  const isOtherChecked = !!otherEntry
  const otherText = otherEntry?.startsWith('Other: ') ? otherEntry.slice(7) : ''

  const handleToggle = (option: string) => {
    if (option === 'Other') {
      if (isOtherChecked) {
        onChange(value.filter(v => v !== 'Other' && !v.startsWith('Other: ')))
      } else {
        onChange([...value, 'Other'])
      }
    } else if (value.includes(option)) {
      onChange(value.filter(v => v !== option))
    } else {
      onChange([...value, option])
    }
  }

  const handleOtherTextChange = (text: string) => {
    const filtered = value.filter(v => v !== 'Other' && !v.startsWith('Other: '))
    onChange([...filtered, text ? `Other: ${text}` : 'Other'])
  }

  return (
    <div className="mb-4">
      <label className={labelStyles}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
        {options.map(option => (
          <label key={option} className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={option === 'Other' ? isOtherChecked : value.includes(option)}
              onChange={() => handleToggle(option)}
              className="w-4 h-4 text-brand-primary border-gray-300 rounded focus:ring-brand-primary"
            />
            <span className="text-sm text-gray-700">{option}</span>
          </label>
        ))}
      </div>
      {hasOther && isOtherChecked && (
        <div className="mt-2">
          <input
            type="text"
            value={otherText}
            onChange={(e) => handleOtherTextChange(e.target.value)}
            placeholder="Please specify..."
            className={inputStyles}
          />
          {isOtherChecked && !otherText && (
            <p className={errorStyles}>Please specify the level of play</p>
          )}
        </div>
      )}
      {error && <p className={errorStyles}>{error}</p>}
    </div>
  )
}

// League Card Component
function LeagueCard({
  index,
  control,
  register,
  errors,
  watch,
  remove,
  canRemove,
}: {
  index: number
  control: any
  register: any
  errors: any
  watch: any
  remove: () => void
  canRemove: boolean
}) {
  const [isExpanded, setIsExpanded] = useState(true)
  const leagueName = watch(`leagues.${index}.leagueName`)
  const leagueErrors = errors?.leagues?.[index]

  return (
    <div className="border-2 rounded-lg overflow-hidden border-blue-200 bg-blue-50">
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-blue-100 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-sm">
            {index + 1}
          </span>
          <h4 className="font-semibold text-gray-800">
            {leagueName || `League ${index + 1}`}
          </h4>
        </div>
        <div className="flex items-center gap-2">
          {canRemove && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                remove()
              }}
              className="p-2 text-red-500 hover:bg-red-100 rounded-md transition-colors"
              title="Remove league"
            >
              <IconTrash size={18} />
            </button>
          )}
          <button type="button" className="p-2 text-gray-500 hover:bg-gray-200 rounded-md transition-colors">
            {isExpanded ? <IconChevronUp size={20} /> : <IconChevronDown size={20} />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 pt-0 border-t border-blue-200 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label htmlFor={`leagues.${index}.leagueName`} className={labelStyles}>
                League Name <span className="text-red-500">*</span>
              </label>
              <input
                id={`leagues.${index}.leagueName`}
                type="text"
                {...register(`leagues.${index}.leagueName`)}
                className={inputStyles}
              />
              {leagueErrors?.leagueName && <p className={errorStyles}>{leagueErrors.leagueName.message}</p>}
            </div>

            <div>
              <label htmlFor={`leagues.${index}.leagueStartDate`} className={labelStyles}>
                Start Date <span className="text-red-500">*</span>
              </label>
              <input
                id={`leagues.${index}.leagueStartDate`}
                type="date"
                {...register(`leagues.${index}.leagueStartDate`)}
                className={inputStyles}
              />
              {leagueErrors?.leagueStartDate && <p className={errorStyles}>{leagueErrors.leagueStartDate.message}</p>}
            </div>

            <div>
              <label htmlFor={`leagues.${index}.leagueEndDate`} className={labelStyles}>
                End Date <span className="text-red-500">*</span>
              </label>
              <input
                id={`leagues.${index}.leagueEndDate`}
                type="date"
                {...register(`leagues.${index}.leagueEndDate`)}
                className={inputStyles}
              />
              {leagueErrors?.leagueEndDate && <p className={errorStyles}>{leagueErrors.leagueEndDate.message}</p>}
            </div>
          </div>

          <Controller
            name={`leagues.${index}.leagueDaysOfWeek`}
            control={control}
            render={({ field }) => (
              <CheckboxGroup
                label="Days of Week"
                options={DAYS_OF_WEEK}
                value={field.value}
                onChange={field.onChange}
                error={leagueErrors?.leagueDaysOfWeek?.message}
                required
              />
            )}
          />

          <Controller
            name={`leagues.${index}.leaguePlayerGender`}
            control={control}
            render={({ field }) => (
              <CheckboxGroup
                label="Player Gender"
                options={GENDERS}
                value={field.value}
                onChange={field.onChange}
                error={leagueErrors?.leaguePlayerGender?.message}
                required
              />
            )}
          />

          <Controller
            name={`leagues.${index}.leagueLevelOfPlay`}
            control={control}
            render={({ field }) => (
              <CheckboxGroup
                label="Level of Play"
                options={LEVELS_OF_PLAY}
                value={field.value}
                onChange={field.onChange}
                error={leagueErrors?.leagueLevelOfPlay?.message}
                required
              />
            )}
          />
        </div>
      )}
    </div>
  )
}

// Tournament Card Component
function TournamentCard({
  index,
  control,
  register,
  errors,
  watch,
  remove,
  canRemove,
}: {
  index: number
  control: any
  register: any
  errors: any
  watch: any
  remove: () => void
  canRemove: boolean
}) {
  const [isExpanded, setIsExpanded] = useState(true)
  const tournamentName = watch(`tournaments.${index}.tournamentName`)
  const tournamentErrors = errors?.tournaments?.[index]

  return (
    <div className="border-2 rounded-lg overflow-hidden border-green-200 bg-green-50">
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-green-100 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-green-600 text-white font-bold text-sm">
            {index + 1}
          </span>
          <h4 className="font-semibold text-gray-800">
            {tournamentName || `Tournament ${index + 1}`}
          </h4>
        </div>
        <div className="flex items-center gap-2">
          {canRemove && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                remove()
              }}
              className="p-2 text-red-500 hover:bg-red-100 rounded-md transition-colors"
              title="Remove tournament"
            >
              <IconTrash size={18} />
            </button>
          )}
          <button type="button" className="p-2 text-gray-500 hover:bg-gray-200 rounded-md transition-colors">
            {isExpanded ? <IconChevronUp size={20} /> : <IconChevronDown size={20} />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 pt-0 border-t border-green-200 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label htmlFor={`tournaments.${index}.tournamentName`} className={labelStyles}>
                Tournament Name <span className="text-red-500">*</span>
              </label>
              <input
                id={`tournaments.${index}.tournamentName`}
                type="text"
                {...register(`tournaments.${index}.tournamentName`)}
                className={inputStyles}
              />
              {tournamentErrors?.tournamentName && <p className={errorStyles}>{tournamentErrors.tournamentName.message}</p>}
            </div>

            <div>
              <label htmlFor={`tournaments.${index}.tournamentNumberOfGames`} className={labelStyles}>
                Estimated Number of Games <span className="text-red-500">*</span>
              </label>
              <input
                id={`tournaments.${index}.tournamentNumberOfGames`}
                type="number"
                min="1"
                {...register(`tournaments.${index}.tournamentNumberOfGames`)}
                className={inputStyles}
              />
              {tournamentErrors?.tournamentNumberOfGames && <p className={errorStyles}>{tournamentErrors.tournamentNumberOfGames.message}</p>}
            </div>

            <div>
              <label htmlFor={`tournaments.${index}.tournamentStartDate`} className={labelStyles}>
                Start Date <span className="text-red-500">*</span>
              </label>
              <input
                id={`tournaments.${index}.tournamentStartDate`}
                type="date"
                {...register(`tournaments.${index}.tournamentStartDate`)}
                className={inputStyles}
              />
              {tournamentErrors?.tournamentStartDate && <p className={errorStyles}>{tournamentErrors.tournamentStartDate.message}</p>}
            </div>

            <div>
              <label htmlFor={`tournaments.${index}.tournamentEndDate`} className={labelStyles}>
                End Date <span className="text-red-500">*</span>
              </label>
              <input
                id={`tournaments.${index}.tournamentEndDate`}
                type="date"
                {...register(`tournaments.${index}.tournamentEndDate`)}
                className={inputStyles}
              />
              {tournamentErrors?.tournamentEndDate && <p className={errorStyles}>{tournamentErrors.tournamentEndDate.message}</p>}
            </div>
          </div>

          <Controller
            name={`tournaments.${index}.tournamentPlayerGender`}
            control={control}
            render={({ field }) => (
              <CheckboxGroup
                label="Player Gender"
                options={GENDERS}
                value={field.value}
                onChange={field.onChange}
                error={tournamentErrors?.tournamentPlayerGender?.message}
                required
              />
            )}
          />

          <Controller
            name={`tournaments.${index}.tournamentLevelOfPlay`}
            control={control}
            render={({ field }) => (
              <CheckboxGroup
                label="Level of Play"
                options={LEVELS_OF_PLAY}
                value={field.value}
                onChange={field.onChange}
                error={tournamentErrors?.tournamentLevelOfPlay?.message}
                required
              />
            )}
          />
        </div>
      )}
    </div>
  )
}

// Exhibition Card Component (with multiple games)
function ExhibitionCard({
  index,
  control,
  register,
  errors,
  watch,
  remove,
  canRemove,
}: {
  index: number
  control: any
  register: any
  errors: any
  watch: any
  remove: () => void
  canRemove: boolean
}) {
  const [isExpanded, setIsExpanded] = useState(true)
  const location = watch(`exhibitions.${index}.exhibitionGameLocation`)
  const exhibitionErrors = errors?.exhibitions?.[index]

  const { fields: gameFields, append: appendGame, remove: removeGame } = useFieldArray({
    control,
    name: `exhibitions.${index}.exhibitionGames`,
  })

  return (
    <div className="border-2 rounded-lg overflow-hidden border-orange-200 bg-orange-50">
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-orange-100 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-orange-600 text-white font-bold text-sm">
            {index + 1}
          </span>
          <h4 className="font-semibold text-gray-800">
            {location ? `Exhibition at ${location}` : `Exhibition ${index + 1}`}
          </h4>
        </div>
        <div className="flex items-center gap-2">
          {canRemove && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                remove()
              }}
              className="p-2 text-red-500 hover:bg-red-100 rounded-md transition-colors"
              title="Remove exhibition"
            >
              <IconTrash size={18} />
            </button>
          )}
          <button type="button" className="p-2 text-gray-500 hover:bg-gray-200 rounded-md transition-colors">
            {isExpanded ? <IconChevronUp size={20} /> : <IconChevronDown size={20} />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 pt-0 border-t border-orange-200 space-y-4">
          <div>
            <label htmlFor={`exhibitions.${index}.exhibitionGameLocation`} className={labelStyles}>
              Game Location <span className="text-red-500">*</span>
            </label>
            <input
              id={`exhibitions.${index}.exhibitionGameLocation`}
              type="text"
              {...register(`exhibitions.${index}.exhibitionGameLocation`)}
              className={inputStyles}
              placeholder="e.g., Community Sports Centre"
            />
            {exhibitionErrors?.exhibitionGameLocation && <p className={errorStyles}>{exhibitionErrors.exhibitionGameLocation.message}</p>}
          </div>

          {/* Multiple Games Section */}
          <div>
            <label className={labelStyles}>
              Game Dates & Times <span className="text-red-500">*</span>
            </label>
            <p className="text-sm text-gray-600 mb-3">
              Add each game date/time. You can add multiple games for this location.
            </p>

            <div className="space-y-3">
              {gameFields.map((field, gameIndex) => (
                <div key={field.id} className="flex flex-wrap gap-3 items-start p-3 bg-white rounded-lg border border-orange-200">
                  <div className="flex-1 min-w-[140px]">
                    <label className="text-xs font-medium text-gray-600">Date</label>
                    <input
                      type="date"
                      {...register(`exhibitions.${index}.exhibitionGames.${gameIndex}.date`)}
                      className={inputStyles}
                    />
                    {exhibitionErrors?.exhibitionGames?.[gameIndex]?.date && (
                      <p className={errorStyles}>{exhibitionErrors.exhibitionGames[gameIndex].date.message}</p>
                    )}
                  </div>
                  <div className="flex-1 min-w-[120px]">
                    <label className="text-xs font-medium text-gray-600">Start Time</label>
                    <input
                      type="time"
                      {...register(`exhibitions.${index}.exhibitionGames.${gameIndex}.time`)}
                      className={inputStyles}
                    />
                    {exhibitionErrors?.exhibitionGames?.[gameIndex]?.time && (
                      <p className={errorStyles}>{exhibitionErrors.exhibitionGames[gameIndex].time.message}</p>
                    )}
                  </div>
                  <div className="w-24">
                    <label className="text-xs font-medium text-gray-600"># Games</label>
                    <input
                      type="number"
                      min="1"
                      {...register(`exhibitions.${index}.exhibitionGames.${gameIndex}.numberOfGames`)}
                      className={inputStyles}
                      placeholder="1"
                    />
                    {exhibitionErrors?.exhibitionGames?.[gameIndex]?.numberOfGames && (
                      <p className={errorStyles}>{exhibitionErrors.exhibitionGames[gameIndex].numberOfGames.message}</p>
                    )}
                  </div>
                  {gameFields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeGame(gameIndex)}
                      className="mt-5 p-2 text-red-500 hover:bg-red-100 rounded-md transition-colors"
                      title="Remove game"
                    >
                      <IconTrash size={18} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => appendGame({ date: '', time: '', numberOfGames: '1' })}
              className="mt-3 flex items-center gap-2 px-4 py-2 text-sm font-medium text-orange-700 bg-orange-100 hover:bg-orange-200 rounded-md transition-colors"
            >
              <IconPlus size={16} />
              Add Another Game Date/Time
            </button>

            {exhibitionErrors?.exhibitionGames && typeof exhibitionErrors.exhibitionGames.message === 'string' && (
              <p className={errorStyles}>{exhibitionErrors.exhibitionGames.message}</p>
            )}
          </div>

          <Controller
            name={`exhibitions.${index}.exhibitionPlayerGender`}
            control={control}
            render={({ field }) => (
              <CheckboxGroup
                label="Player Gender"
                options={GENDERS}
                value={field.value}
                onChange={field.onChange}
                error={exhibitionErrors?.exhibitionPlayerGender?.message}
                required
              />
            )}
          />

          <Controller
            name={`exhibitions.${index}.exhibitionLevelOfPlay`}
            control={control}
            render={({ field }) => (
              <CheckboxGroup
                label="Level of Play"
                options={LEVELS_OF_PLAY}
                value={field.value}
                onChange={field.onChange}
                error={exhibitionErrors?.exhibitionLevelOfPlay?.message}
                required
              />
            )}
          />
        </div>
      )}
    </div>
  )
}

// Props interface
interface Step4EventsProps {
  register: any
  control: any
  errors: any
  watch: any
  setValue: any
}

// Main Step4Events Component
export default function Step4Events({ register, control, errors, watch, setValue }: Step4EventsProps) {
  const eventType = watch('eventType')

  const { fields: leagueFields, append: appendLeague, remove: removeLeague } = useFieldArray({
    control,
    name: 'leagues',
  })

  const { fields: tournamentFields, append: appendTournament, remove: removeTournament } = useFieldArray({
    control,
    name: 'tournaments',
  })

  const { fields: exhibitionFields, append: appendExhibition, remove: removeExhibition } = useFieldArray({
    control,
    name: 'exhibitions',
  })

  const getEventCount = () => {
    if (eventType === 'League') return leagueFields.length
    if (eventType === 'Tournament') return tournamentFields.length
    if (eventType === 'Exhibition Game(s)') return exhibitionFields.length
    return 0
  }

  const eventCount = getEventCount()

  const getEventLabel = () => {
    if (eventType === 'League') return eventCount === 1 ? 'League' : 'Leagues'
    if (eventType === 'Tournament') return eventCount === 1 ? 'Tournament' : 'Tournaments'
    if (eventType === 'Exhibition Game(s)') return eventCount === 1 ? 'Exhibition' : 'Exhibitions'
    return 'Events'
  }

  const addNewItem = () => {
    if (eventType === 'League') {
      appendLeague({
        leagueName: '',
        leagueStartDate: '',
        leagueEndDate: '',
        leagueDaysOfWeek: [],
        leaguePlayerGender: [],
        leagueLevelOfPlay: [],
      })
    } else if (eventType === 'Tournament') {
      appendTournament({
        tournamentName: '',
        tournamentStartDate: '',
        tournamentEndDate: '',
        tournamentNumberOfGames: '',
        tournamentPlayerGender: [],
        tournamentLevelOfPlay: [],
      })
    } else if (eventType === 'Exhibition Game(s)') {
      appendExhibition({
        exhibitionGameLocation: '',
        exhibitionGames: [{ date: '', time: '', numberOfGames: '1' }],
        exhibitionPlayerGender: [],
        exhibitionLevelOfPlay: [],
      })
    }
  }

  return (
    <div className="space-y-6">
      {/* Event Type Selection */}
      <div>
        <h3 className="text-xl font-bold text-brand-secondary mb-4">Event Type</h3>
        <p className="text-sm text-gray-600 mb-4">
          Select the type of event you need officials for. You can add multiple events of the same type.
        </p>

        <div className="space-y-3">
          {EVENT_TYPES.map(type => (
            <label key={type} className={`flex items-center space-x-3 cursor-pointer p-4 border-2 rounded-lg transition-colors ${
              eventType === type
                ? 'border-brand-primary bg-orange-50'
                : 'border-gray-200 hover:bg-gray-50'
            }`}>
              <input
                type="radio"
                value={type}
                {...register('eventType')}
                className="w-5 h-5 text-brand-primary border-gray-300 focus:ring-brand-primary"
              />
              <div>
                <span className="text-gray-800 font-medium">{type}</span>
                <p className="text-sm text-gray-500 mt-0.5">
                  {type === 'League' && 'Regular season games over a period of time'}
                  {type === 'Tournament' && 'Multiple games over a short period (1-3 days)'}
                  {type === 'Exhibition Game(s)' && 'One-off games or scrimmages'}
                </p>
              </div>
            </label>
          ))}
        </div>
        {errors.eventType && <p className={errorStyles}>{errors.eventType.message}</p>}
      </div>

      {/* Events Section - Only show after type is selected */}
      {eventType && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-brand-secondary">{getEventLabel()}</h3>
            <span className="px-3 py-1 bg-brand-secondary text-white rounded-full text-sm font-medium">
              {eventCount} {getEventLabel()}
            </span>
          </div>

          {/* League List */}
          {eventType === 'League' && (
            <>
              <div className="space-y-4">
                {leagueFields.map((field, index) => (
                  <LeagueCard
                    key={field.id}
                    index={index}
                    control={control}
                    register={register}
                    errors={errors}
                    watch={watch}
                    remove={() => removeLeague(index)}
                    canRemove={leagueFields.length > 1}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={addNewItem}
                className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 text-blue-700 font-semibold bg-blue-50 hover:bg-blue-100 border-2 border-dashed border-blue-300 rounded-lg transition-colors"
              >
                <IconPlus size={20} />
                Add Another League
              </button>
            </>
          )}

          {/* Tournament List */}
          {eventType === 'Tournament' && (
            <>
              <div className="space-y-4">
                {tournamentFields.map((field, index) => (
                  <TournamentCard
                    key={field.id}
                    index={index}
                    control={control}
                    register={register}
                    errors={errors}
                    watch={watch}
                    remove={() => removeTournament(index)}
                    canRemove={tournamentFields.length > 1}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={addNewItem}
                className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 text-green-700 font-semibold bg-green-50 hover:bg-green-100 border-2 border-dashed border-green-300 rounded-lg transition-colors"
              >
                <IconPlus size={20} />
                Add Another Tournament
              </button>
            </>
          )}

          {/* Exhibition List */}
          {eventType === 'Exhibition Game(s)' && (
            <>
              <div className="space-y-4">
                {exhibitionFields.map((field, index) => (
                  <ExhibitionCard
                    key={field.id}
                    index={index}
                    control={control}
                    register={register}
                    errors={errors}
                    watch={watch}
                    remove={() => removeExhibition(index)}
                    canRemove={exhibitionFields.length > 1}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={addNewItem}
                className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 text-orange-700 font-semibold bg-orange-50 hover:bg-orange-100 border-2 border-dashed border-orange-300 rounded-lg transition-colors"
              >
                <IconPlus size={20} />
                Add Another Exhibition Location
              </button>
            </>
          )}

          {errors.leagues && typeof errors.leagues.message === 'string' && (
            <p className={errorStyles}>{errors.leagues.message}</p>
          )}
          {errors.tournaments && typeof errors.tournaments.message === 'string' && (
            <p className={errorStyles}>{errors.tournaments.message}</p>
          )}
          {errors.exhibitions && typeof errors.exhibitions.message === 'string' && (
            <p className={errorStyles}>{errors.exhibitions.message}</p>
          )}
        </div>
      )}

      {/* Discipline Policy Section */}
      <div>
        <h3 className="text-xl font-bold text-brand-secondary mb-4">Discipline Policy</h3>
        <p className="text-sm text-gray-600 mb-4">
          Which discipline policy will govern your event(s)?
        </p>
        <div className="space-y-3">
          {DISCIPLINE_POLICIES.map(policy => (
            <label key={policy} className="flex items-center space-x-3 cursor-pointer p-3 border rounded-lg hover:bg-gray-50 transition-colors">
              <input
                type="radio"
                value={policy}
                {...register('disciplinePolicy')}
                className="w-5 h-5 text-brand-primary border-gray-300 focus:ring-brand-primary"
              />
              <span className="text-gray-700">{policy}</span>
            </label>
          ))}
        </div>
        {errors.disciplinePolicy && <p className={errorStyles}>{errors.disciplinePolicy.message}</p>}
      </div>

      {/* Exclusivity Agreement Section */}
      <div>
        <h3 className="text-xl font-bold text-brand-secondary mb-4">Exclusivity Agreement</h3>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-gray-700">
            By checking this box, you agree that {ORG_NAME} ({ORG_SHORT_NAME}) will be
            the <strong>exclusive provider</strong> of {ORG_SPORT} officials for your event(s). This ensures consistent
            quality, coordination, and coverage for all your games.
          </p>
        </div>
        <label className="flex items-start space-x-3 cursor-pointer">
          <input
            type="checkbox"
            {...register('agreement')}
            className="w-5 h-5 mt-0.5 text-brand-primary border-gray-300 rounded focus:ring-brand-primary"
          />
          <span className="text-gray-700">
            I agree that {ORG_SHORT_NAME} will be the exclusive provider of {ORG_SPORT} officials for {eventCount === 1 ? 'this event' : 'these events'}. <span className="text-red-500">*</span>
          </span>
        </label>
        {errors.agreement && <p className={errorStyles}>{errors.agreement.message}</p>}
      </div>
    </div>
  )
}
