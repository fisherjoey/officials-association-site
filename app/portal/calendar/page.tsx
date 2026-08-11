'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import { EventClickArg, DateSelectArg } from '@fullcalendar/core'
import './calendar.css'
import { IconPlus, IconEdit, IconTrash, IconCalendar, IconClock, IconMapPin, IconUsers, IconCalendarEvent, IconChartBar, IconX, IconFilter, IconFilterOff, IconTrophy, IconBuilding, IconMapPins, IconTag, IconUpload } from '@tabler/icons-react'
import Modal from '@/components/ui/Modal'
import BulkEventUploadModal from '@/components/portal/BulkEventUploadModal'
import { calendarAPI } from '@/lib/api'
import { useRole } from '@/contexts/RoleContext'
import moment from 'moment'
import { calendarEventFormSchema, formDataToEvent, EVENT_TYPES, type CalendarEventFormData } from '@/lib/schemas'
import { ORG_SHORT_NAME, DEFAULT_AUTHOR } from '@/lib/siteConfig'

// Calendar view mode type
type CalendarViewMode = 'events' | 'statistics'

interface TournamentDetails {
  school: string
  divisions: string[]
  levels: string[]
  genders: string[]
  multiLocation: boolean
  gamesInArbiter: boolean
}

interface PortalEvent {
  id?: string
  title: string
  start: Date
  end: Date
  type: 'training' | 'meeting' | 'league' | 'tournament' | 'social'
  description?: string
  location?: string
  instructor?: string
  maxParticipants?: number
  registrationLink?: string
  tournamentDetails?: TournamentDetails
}

// Tournament configuration — checkboxes for scheduler, tags for members
const TOURNAMENT_DIVISIONS = [
  'U9', 'U11', 'U13', 'U15', 'U17',
  'Prep', 'Junior High', 'HS-JV', 'HS-SV', 'Senior',
] as const

// Replace these with the divisions and school boards your association covers.
const TOURNAMENT_LEVELS = [
  '1A/2A', '3A', '4A', '5A',
  'Div 1/2',
  'City', 'County', 'Regional',
  'Public School Board', 'Separate School Board',
  'Provincial Zones',
  'Recreational Adult',
  'Junior League',
  'Elite (Provincial)', 'Elite (National)',
] as const

const TOURNAMENT_GENDERS = ['Boys', 'Girls'] as const

/**
 * Mock daily game data for the Statistics view (February 2026). Generic league
 * names only: sample data in a client component is compiled into the static
 * export, so real school boards, leagues and tournaments named here would ship
 * to anyone who loads the portal.
 */
const mockDailyGames: Record<string, { games: number; assignments: number; leagues: { name: string; games: number }[] }> = {
  '2026-02-02': { games: 12, assignments: 24, leagues: [{ name: 'Junior High League', games: 8 }, { name: 'Senior Mens', games: 4 }] },
  '2026-02-03': { games: 8, assignments: 16, leagues: [{ name: 'Junior High League', games: 6 }, { name: 'Womens Div 2', games: 2 }] },
  '2026-02-04': { games: 15, assignments: 30, leagues: [{ name: 'High School League', games: 10 }, { name: 'Junior High League', games: 5 }] },
  '2026-02-05': { games: 6, assignments: 12, leagues: [{ name: 'Senior Mens', games: 6 }] },
  '2026-02-06': { games: 22, assignments: 44, leagues: [{ name: 'Junior High League', games: 14 }, { name: 'High School League', games: 8 }] },
  '2026-02-07': { games: 35, assignments: 70, leagues: [{ name: 'Spring Invitational', games: 20 }, { name: 'Junior High League', games: 15 }] },
  '2026-02-08': { games: 28, assignments: 56, leagues: [{ name: 'Spring Invitational', games: 18 }, { name: 'Senior Mens', games: 10 }] },
  '2026-02-09': { games: 10, assignments: 20, leagues: [{ name: 'Junior High League', games: 6 }, { name: 'Womens Div 2', games: 4 }] },
  '2026-02-10': { games: 14, assignments: 28, leagues: [{ name: 'Junior High League', games: 10 }, { name: 'Regional League', games: 4 }] },
}

// Event type to color mapping
const eventTypeColors: Record<string, string> = {
  training: '#10b981', // green
  meeting: '#8b5cf6',  // purple
  league: '#ef4444',   // red
  tournament: '#f59e0b', // amber
  social: '#3b82f6',   // blue
}

export default function CalendarPage() {
  const { user } = useRole()
  const [calendarMode, setCalendarMode] = useState<CalendarViewMode>('events')
  const [events, setEvents] = useState<PortalEvent[]>([])
  const [showEventModal, setShowEventModal] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<PortalEvent | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [selectedStatDate, setSelectedStatDate] = useState<string | null>(null)
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set(['training', 'meeting', 'league', 'tournament', 'social']))
  const [isMobile, setIsMobile] = useState(false)
  const [showBulkUpload, setShowBulkUpload] = useState(false)

  // Track viewport width for responsive calendar settings
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Load events from API on mount
  useEffect(() => {
    loadEvents()
  }, [])

  const loadEvents = async () => {
    try {
      const data = await calendarAPI.getAll()
      // Convert date strings to Date objects
      const eventsWithDates = data.map((e: any) => ({
        ...e,
        start: new Date(e.start_date),
        end: new Date(e.end_date),
        tournamentDetails: e.tournament_details || undefined,
      }))
      setEvents(eventsWithDates)
    } catch (error) {
      console.error('Failed to load events:', error)
      // Fallback to sample events if API fails
      setEvents([
        {
          id: '1',
          title: 'Level 2 Certification Clinic',
          start: new Date(2025, 0, 15, 18, 0),
          end: new Date(2025, 0, 15, 21, 0),
          type: 'training',
          description: 'Certification clinic for Level 2 officials',
          location: 'Central Community Center',
          instructor: 'John Smith',
          maxParticipants: 20
        },
        {
          id: '2',
          title: 'Executive Meeting',
          start: new Date(2025, 0, 20, 19, 0),
          end: new Date(2025, 0, 20, 21, 0),
          type: 'meeting',
          description: 'Monthly executive committee meeting',
          location: `${ORG_SHORT_NAME} Office`
        },
        {
          id: '3',
          title: 'Winter League Playoffs Begin',
          start: new Date(2025, 0, 31, 23, 59),
          end: new Date(2025, 0, 31, 23, 59),
          type: 'league',
          description: 'Start of winter league playoff season'
        }
      ])
    }
  }

  const canEdit = user.role === 'admin' || user.role === 'executive'

  const toggleType = (type: string) => {
    setActiveTypes(prev => {
      const next = new Set(prev)
      if (next.has(type)) {
        if (next.size === 1) return prev // don't allow deselecting all
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  const allTypesActive = activeTypes.size === EVENT_TYPES.length

  const resetFilters = () => {
    setActiveTypes(new Set(EVENT_TYPES))
  }

  // Convert events to FullCalendar format (filtered by active types)
  const fullCalendarEvents = events
    .filter(event => activeTypes.has(event.type))
    .map(event => ({
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      backgroundColor: eventTypeColors[event.type] || '#3b82f6',
      borderColor: eventTypeColors[event.type] || '#3b82f6',
      extendedProps: {
        type: event.type,
        description: event.description,
        location: event.location,
        instructor: event.instructor,
        maxParticipants: event.maxParticipants,
        registrationLink: event.registrationLink
      }
    }))

  const handleEventClick = (clickInfo: EventClickArg) => {
    const event = events.find(e => e.id === clickInfo.event.id)
    if (event) {
      setSelectedEvent(event)
      setIsEditing(false)
      setShowEventModal(true)
    }
  }

  const handleDateSelect = (selectInfo: DateSelectArg) => {
    if (!canEdit) return

    setSelectedEvent({
      title: '',
      start: selectInfo.start,
      end: selectInfo.end,
      type: 'training'
    })
    setIsEditing(true)
    setShowEventModal(true)
  }

  const handleSaveEvent = async (eventData: PortalEvent) => {
    try {
      const apiData = {
        title: eventData.title,
        type: eventData.type,
        description: eventData.description,
        location: eventData.location,
        instructor: eventData.instructor,
        max_participants: eventData.maxParticipants,
        registration_link: eventData.registrationLink,
        start_date: eventData.start.toISOString(),
        end_date: eventData.end.toISOString(),
        created_by: DEFAULT_AUTHOR,
        tournament_details: eventData.type === 'tournament' ? eventData.tournamentDetails || null : null,
      }

      if (selectedEvent?.id) {
        const updated = await calendarAPI.update({ ...apiData, id: selectedEvent.id })
        setEvents(prev => prev.map(e =>
          e.id === selectedEvent.id ? {
            ...updated,
            start: new Date(updated.start_date),
            end: new Date(updated.end_date),
            tournamentDetails: updated.tournament_details || undefined,
          } : e
        ))
      } else {
        const created = await calendarAPI.create(apiData)
        setEvents(prev => [...prev, {
          ...created,
          start: new Date(created.start_date),
          end: new Date(created.end_date),
          tournamentDetails: created.tournament_details || undefined,
        }])
      }
      setShowEventModal(false)
      setSelectedEvent(null)
    } catch (error) {
      console.error('Failed to save event:', error)
      alert('Failed to save event. Please try again.')
    }
  }

  const handleDeleteEvent = async () => {
    if (selectedEvent?.id) {
      try {
        await calendarAPI.delete(selectedEvent.id)
        setEvents(prev => prev.filter(e => e.id !== selectedEvent.id))
        setShowEventModal(false)
        setSelectedEvent(null)
      } catch (error) {
        console.error('Failed to delete event:', error)
        alert('Failed to delete event. Please try again.')
      }
    }
  }

  const selectedStatDayData = selectedStatDate ? mockDailyGames[selectedStatDate] : null

  return (
    <div className="p-3 sm:p-6 portal-animate max-w-5xl mx-auto">
      {/* Header — compact: title + filters + add button */}
      <div className="mb-3 sm:mb-4 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold font-heading tracking-tight text-gray-900 dark:text-white">Calendar</h1>
          {canEdit && calendarMode === 'events' && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowBulkUpload(true)}
                className="bg-white dark:bg-portal-surface text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-portal-border px-3 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-portal-hover flex items-center gap-1.5 text-sm"
              >
                <IconUpload className="h-4 w-4" />
                <span className="hidden sm:inline">Bulk Upload</span>
                <span className="sm:hidden">CSV</span>
              </button>
              <button
                onClick={() => {
                  setSelectedEvent({
                    title: '',
                    start: new Date(),
                    end: new Date(),
                    type: 'training'
                  })
                  setIsEditing(true)
                  setShowEventModal(true)
                }}
                className="bg-orange-500 text-white px-3 py-1.5 rounded-lg hover:bg-orange-600 flex items-center gap-1.5 text-sm"
              >
                <IconPlus className="h-4 w-4" />
                <span className="hidden sm:inline">Add Event</span>
                <span className="sm:hidden">Add</span>
              </button>
            </div>
          )}
        </div>

        {/* Inline Filters */}
        {calendarMode === 'events' && (
          <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
            {([
              { type: 'training', label: 'Training', dot: 'bg-green-500', text: 'text-green-600 dark:text-green-400' },
              { type: 'meeting', label: 'Meeting', dot: 'bg-purple-500', text: 'text-purple-600 dark:text-purple-400' },
              { type: 'league', label: 'League', dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400' },
              { type: 'tournament', label: 'Tournament', dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
              { type: 'social', label: 'Social', dot: 'bg-blue-500', text: 'text-blue-600 dark:text-blue-400' },
            ] as const).map(({ type, label, dot, text }) => {
              const isActive = activeTypes.has(type)
              return (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-md text-[11px] sm:text-xs font-medium transition-all duration-200 ${
                    isActive
                      ? `${text} bg-gray-100 dark:bg-white/[0.08]`
                      : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                  }`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full ${dot} ${isActive ? '' : 'opacity-30'}`} />
                  {label}
                </button>
              )
            })}
            {!allTypesActive && (
              <button
                onClick={resetFilters}
                className="flex-shrink-0 flex items-center gap-1 px-1.5 py-1 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              >
                <IconFilterOff className="h-3 w-3" />
                Reset
              </button>
            )}
          </div>
        )}
      </div>

      {/* Events Mode Content */}
      {calendarMode === 'events' && (
        <>
          {/* FullCalendar */}
          <div className="bg-white dark:bg-portal-surface rounded-lg border border-gray-200 dark:border-portal-border p-1.5 sm:p-4">
            <FullCalendar
              plugins={[dayGridPlugin, listPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,listMonth'
              }}
              events={fullCalendarEvents}
              eventClick={handleEventClick}
              selectable={canEdit}
              select={handleDateSelect}
              height="auto"
              eventDisplay="block"
              dayMaxEvents={isMobile ? 2 : 4}
              moreLinkClick="popover"
              eventTimeFormat={{
                hour: 'numeric',
                minute: '2-digit',
                meridiem: 'short'
              }}
              listDayFormat={{
                weekday: 'long',
                month: 'short',
                day: 'numeric'
              }}
              listDaySideFormat={false}
              noEventsContent="No events scheduled"
              buttonText={{
                today: 'Today',
                month: 'Month',
                list: 'List'
              }}
            />
          </div>
        </>
      )}

      {/* Statistics Mode Content */}
      {calendarMode === 'statistics' && (
        <>
          {/* Under Construction Banner */}
          <div className="mb-4 bg-amber-100 border border-amber-300 rounded-lg p-4 flex items-center gap-3">
            <span className="text-2xl">🚧</span>
            <div>
              <p className="font-semibold text-amber-800">Under Construction</p>
              <p className="text-sm text-amber-700">This view is currently displaying mock data for demonstration purposes.</p>
            </div>
          </div>

          {/* Statistics Legend */}
          <div className="mb-4 flex flex-wrap items-center gap-4 text-xs sm:text-sm text-gray-600 dark:text-gray-300">
            <span>Games:</span>
            <div className="flex items-center gap-1">
              <span className="w-4 h-4 bg-gray-50 dark:bg-portal-surface/50 border border-gray-200 dark:border-portal-border rounded"></span>
              <span>0</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-4 h-4 bg-blue-100 rounded"></span>
              <span>1-9</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-4 h-4 bg-blue-200 rounded"></span>
              <span>10-19</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-4 h-4 bg-blue-300 rounded"></span>
              <span>20-29</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-4 h-4 bg-blue-400 rounded"></span>
              <span>30-39</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-4 h-4 bg-blue-500 rounded"></span>
              <span>40+</span>
            </div>
          </div>

          {/* Statistics placeholder */}
          <div className="bg-white dark:bg-portal-surface rounded-lg border border-gray-200 dark:border-portal-border p-8 text-center text-gray-500 dark:text-gray-400">
            <IconChartBar className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">Statistics Calendar Coming Soon</p>
            <p className="text-sm mt-2">This feature will display game counts and assignment data by date.</p>
          </div>

          {/* Selected Day Detail */}
          {selectedStatDate && selectedStatDayData && (
            <div className="mt-4 p-4 bg-white dark:bg-portal-surface rounded-lg border border-gray-200 dark:border-portal-border">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  {new Date(selectedStatDate + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </h3>
                <button
                  onClick={() => setSelectedStatDate(null)}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-portal-hover rounded"
                >
                  <IconX className="h-4 w-4" />
                </button>
              </div>
              <div className="flex gap-6 mb-3 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Total Games:</span>
                  <span className="ml-2 font-semibold text-gray-900 dark:text-white">{selectedStatDayData.games}</span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Assignments:</span>
                  <span className="ml-2 font-semibold text-gray-900 dark:text-white">{selectedStatDayData.assignments}</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Event Modal */}
      {showEventModal && selectedEvent && (
        <EventModal
          event={selectedEvent}
          isEditing={isEditing}
          canEdit={canEdit}
          onSave={handleSaveEvent}
          onDelete={handleDeleteEvent}
          onClose={() => {
            setShowEventModal(false)
            setSelectedEvent(null)
            setIsEditing(false)
          }}
          onEdit={() => setIsEditing(true)}
        />
      )}

      {/* Bulk CSV Upload Modal */}
      {canEdit && (
        <BulkEventUploadModal
          isOpen={showBulkUpload}
          onClose={() => setShowBulkUpload(false)}
          onUploaded={(created) => {
            setEvents(prev => [
              ...prev,
              ...created.map((e: any) => ({
                ...e,
                start: new Date(e.start_date),
                end: new Date(e.end_date),
                tournamentDetails: e.tournament_details || undefined,
              })),
            ])
          }}
        />
      )}
    </div>
  )
}

// Event Modal Component
function EventModal({
  event,
  isEditing,
  canEdit,
  onSave,
  onDelete,
  onClose,
  onEdit
}: {
  event: PortalEvent
  isEditing: boolean
  canEdit: boolean
  onSave: (event: PortalEvent) => void
  onDelete: () => void
  onClose: () => void
  onEdit: () => void
}) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<CalendarEventFormData>({
    resolver: zodResolver(calendarEventFormSchema) as any,
    defaultValues: {
      title: event.title,
      type: event.type,
      start: moment(event.start).format('YYYY-MM-DDTHH:mm'),
      end: moment(event.end).format('YYYY-MM-DDTHH:mm'),
      location: event.location || '',
      description: event.description || '',
      instructor: event.instructor || '',
      maxParticipants: event.maxParticipants || undefined,
      registrationLink: event.registrationLink || '',
    },
  })

  const eventType = watch('type')

  // Tournament-specific state (managed outside react-hook-form)
  const [tournamentSchool, setTournamentSchool] = useState(event.tournamentDetails?.school || '')
  const [tournamentDivisions, setTournamentDivisions] = useState<string[]>(event.tournamentDetails?.divisions || [])
  const [tournamentLevels, setTournamentLevels] = useState<string[]>(event.tournamentDetails?.levels || [])
  const [tournamentGenders, setTournamentGenders] = useState<string[]>(event.tournamentDetails?.genders || [])
  const [multiLocation, setMultiLocation] = useState(event.tournamentDetails?.multiLocation || false)
  const [gamesInArbiter, setGamesInArbiter] = useState(event.tournamentDetails?.gamesInArbiter || (event as any).gamesInArbiter || false)

  const toggleArrayItem = (arr: string[], setArr: React.Dispatch<React.SetStateAction<string[]>>, item: string) => {
    setArr(prev => prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item])
  }

  const onFormSubmit = (data: CalendarEventFormData) => {
    const eventData = formDataToEvent(data)
    const tournamentDetails: TournamentDetails | undefined = data.type === 'tournament' ? {
      school: tournamentSchool,
      divisions: tournamentDivisions,
      levels: tournamentLevels,
      genders: tournamentGenders,
      multiLocation,
      gamesInArbiter,
    } : undefined
    // For league events, store gamesInArbiter in tournament_details as a minimal object
    const leagueDetails = data.type === 'league' && gamesInArbiter ? { gamesInArbiter: true } as any : undefined
    onSave({ ...eventData, id: event.id, tournamentDetails: tournamentDetails || leagueDetails })
  }

  const inputClassName = (hasError: boolean) =>
    `w-full px-3 py-2 border ${hasError ? 'border-red-500' : 'border-gray-200 dark:border-portal-border'} bg-white dark:bg-portal-surface text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500`

  const td = event.tournamentDetails
  const hasTournamentTags = event.type === 'tournament' && td &&
    (td.divisions.length > 0 || td.levels.length > 0 || td.genders.length > 0)
  const showArbiterBadge = td?.gamesInArbiter && (event.type === 'tournament' || event.type === 'league')

  if (!isEditing) {
    // View mode
    return (
      <Modal
        isOpen={true}
        onClose={onClose}
        title={event.title}
        size={event.type === 'tournament' ? 'md' : 'sm'}
      >
        <div className="space-y-3">
          {event.type && (
            <div className="flex items-center gap-2">
              {event.type === 'tournament'
                ? <IconTrophy className="h-5 w-5 text-amber-500" />
                : <IconCalendar className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              }
              <span className="capitalize text-gray-900 dark:text-white">{event.type}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <IconClock className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            <span className="text-gray-900 dark:text-white">
              {moment(event.start).format('MMM DD, YYYY h:mm A')} -
              {moment(event.start).isSame(event.end, 'day')
                ? moment(event.end).format('h:mm A')
                : moment(event.end).format('MMM DD, YYYY h:mm A')}
            </span>
          </div>

          {event.location && (
            <div className="flex items-center gap-2">
              <IconMapPin className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              <span className="text-gray-900 dark:text-white">{event.location}</span>
            </div>
          )}

          {/* Tournament-specific view details */}
          {event.type === 'tournament' && td && (
            <>
              {td.school && (
                <div className="flex items-center gap-2">
                  <IconBuilding className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                  <span className="text-gray-900 dark:text-white">{td.school}</span>
                </div>
              )}

              {td.multiLocation && (
                <div className="flex items-center gap-2">
                  <IconMapPins className="h-5 w-5 text-amber-500" />
                  <span className="text-amber-700 dark:text-amber-400 text-sm font-medium">Multiple Locations</span>
                </div>
              )}

              {hasTournamentTags && (
                <div className="pt-2 border-t border-gray-100 dark:border-portal-border/50">
                  <div className="flex items-center gap-1.5 mb-2">
                    <IconTag className="h-4 w-4 text-gray-400" />
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Tournament Details</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {td.genders.map(g => (
                      <span key={g} className="px-2 py-0.5 text-xs font-medium rounded-full bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300">
                        {g}
                      </span>
                    ))}
                    {td.levels.map(l => (
                      <span key={l} className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                        {l}
                      </span>
                    ))}
                    {td.divisions.map(d => (
                      <span key={d} className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Games in Arbiter — shown for tournament and league events */}
          {showArbiterBadge && (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                </span>
                <span className="text-green-700 dark:text-green-300 text-sm font-medium">Games in Arbiter</span>
              </span>
            </div>
          )}

          {event.instructor && (
            <div className="flex items-center gap-2">
              <IconUsers className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              <span className="text-gray-900 dark:text-white">Instructor: {event.instructor}</span>
            </div>
          )}

          {event.description && (
            <div className="mt-4">
              <p className="text-gray-600 dark:text-gray-300 break-all">{event.description}</p>
            </div>
          )}

          {event.registrationLink && (
            <a
              href={event.registrationLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-4 bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600"
            >
              Register Now
            </a>
          )}
        </div>

        <div className="mt-6 flex gap-2">
          {canEdit && (
            <>
              <button
                onClick={onEdit}
                className="flex-1 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 flex items-center justify-center gap-2"
              >
                <IconEdit className="h-4 w-4" />
                Edit
              </button>
              <button
                onClick={onDelete}
                className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 flex items-center justify-center gap-2"
              >
                <IconTrash className="h-4 w-4" />
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="flex-1 bg-gray-200 dark:bg-portal-hover text-gray-800 dark:text-white px-4 py-2 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Close
          </button>
        </div>
      </Modal>
    )
  }

  // Edit mode
  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={event.id ? 'Edit Event' : 'Add New Event'}
      size="md"
    >
      <form onSubmit={handleSubmit(onFormSubmit as any)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Event Title *
          </label>
          <input
            type="text"
            {...register('title')}
            className={inputClassName(!!errors.title)}
          />
          {errors.title && (
            <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Event Type *
          </label>
          <select
            {...register('type')}
            className={`w-full pl-3 pr-8 py-2 border ${!!errors.type ? 'border-red-500' : 'border-gray-200 dark:border-portal-border'} bg-white dark:bg-portal-surface text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500`}
          >
            <option value="training">Training</option>
            <option value="meeting">Meeting</option>
            <option value="league">League Date</option>
            <option value="tournament">Tournament</option>
            <option value="social">Social</option>
          </select>
          {errors.type && (
            <p className="mt-1 text-sm text-red-600">{errors.type.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Start Date/Time *
            </label>
            <input
              type="datetime-local"
              {...register('start')}
              className={inputClassName(!!errors.start)}
            />
            {errors.start && (
              <p className="mt-1 text-sm text-red-600">{errors.start.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              End Date/Time *
            </label>
            <input
              type="datetime-local"
              {...register('end')}
              className={inputClassName(!!errors.end)}
            />
            {errors.end && (
              <p className="mt-1 text-sm text-red-600">{errors.end.message}</p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Location
          </label>
          <input
            type="text"
            {...register('location')}
            className={inputClassName(!!errors.location)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Description
          </label>
          <textarea
            {...register('description')}
            className={inputClassName(!!errors.description)}
            rows={3}
          />
        </div>

        {eventType === 'training' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Instructor
              </label>
              <input
                type="text"
                {...register('instructor')}
                className={inputClassName(!!errors.instructor)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Max Participants
              </label>
              <input
                type="number"
                {...register('maxParticipants')}
                className={inputClassName(!!errors.maxParticipants)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Registration Link
              </label>
              <input
                type="url"
                {...register('registrationLink')}
                className={inputClassName(!!errors.registrationLink)}
              />
              {errors.registrationLink && (
                <p className="mt-1 text-sm text-red-600">{errors.registrationLink.message}</p>
              )}
            </div>
          </>
        )}

        {eventType === 'tournament' && (
          <div className="border-t border-gray-200 dark:border-portal-border pt-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <IconTrophy className="h-4 w-4 text-amber-500" />
              Tournament Details
            </h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                School / Club Affiliation
              </label>
              <input
                type="text"
                value={tournamentSchool}
                onChange={(e) => setTournamentSchool(e.target.value)}
                className={inputClassName(false)}
                placeholder="e.g. Edge School, Bishop O'Byrne"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Gender
              </label>
              <div className="flex flex-wrap gap-2">
                {TOURNAMENT_GENDERS.map(g => (
                  <label key={g} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                    tournamentGenders.includes(g)
                      ? 'bg-pink-50 border-pink-300 text-pink-700 dark:bg-pink-900/30 dark:border-pink-700 dark:text-pink-300'
                      : 'bg-white dark:bg-portal-surface border-gray-200 dark:border-portal-border text-gray-600 dark:text-gray-400 hover:border-gray-300'
                  }`}>
                    <input
                      type="checkbox"
                      checked={tournamentGenders.includes(g)}
                      onChange={() => toggleArrayItem(tournamentGenders, setTournamentGenders, g)}
                      className="sr-only"
                    />
                    <span className="text-sm">{g}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Level of Play
              </label>
              <div className="flex flex-wrap gap-2">
                {TOURNAMENT_LEVELS.map(l => (
                  <label key={l} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                    tournamentLevels.includes(l)
                      ? 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-300'
                      : 'bg-white dark:bg-portal-surface border-gray-200 dark:border-portal-border text-gray-600 dark:text-gray-400 hover:border-gray-300'
                  }`}>
                    <input
                      type="checkbox"
                      checked={tournamentLevels.includes(l)}
                      onChange={() => toggleArrayItem(tournamentLevels, setTournamentLevels, l)}
                      className="sr-only"
                    />
                    <span className="text-sm">{l}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Divisions
              </label>
              <div className="flex flex-wrap gap-2">
                {TOURNAMENT_DIVISIONS.map(d => (
                  <label key={d} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                    tournamentDivisions.includes(d)
                      ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300'
                      : 'bg-white dark:bg-portal-surface border-gray-200 dark:border-portal-border text-gray-600 dark:text-gray-400 hover:border-gray-300'
                  }`}>
                    <input
                      type="checkbox"
                      checked={tournamentDivisions.includes(d)}
                      onChange={() => toggleArrayItem(tournamentDivisions, setTournamentDivisions, d)}
                      className="sr-only"
                    />
                    <span className="text-sm">{d}</span>
                  </label>
                ))}
              </div>
            </div>

            <label className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
              multiLocation
                ? 'bg-amber-50 border-amber-300 dark:bg-amber-900/30 dark:border-amber-700'
                : 'bg-white dark:bg-portal-surface border-gray-200 dark:border-portal-border hover:border-gray-300'
            }`}>
              <input
                type="checkbox"
                checked={multiLocation}
                onChange={(e) => setMultiLocation(e.target.checked)}
                className="h-4 w-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-900 dark:text-white">Multiple Locations</span>
                <p className="text-xs text-gray-500 dark:text-gray-400">Tournament is hosted across more than one venue</p>
              </div>
            </label>

          </div>
        )}

        {/* Games in Arbiter — available for tournament and league events */}
        {(eventType === 'tournament' || eventType === 'league') && (
          <label className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
            gamesInArbiter
              ? 'bg-green-50 border-green-300 dark:bg-green-900/30 dark:border-green-700'
              : 'bg-white dark:bg-portal-surface border-gray-200 dark:border-portal-border hover:border-gray-300'
          }`}>
            <input
              type="checkbox"
              checked={gamesInArbiter}
              onChange={(e) => setGamesInArbiter(e.target.checked)}
              className="h-4 w-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-900 dark:text-white">Games in Arbiter</span>
              <p className="text-xs text-gray-500 dark:text-gray-400">Games have been added to Arbiter</p>
            </div>
          </label>
        )}

        <div className="flex gap-2 pt-4">
          <button
            type="submit"
            className="flex-1 bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600"
          >
            Save Event
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-gray-200 dark:bg-portal-hover text-gray-800 dark:text-white px-4 py-2 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}
