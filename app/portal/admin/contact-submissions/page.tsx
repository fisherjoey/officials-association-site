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
  IconClock,
  IconEyeCheck,
  IconMessageCheck,
  IconArchive,
  IconMail,
  IconMessageCircle,
  IconLink,
} from '@tabler/icons-react'

interface ContactSubmission {
  id: string
  created_at: string
  updated_at: string
  sender_name: string
  sender_email: string
  category: string
  category_label: string
  subject: string
  message: string
  recipient_email: string
  attachment_urls: string[] | null
  status: string
  notes: string | null
}

interface PaginationInfo {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

const supabase = getSupabaseBrowserClient()

const statusConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  new: { label: 'New', icon: IconClock, color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400' },
  read: { label: 'Read', icon: IconEyeCheck, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
  responded: { label: 'Responded', icon: IconMessageCheck, color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' },
  archived: { label: 'Archived', icon: IconArchive, color: 'bg-gray-100 text-gray-700 dark:bg-gray-700/40 dark:text-gray-400' },
}

const categoryConfig: Record<string, { label: string; color: string }> = {
  general: { label: 'General', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700/40 dark:text-gray-300' },
  scheduling: { label: 'Scheduling', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
  billing: { label: 'Billing', color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' },
  membership: { label: 'Membership', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400' },
  education: { label: 'Education', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400' },
  website: { label: 'Website', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-400' },
  performance: { label: 'Performance', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400' },
  recruiting: { label: 'Recruiting', color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-400' },
  other: { label: 'Other', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700/40 dark:text-gray-300' },
}

// Detail Modal
function ContactDetailModal({
  submission,
  onClose,
  onUpdate,
}: {
  submission: ContactSubmission
  onClose: () => void
  onUpdate: (id: string, updates: { status?: string; notes?: string }) => Promise<void>
}) {
  const [status, setStatus] = useState(submission.status)
  const [notes, setNotes] = useState(submission.notes || '')
  const [saving, setSaving] = useState(false)

  const catConfig = categoryConfig[submission.category] || categoryConfig.other

  const handleSave = async () => {
    setSaving(true)
    try {
      await onUpdate(submission.id, { status, notes })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-portal-surface rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-portal-border">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate">{submission.subject}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${catConfig.color}`}>
                {catConfig.label}
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
              <option value="read">Read</option>
              <option value="responded">Responded</option>
              <option value="archived">Archived</option>
            </select>
            <div className="flex-1" />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Routed to: {submission.recipient_email}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-6">
          {/* Sender Info */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Sender</h3>
            <div className="grid grid-cols-2 gap-4 bg-gray-50 dark:bg-portal-bg rounded-lg p-4">
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400">Name</span>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{submission.sender_name}</p>
              </div>
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400">Email</span>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  <a href={`mailto:${submission.sender_email}`} className="text-blue-600 hover:underline dark:text-blue-400">
                    {submission.sender_email}
                  </a>
                </p>
              </div>
            </div>
          </div>

          {/* Message */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Message</h3>
            <div className="bg-gray-50 dark:bg-portal-bg rounded-lg p-4">
              <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">{submission.message}</p>
            </div>
          </div>

          {/* Attachments */}
          {submission.attachment_urls && submission.attachment_urls.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Attachments ({submission.attachment_urls.length})
              </h3>
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 space-y-2">
                {submission.attachment_urls.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline break-all"
                  >
                    <IconLink size={16} className="flex-shrink-0" />
                    {url}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Internal Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-portal-hover text-gray-900 dark:text-white placeholder-gray-400"
              placeholder="Add internal notes about this submission..."
            />
          </div>
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

export default function ContactSubmissionsPage() {
  useAdminGuard()
  const [submissions, setSubmissions] = useState<ContactSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSubmission, setSelectedSubmission] = useState<ContactSubmission | null>(null)
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    pageSize: 50,
    total: 0,
    totalPages: 0,
  })

  const [filters, setFilters] = useState({
    category: '',
    status: '',
    search: '',
    startDate: '',
    endDate: '',
  })
  const [showFilters, setShowFilters] = useState(false)
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

      if (filters.category) params.append('category', filters.category)
      if (filters.status) params.append('status', filters.status)
      if (filters.search) params.append('search', filters.search)
      if (filters.startDate) params.append('startDate', filters.startDate)
      if (filters.endDate) params.append('endDate', filters.endDate)

      const response = await fetch(`/.netlify/functions/contact-submissions?${params}`, {
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

    const response = await fetch('/.netlify/functions/contact-submissions', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ id, ...updates }),
    })

    if (!response.ok) {
      const friendly = await readFriendlyError(response)
      throw new Error(friendly.message)
    }

    await fetchSubmissions(pagination.page)
  }

  const exportToCSV = () => {
    if (submissions.length === 0) return

    const csvHeaders = [
      'Date', 'Name', 'Email', 'Category', 'Subject', 'Message', 'Routed To', 'Status', 'Notes'
    ]

    const rows = submissions.map(s => [
      new Date(s.created_at).toLocaleString(),
      s.sender_name,
      s.sender_email,
      s.category_label,
      s.subject,
      s.message,
      s.recipient_email,
      s.status,
      s.notes || '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`)
    )

    const csv = [csvHeaders.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `contact-submissions-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    fetchSubmissions(1)
  }, [filters])

  const clearFilters = () => {
    setFilters({
      category: '',
      status: '',
      search: '',
      startDate: '',
      endDate: '',
    })
  }

  const hasActiveFilters = Object.values(filters).some(v => v !== '')

  const columns: ColumnDef<ContactSubmission>[] = useMemo(
    () => [
      {
        accessorKey: 'created_at',
        header: 'Date',
        cell: ({ getValue }) => {
          const date = new Date(getValue() as string)
          return (
            <span className="text-xs whitespace-nowrap text-gray-700 dark:text-gray-300">
              {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )
        },
        size: 140,
      },
      {
        accessorKey: 'sender_name',
        header: 'Sender',
        cell: ({ row }) => (
          <div className="text-xs">
            <span className="text-gray-900 dark:text-white font-medium block">{row.original.sender_name}</span>
            <span className="text-gray-500 dark:text-gray-400">{row.original.sender_email}</span>
          </div>
        ),
        size: 200,
      },
      {
        accessorKey: 'category',
        header: 'Category',
        cell: ({ getValue }) => {
          const cat = getValue() as string
          const config = categoryConfig[cat] || categoryConfig.other
          return (
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${config.color}`}>
              {config.label}
            </span>
          )
        },
        size: 110,
      },
      {
        accessorKey: 'subject',
        header: 'Subject',
        cell: ({ getValue }) => (
          <span className="text-sm max-w-xs truncate block text-gray-800 dark:text-gray-200" title={getValue() as string}>
            {(getValue() as string).replace('[Contact Form] ', '')}
          </span>
        ),
        size: 250,
      },
      {
        accessorKey: 'recipient_email',
        header: 'Routed To',
        cell: ({ getValue }) => (
          <span className="text-xs text-gray-600 dark:text-gray-400">{getValue() as string}</span>
        ),
        size: 150,
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
        <ContactDetailModal
          submission={selectedSubmission}
          onClose={() => setSelectedSubmission(null)}
          onUpdate={updateSubmission}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold font-heading tracking-tight text-gray-900 dark:text-white">Contact Submissions</h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm">Messages from the public contact form</p>
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
          <div className="relative flex-1 max-w-md">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search name, email, subject, message..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-portal-hover text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

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

        {showFilters && (
          <div className="px-4 pb-4 pt-2 border-t border-gray-200 dark:border-portal-border grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
              <select
                value={filters.category}
                onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                className="w-full pl-3 pr-8 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-portal-hover text-gray-900 dark:text-white"
              >
                <option value="">All</option>
                <option value="general">General</option>
                <option value="scheduling">Scheduling</option>
                <option value="billing">Billing</option>
                <option value="membership">Membership</option>
                <option value="education">Education</option>
                <option value="website">Website</option>
                <option value="performance">Performance</option>
                <option value="recruiting">Recruiting</option>
                <option value="other">Other</option>
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
                <option value="read">Read</option>
                <option value="responded">Responded</option>
                <option value="archived">Archived</option>
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
                    <IconMessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No contact submissions found
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`border-b border-gray-200 dark:border-portal-border hover:bg-gray-50 dark:hover:bg-portal-hover/50 cursor-pointer ${
                      row.original.status === 'new' ? 'bg-yellow-50/30 dark:bg-yellow-900/5' : ''
                    }`}
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
