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
  IconMail,
  IconMailForward,
  IconKey,
  IconUsers,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconFilter,
  IconX,
  IconCheck,
  IconAlertCircle,
  IconEye,
  IconMessageCircle,
} from '@tabler/icons-react'

interface EmailHistoryRecord {
  id: string
  created_at: string
  email_type: 'bulk' | 'invite' | 'password_reset' | 'welcome' | 'contact_form'
  sent_by_email: string
  subject: string
  html_content: string | null
  recipient_count: number
  recipient_list: string[] | null
  recipient_groups: string[] | null
  rank_filter: string | null
  recipient_email: string | null
  recipient_name: string | null
  status: 'sent' | 'failed' | 'partial'
  error_message: string | null
  metadata: Record<string, unknown> | null
}

interface PaginationInfo {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

const supabase = getSupabaseBrowserClient()

const emailTypeConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  bulk: { label: 'Bulk', icon: IconUsers, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
  invite: { label: 'Invite', icon: IconMailForward, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400' },
  password_reset: { label: 'Password Reset', icon: IconKey, color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400' },
  welcome: { label: 'Welcome', icon: IconMail, color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' },
  contact_form: { label: 'Contact Form', icon: IconMessageCircle, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400' },
}

const statusConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  sent: { label: 'Sent', icon: IconCheck, color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' },
  failed: { label: 'Failed', icon: IconAlertCircle, color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
  partial: { label: 'Partial', icon: IconAlertCircle, color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400' },
}

function ContactFormMeta({ email }: { email: EmailHistoryRecord }) {
  const meta = email.metadata as Record<string, string>
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div>
        <span className="text-gray-500 dark:text-gray-400">From:</span>
        <p className="font-medium text-gray-900 dark:text-white">{meta.sender_name}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{meta.sender_email}</p>
      </div>
      <div>
        <span className="text-gray-500 dark:text-gray-400">Category:</span>
        <p className="font-medium text-gray-900 dark:text-white">{meta.category_label}</p>
      </div>
      <div>
        <span className="text-gray-500 dark:text-gray-400">Routed To:</span>
        <p className="font-medium text-gray-900 dark:text-white">{email.recipient_email}</p>
      </div>
      <div>
        <span className="text-gray-500 dark:text-gray-400">Date:</span>
        <p className="font-medium text-gray-900 dark:text-white">{new Date(email.created_at).toLocaleString()}</p>
      </div>
      {meta.message && (
        <div className="col-span-full mt-2">
          <span className="text-gray-500 dark:text-gray-400">Original Message:</span>
          <div className="mt-1 p-3 bg-white dark:bg-portal-surface rounded border border-gray-200 dark:border-portal-border">
            <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap text-sm">{meta.message}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// Email Detail Modal Component
function EmailDetailModal({
  email,
  onClose
}: {
  email: EmailHistoryRecord
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<'preview' | 'recipients'>('preview')
  const typeConfig = emailTypeConfig[email.email_type] || { label: email.email_type, icon: IconMail, color: 'bg-gray-100 text-gray-700' }
  const statusCfg = statusConfig[email.status] || { label: email.status, icon: IconMail, color: 'bg-gray-100 text-gray-700' }
  const TypeIcon = typeConfig.icon
  const StatusIcon = statusCfg.icon

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-portal-surface rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-portal-border">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{email.subject}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${typeConfig.color}`}>
                <TypeIcon className="h-3 w-3" />
                {typeConfig.label}
              </span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${statusCfg.color}`}>
                <StatusIcon className="h-3 w-3" />
                {statusCfg.label}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {new Date(email.created_at).toLocaleString()}
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

        {/* Meta Info */}
        <div className="px-4 py-3 bg-gray-50 dark:bg-portal-bg border-b border-gray-200 dark:border-portal-border text-sm">
          {email.email_type === 'contact_form' && email.metadata ? (
            <ContactFormMeta email={email} />
          ) : (
            // Standard email metadata display
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <span className="text-gray-500 dark:text-gray-400">Sent By:</span>
                <p className="font-medium text-gray-900 dark:text-white">{email.sent_by_email || 'System'}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Recipients:</span>
                <p className="font-medium text-gray-900 dark:text-white">{email.recipient_count}</p>
              </div>
              {email.recipient_groups && email.recipient_groups.length > 0 && (
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Groups:</span>
                  <p className="font-medium text-gray-900 dark:text-white">{email.recipient_groups.join(', ')}</p>
                </div>
              )}
              {email.rank_filter && (
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Rank Filter:</span>
                  <p className="font-medium text-gray-900 dark:text-white">{email.rank_filter}</p>
                </div>
              )}
              {email.recipient_email && (
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Recipient:</span>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {email.recipient_name ? `${email.recipient_name} (${email.recipient_email})` : email.recipient_email}
                  </p>
                </div>
              )}
            </div>
          )}
          {email.error_message && (
            <div className="mt-3 p-2 bg-red-100 dark:bg-red-900/30 rounded text-red-700 dark:text-red-400 text-xs">
              <strong>Error:</strong> {email.error_message}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-portal-border">
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${
              activeTab === 'preview'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            Email Preview
          </button>
          {email.recipient_list && email.recipient_list.length > 0 && (
            <button
              onClick={() => setActiveTab('recipients')}
              className={`px-4 py-2 text-sm font-medium border-b-2 ${
                activeTab === 'recipients'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              Recipients ({email.recipient_list.length})
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {activeTab === 'preview' && (
            email.html_content ? (
              <div className="bg-white rounded border border-gray-200">
                <iframe
                  srcDoc={email.html_content}
                  className="w-full h-[500px] border-0"
                  title="Email Preview"
                  sandbox="allow-same-origin"
                />
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <IconMail className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Email content not available</p>
                <p className="text-sm mt-1">Content was not recorded for this email</p>
              </div>
            )
          )}

          {activeTab === 'recipients' && email.recipient_list && (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {email.recipient_list.length} recipients
                </span>
                <button
                  onClick={() => {
                    const text = email.recipient_list?.join(', ') || ''
                    navigator.clipboard.writeText(text)
                  }}
                  className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                >
                  Copy all emails
                </button>
              </div>
              <div className="max-h-[400px] overflow-y-auto bg-gray-50 dark:bg-portal-bg rounded-lg p-3">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {email.recipient_list.map((recipient, idx) => (
                    <div
                      key={idx}
                      className="text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-portal-surface px-3 py-2 rounded border border-gray-200 dark:border-portal-border truncate"
                      title={recipient}
                    >
                      {recipient}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-4 border-t border-gray-200 dark:border-portal-border">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 dark:bg-portal-hover text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default function EmailHistoryPage() {
  useAdminGuard()
  const [emails, setEmails] = useState<EmailHistoryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedEmail, setSelectedEmail] = useState<EmailHistoryRecord | null>(null)
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    pageSize: 50,
    total: 0,
    totalPages: 0,
  })

  // Filters
  const [filters, setFilters] = useState({
    email_type: '',
    status: '',
    search: '',
    startDate: '',
    endDate: '',
  })
  const [showFilters, setShowFilters] = useState(false)

  // Table state
  const [sorting, setSorting] = useState<SortingState>([])

  const fetchEmails = async (page = 1) => {
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
      if (filters.email_type) params.append('email_type', filters.email_type)
      if (filters.status) params.append('status', filters.status)
      if (filters.search) params.append('search', filters.search)
      if (filters.startDate) params.append('startDate', filters.startDate)
      if (filters.endDate) params.append('endDate', filters.endDate)

      const response = await fetch(`/.netlify/functions/email-history?${params}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      if (!response.ok) {
        const friendly = await readFriendlyError(response)
        throw new Error(friendly.message)
      }

      const data = await response.json()
      setEmails(data.emails)
      setPagination(data.pagination)
    } catch (err) {
      setError(friendlyErrorFromThrown(err).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEmails(1)
  }, [filters])

  const clearFilters = () => {
    setFilters({
      email_type: '',
      status: '',
      search: '',
      startDate: '',
      endDate: '',
    })
  }

  const hasActiveFilters = Object.values(filters).some(v => v !== '')

  const columns: ColumnDef<EmailHistoryRecord>[] = useMemo(
    () => [
      {
        accessorKey: 'created_at',
        header: 'Date',
        cell: ({ getValue }) => {
          const date = new Date(getValue() as string)
          return (
            <span className="text-xs whitespace-nowrap text-gray-700 dark:text-gray-300">
              {date.toLocaleDateString()} {date.toLocaleTimeString()}
            </span>
          )
        },
        size: 150,
      },
      {
        accessorKey: 'email_type',
        header: 'Type',
        cell: ({ getValue }) => {
          const type = getValue() as string
          const config = emailTypeConfig[type] || { label: type, icon: IconMail, color: 'bg-gray-100 text-gray-700 dark:bg-portal-hover dark:text-gray-300' }
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
        accessorKey: 'subject',
        header: 'Subject',
        cell: ({ getValue }) => (
          <span className="text-sm max-w-xs truncate block text-gray-800 dark:text-gray-200" title={getValue() as string}>
            {getValue() as string}
          </span>
        ),
        size: 250,
      },
      {
        accessorKey: 'recipient_count',
        header: 'Recipients',
        cell: ({ row }) => {
          const record = row.original
          // Contact form: show sender info (the person who submitted the form)
          if (record.email_type === 'contact_form' && record.metadata) {
            const meta = record.metadata as Record<string, string>
            const senderName = meta.sender_name
            const senderEmail = meta.sender_email
            return (
              <span className="text-xs text-gray-800 dark:text-gray-200" title={senderEmail}>
                {senderName || senderEmail}
              </span>
            )
          }
          if (record.recipient_email) {
            return (
              <span className="text-xs text-gray-800 dark:text-gray-200" title={record.recipient_email}>
                {record.recipient_name || record.recipient_email}
              </span>
            )
          }
          const groups = record.recipient_groups?.join(', ') || ''
          return (
            <span className="text-xs text-gray-800 dark:text-gray-200" title={groups}>
              {record.recipient_count} {groups && `(${groups})`}
            </span>
          )
        },
        size: 180,
      },
      {
        accessorKey: 'sent_by_email',
        header: 'Sent By',
        cell: ({ row, getValue }) => {
          if (row.original.email_type === 'contact_form') {
            return <span className="text-xs text-gray-600 dark:text-gray-400">Website Form</span>
          }
          return <span className="text-xs text-gray-600 dark:text-gray-400">{(getValue() as string) || 'System'}</span>
        },
        size: 150,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ getValue, row }) => {
          const status = getValue() as string
          const config = statusConfig[status] || { label: status, icon: IconMail, color: 'bg-gray-100 text-gray-700 dark:bg-portal-hover dark:text-gray-300' }
          const Icon = config.icon
          const errorMsg = row.original.error_message
          return (
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${config.color}`}
              title={errorMsg || undefined}
            >
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
            onClick={() => setSelectedEmail(row.original)}
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
    data: emails,
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
      {selectedEmail && (
        <EmailDetailModal
          email={selectedEmail}
          onClose={() => setSelectedEmail(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold font-heading tracking-tight text-gray-900 dark:text-white">Email History</h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm">View all emails sent through the system</p>
        </div>
        <button
          onClick={() => fetchEmails(pagination.page)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <IconRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-portal-surface rounded-lg border border-gray-200 dark:border-portal-border mb-4">
        <div className="p-4 flex items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by subject, email..."
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
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
              <select
                value={filters.email_type}
                onChange={(e) => setFilters({ ...filters, email_type: e.target.value })}
                className="w-full pl-3 pr-8 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-portal-hover text-gray-900 dark:text-white"
              >
                <option value="">All</option>
                <option value="bulk">Bulk</option>
                <option value="invite">Invite</option>
                <option value="password_reset">Password Reset</option>
                <option value="welcome">Welcome</option>
                <option value="contact_form">Contact Form</option>
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
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
                <option value="partial">Partial</option>
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
                    Loading emails...
                  </td>
                </tr>
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    No emails found
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-gray-200 dark:border-portal-border hover:bg-gray-50 dark:hover:bg-portal-hover/50 cursor-pointer"
                    onClick={() => setSelectedEmail(row.original)}
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
                {pagination.total} results
              </>
            ) : (
              'No results'
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchEmails(1)}
              disabled={pagination.page === 1 || loading}
              className="p-2 rounded text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-portal-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <IconChevronsLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => fetchEmails(pagination.page - 1)}
              disabled={pagination.page === 1 || loading}
              className="p-2 rounded text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-portal-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <IconChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-3 py-1 text-sm text-gray-700 dark:text-gray-300">
              Page {pagination.page} of {pagination.totalPages || 1}
            </span>
            <button
              onClick={() => fetchEmails(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages || loading}
              className="p-2 rounded text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-portal-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <IconChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => fetchEmails(pagination.totalPages)}
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
