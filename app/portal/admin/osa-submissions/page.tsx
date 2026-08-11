'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  ColumnDef,
  SortingState,
} from '@tanstack/react-table'
import { getSupabaseBrowserClient } from '@/lib/api/client'
import { readFriendlyError, friendlyErrorFromThrown } from '@/lib/userFacingError'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import {
  IconArrowUp,
  IconArrowDown,
  IconSearch,
  IconRefresh,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconFilter,
  IconX,
  IconEye,
  IconDownload,
  IconCalendarEvent,
  IconTrophy,
  IconBallBasketball,
  IconCheck,
  IconClock,
  IconPhone,
  IconPlayerPlay,
  IconSquareX,
} from '@tabler/icons-react'

interface OSASubmission {
  id: string
  created_at: string
  updated_at: string
  organization_name: string
  billing_contact_name: string
  billing_email: string
  billing_phone: string | null
  billing_address: string | null
  billing_city: string | null
  billing_province: string | null
  billing_postal_code: string | null
  event_contact_name: string
  event_contact_email: string
  event_contact_phone: string | null
  event_type: string
  league_name: string | null
  league_start_date: string | null
  league_end_date: string | null
  league_days_of_week: string | null
  league_player_gender: string | null
  league_level_of_play: string | null
  exhibition_game_location: string | null
  exhibition_number_of_games: number | null
  exhibition_game_date: string | null
  exhibition_start_time: string | null
  exhibition_player_gender: string | null
  exhibition_level_of_play: string | null
  tournament_name: string | null
  tournament_start_date: string | null
  tournament_end_date: string | null
  tournament_number_of_games: number | null
  tournament_player_gender: string | null
  tournament_level_of_play: string | null
  discipline_policy: string
  status: string
  notes: string | null
  emails_sent: { client: boolean; scheduler: boolean; treasurer: boolean; president: boolean }
}

interface PaginationInfo {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

const supabase = getSupabaseBrowserClient()

const eventTypeConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  'Exhibition Game(s)': { label: 'Exhibition', icon: IconBallBasketball, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
  'League': { label: 'League', icon: IconCalendarEvent, color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' },
  'Tournament': { label: 'Tournament', icon: IconTrophy, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400' },
}

const statusConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  new: { label: 'New', icon: IconClock, color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400' },
  contacted: { label: 'Contacted', icon: IconPhone, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
  scheduled: { label: 'Scheduled', icon: IconPlayerPlay, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400' },
  completed: { label: 'Completed', icon: IconCheck, color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' },
  cancelled: { label: 'Cancelled', icon: IconSquareX, color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
}

// Helper to get event-specific details
function getEventDetails(submission: OSASubmission) {
  switch (submission.event_type) {
    case 'League':
      return {
        name: submission.league_name || 'League',
        startDate: submission.league_start_date,
        endDate: submission.league_end_date,
        details: submission.league_days_of_week ? `${submission.league_days_of_week}` : null,
        gender: submission.league_player_gender,
        level: submission.league_level_of_play,
      }
    case 'Tournament':
      return {
        name: submission.tournament_name || 'Tournament',
        startDate: submission.tournament_start_date,
        endDate: submission.tournament_end_date,
        details: submission.tournament_number_of_games ? `${submission.tournament_number_of_games} games` : null,
        gender: submission.tournament_player_gender,
        level: submission.tournament_level_of_play,
      }
    default:
      return {
        name: submission.exhibition_game_location || 'Exhibition',
        startDate: submission.exhibition_game_date,
        endDate: null,
        details: submission.exhibition_number_of_games ? `${submission.exhibition_number_of_games} games` : null,
        gender: submission.exhibition_player_gender,
        level: submission.exhibition_level_of_play,
        time: submission.exhibition_start_time,
      }
  }
}

// Detail Modal Component
function OSADetailModal({
  submission,
  onClose,
  onUpdate
}: {
  submission: OSASubmission
  onClose: () => void
  onUpdate: (id: string, updates: { status?: string; notes?: string }) => Promise<void>
}) {
  const [activeTab, setActiveTab] = useState<'details' | 'billing' | 'notes'>('details')
  const [status, setStatus] = useState(submission.status)
  const [notes, setNotes] = useState(submission.notes || '')
  const [saving, setSaving] = useState(false)

  const typeConfig = eventTypeConfig[submission.event_type] || { label: submission.event_type, icon: IconBallBasketball, color: 'bg-gray-100 text-gray-700' }
  const statusCfg = statusConfig[submission.status] || { label: submission.status, icon: IconClock, color: 'bg-gray-100 text-gray-700' }
  const TypeIcon = typeConfig.icon
  const eventDetails = getEventDetails(submission)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onUpdate(submission.id, { status, notes })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A'
    return new Date(dateStr).toLocaleDateString()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-portal-surface rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-portal-border">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{submission.organization_name}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${typeConfig.color}`}>
                <TypeIcon className="h-3 w-3" />
                {typeConfig.label}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {new Date(submission.created_at).toLocaleString()}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>

        {/* Status Bar */}
        <div className="px-4 py-3 bg-gray-50 dark:bg-portal-bg border-b border-gray-200 dark:border-portal-border">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Status:</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="pl-3 pr-8 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-portal-hover text-gray-900 dark:text-white"
            >
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <div className="flex-1" />
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Emails sent:
              {submission.emails_sent?.client && <span className="ml-2 text-green-600">Client</span>}
              {submission.emails_sent?.scheduler && <span className="ml-2 text-green-600">Scheduler</span>}
              {submission.emails_sent?.treasurer && <span className="ml-2 text-green-600">Treasurer</span>}
              {submission.emails_sent?.president && <span className="ml-2 text-green-600">President</span>}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-portal-border">
          <button
            onClick={() => setActiveTab('details')}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${
              activeTab === 'details'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            Event Details
          </button>
          <button
            onClick={() => setActiveTab('billing')}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${
              activeTab === 'billing'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            Billing Info
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${
              activeTab === 'notes'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            Notes
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {activeTab === 'details' && (
            <div className="space-y-6">
              {/* Event Contact */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Event Contact</h3>
                <div className="grid grid-cols-2 gap-4 bg-gray-50 dark:bg-portal-bg rounded-lg p-4">
                  <div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">Name</span>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{submission.event_contact_name}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">Email</span>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      <a href={`mailto:${submission.event_contact_email}`} className="text-blue-600 hover:underline">
                        {submission.event_contact_email}
                      </a>
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">Phone</span>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{submission.event_contact_phone || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Event Details */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Event Information</h3>
                <div className="grid grid-cols-2 gap-4 bg-gray-50 dark:bg-portal-bg rounded-lg p-4">
                  <div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">Event Name</span>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{eventDetails.name}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">Event Type</span>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{submission.event_type}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">Start Date</span>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{formatDate(eventDetails.startDate)}</p>
                  </div>
                  {eventDetails.endDate && (
                    <div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">End Date</span>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{formatDate(eventDetails.endDate)}</p>
                    </div>
                  )}
                  {eventDetails.details && (
                    <div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">Details</span>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{eventDetails.details}</p>
                    </div>
                  )}
                  {eventDetails.gender && (
                    <div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">Player Gender</span>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{eventDetails.gender}</p>
                    </div>
                  )}
                  {eventDetails.level && (
                    <div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">Level of Play</span>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{eventDetails.level}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Discipline Policy */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Discipline Policy</h3>
                <div className="bg-gray-50 dark:bg-portal-bg rounded-lg p-4">
                  <p className="text-sm text-gray-900 dark:text-white">{submission.discipline_policy}</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'billing' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Billing Contact</h3>
                <div className="grid grid-cols-2 gap-4 bg-gray-50 dark:bg-portal-bg rounded-lg p-4">
                  <div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">Name</span>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{submission.billing_contact_name}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">Email</span>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      <a href={`mailto:${submission.billing_email}`} className="text-blue-600 hover:underline">
                        {submission.billing_email}
                      </a>
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">Phone</span>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{submission.billing_phone || 'N/A'}</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Billing Address</h3>
                <div className="bg-gray-50 dark:bg-portal-bg rounded-lg p-4">
                  <p className="text-sm text-gray-900 dark:text-white">
                    {submission.billing_address || 'N/A'}<br />
                    {[submission.billing_city, submission.billing_province, submission.billing_postal_code].filter(Boolean).join(', ') || ''}
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notes' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Internal Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={8}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-portal-hover text-gray-900 dark:text-white placeholder-gray-400"
                placeholder="Add internal notes about this submission..."
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t border-gray-200 dark:border-portal-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-gray-200 dark:bg-portal-hover text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OSASubmissionsPage() {
  useAdminGuard()
  const [submissions, setSubmissions] = useState<OSASubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSubmission, setSelectedSubmission] = useState<OSASubmission | null>(null)
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    pageSize: 50,
    total: 0,
    totalPages: 0,
  })

  // Filters
  const [filters, setFilters] = useState({
    event_type: '',
    status: '',
    search: '',
    startDate: '',
    endDate: '',
  })
  const [showFilters, setShowFilters] = useState(false)

  // Table state
  const [sorting, setSorting] = useState<SortingState>([])

  const fetchSubmissions = async (page = 1) => {
    setLoading(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('Not authenticated')
        return
      }

      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pagination.pageSize.toString(),
      })

      // Add filters
      if (filters.event_type) params.append('event_type', filters.event_type)
      if (filters.status) params.append('status', filters.status)
      if (filters.search) params.append('search', filters.search)
      if (filters.startDate) params.append('startDate', filters.startDate)
      if (filters.endDate) params.append('endDate', filters.endDate)

      const response = await fetch(`/.netlify/functions/osa-submissions?${params}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      if (!response.ok) {
        const friendly = await readFriendlyError(response)
        throw new Error(friendly.message)
      }

      const data = await response.json()
      setSubmissions(data.submissions)
      setPagination(data.pagination)
    } catch (err) {
      setError(friendlyErrorFromThrown(err).message)
    } finally {
      setLoading(false)
    }
  }

  const updateSubmission = async (id: string, updates: { status?: string; notes?: string }) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

    const response = await fetch('/.netlify/functions/osa-submissions', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ id, ...updates })
    })

    if (!response.ok) {
      const friendly = await readFriendlyError(response)
      throw new Error(friendly.message)
    }

    // Refresh the list
    await fetchSubmissions(pagination.page)
  }

  const exportToCSV = () => {
    if (submissions.length === 0) return

    const headers = [
      'Submitted', 'Organization', 'Event Type', 'Event Name', 'Start Date', 'End Date',
      'Event Contact', 'Event Email', 'Event Phone',
      'Billing Contact', 'Billing Email', 'Billing Phone',
      'Address', 'City', 'Province', 'Postal Code',
      'Player Gender', 'Level of Play', 'Discipline Policy', 'Status', 'Notes'
    ]

    const rows = submissions.map(s => {
      const details = getEventDetails(s)
      return [
        new Date(s.created_at).toLocaleDateString(),
        s.organization_name,
        s.event_type,
        details.name,
        details.startDate || '',
        details.endDate || '',
        s.event_contact_name,
        s.event_contact_email,
        s.event_contact_phone || '',
        s.billing_contact_name,
        s.billing_email,
        s.billing_phone || '',
        s.billing_address || '',
        s.billing_city || '',
        s.billing_province || '',
        s.billing_postal_code || '',
        details.gender || '',
        details.level || '',
        s.discipline_policy,
        s.status,
        s.notes || ''
      ].map(v => `"${String(v).replace(/"/g, '""')}"`)
    })

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `osa-submissions-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    fetchSubmissions(1)
  }, [filters])

  const clearFilters = () => {
    setFilters({
      event_type: '',
      status: '',
      search: '',
      startDate: '',
      endDate: '',
    })
  }

  const hasActiveFilters = Object.values(filters).some(v => v !== '')

  const columns: ColumnDef<OSASubmission>[] = useMemo(
    () => [
      {
        accessorKey: 'created_at',
        header: 'Submitted',
        cell: ({ getValue }) => {
          const date = new Date(getValue() as string)
          return (
            <span className="text-xs whitespace-nowrap text-gray-700 dark:text-gray-300">
              {date.toLocaleDateString()}
            </span>
          )
        },
        size: 100,
      },
      {
        accessorKey: 'organization_name',
        header: 'Organization',
        cell: ({ getValue }) => (
          <span className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-xs block" title={getValue() as string}>
            {getValue() as string}
          </span>
        ),
        size: 200,
      },
      {
        accessorKey: 'event_type',
        header: 'Type',
        cell: ({ getValue }) => {
          const type = getValue() as string
          const config = eventTypeConfig[type] || { label: type, icon: IconBallBasketball, color: 'bg-gray-100 text-gray-700 dark:bg-portal-hover dark:text-gray-300' }
          const Icon = config.icon
          return (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${config.color}`}>
              <Icon className="h-3 w-3" />
              {config.label}
            </span>
          )
        },
        size: 120,
      },
      {
        id: 'event_name',
        header: 'Event',
        cell: ({ row }) => {
          const details = getEventDetails(row.original)
          return (
            <span className="text-sm text-gray-800 dark:text-gray-200 truncate max-w-xs block" title={details.name}>
              {details.name}
            </span>
          )
        },
        size: 180,
      },
      {
        id: 'start_date',
        header: 'Start Date',
        cell: ({ row }) => {
          const details = getEventDetails(row.original)
          return (
            <span className="text-xs text-gray-700 dark:text-gray-300">
              {details.startDate ? new Date(details.startDate).toLocaleDateString() : 'N/A'}
            </span>
          )
        },
        size: 100,
      },
      {
        accessorKey: 'event_contact_name',
        header: 'Contact',
        cell: ({ row }) => (
          <div className="text-xs">
            <span className="text-gray-800 dark:text-gray-200 block">{row.original.event_contact_name}</span>
            <a href={`mailto:${row.original.event_contact_email}`} className="text-blue-500 hover:underline">
              {row.original.event_contact_email}
            </a>
          </div>
        ),
        size: 180,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ getValue }) => {
          const status = getValue() as string
          const config = statusConfig[status] || { label: status, icon: IconClock, color: 'bg-gray-100 text-gray-700 dark:bg-portal-hover dark:text-gray-300' }
          const Icon = config.icon
          return (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${config.color}`}>
              <Icon className="h-3 w-3" />
              {config.label}
            </span>
          )
        },
        size: 100,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <button
            onClick={() => setSelectedSubmission(row.original)}
            className="p-1.5 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-portal-hover rounded"
            title="View details"
          >
            <IconEye className="h-4 w-4" />
          </button>
        ),
        size: 50,
      },
    ],
    []
  )

  const table = useReactTable({
    data: submissions,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    pageCount: pagination.totalPages,
  })

  return (
    <div className="p-6 portal-animate">
      {/* Detail Modal */}
      {selectedSubmission && (
        <OSADetailModal
          submission={selectedSubmission}
          onClose={() => setSelectedSubmission(null)}
          onUpdate={updateSubmission}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold font-heading tracking-tight text-gray-900 dark:text-white">OSA Submissions</h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm">Officiating Services Agreement requests</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportToCSV}
            disabled={submissions.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            <IconDownload className="h-4 w-4" />
            Export CSV
          </button>
          <button
            onClick={() => fetchSubmissions(pagination.page)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <IconRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-portal-surface rounded-lg border border-gray-200 dark:border-portal-border mb-4">
        <div className="p-4 flex items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search organization, contact, event..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-portal-hover text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm ${
              hasActiveFilters
                ? 'bg-blue-900/30 border-blue-700 text-blue-400'
                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-portal-hover'
            }`}
          >
            <IconFilter className="h-4 w-4" />
            Filters
            {hasActiveFilters && (
              <span className="bg-blue-600 text-white text-xs px-1.5 rounded-full">
                {Object.values(filters).filter(v => v !== '').length}
              </span>
            )}
          </button>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
            >
              <IconX className="h-4 w-4" />
              Clear
            </button>
          )}
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="px-4 pb-4 pt-2 border-t border-gray-200 dark:border-portal-border grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Event Type</label>
              <select
                value={filters.event_type}
                onChange={(e) => setFilters({ ...filters, event_type: e.target.value })}
                className="w-full pl-3 pr-8 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-portal-hover text-gray-900 dark:text-white"
              >
                <option value="">All</option>
                <option value="Exhibition Game(s)">Exhibition</option>
                <option value="League">League</option>
                <option value="Tournament">Tournament</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="w-full pl-3 pr-8 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-portal-hover text-gray-900 dark:text-white"
              >
                <option value="">All</option>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-portal-hover text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">End Date</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-portal-hover text-gray-900 dark:text-white"
              />
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-portal-surface rounded-lg border border-gray-200 dark:border-portal-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-portal-bg border-b border-gray-200 dark:border-portal-border">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                      onClick={header.column.getToggleSortingHandler()}
                      style={{ width: header.column.getSize() }}
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() && (
                          header.column.getIsSorted() === 'asc' ? (
                            <IconArrowUp className="h-3 w-3" />
                          ) : (
                            <IconArrowDown className="h-3 w-3" />
                          )
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="text-gray-900 dark:text-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    <IconRefresh className="h-6 w-6 animate-spin mx-auto mb-2" />
                    Loading submissions...
                  </td>
                </tr>
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    No submissions found
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-gray-200 dark:border-portal-border hover:bg-gray-50 dark:hover:bg-portal-hover/50 cursor-pointer"
                    onClick={() => setSelectedSubmission(row.original)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-portal-border bg-gray-50 dark:bg-portal-bg">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {pagination.total > 0 ? (
              <>
                Showing {((pagination.page - 1) * pagination.pageSize) + 1} to{' '}
                {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{' '}
                {pagination.total} submissions
              </>
            ) : (
              'No submissions'
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchSubmissions(1)}
              disabled={pagination.page === 1 || loading}
              className="p-2 rounded text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-portal-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <IconChevronsLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => fetchSubmissions(pagination.page - 1)}
              disabled={pagination.page === 1 || loading}
              className="p-2 rounded text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-portal-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <IconChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-3 py-1 text-sm text-gray-700 dark:text-gray-300">
              Page {pagination.page} of {pagination.totalPages || 1}
            </span>
            <button
              onClick={() => fetchSubmissions(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages || loading}
              className="p-2 rounded text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-portal-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <IconChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => fetchSubmissions(pagination.totalPages)}
              disabled={pagination.page >= pagination.totalPages || loading}
              className="p-2 rounded text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-portal-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <IconChevronsRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
