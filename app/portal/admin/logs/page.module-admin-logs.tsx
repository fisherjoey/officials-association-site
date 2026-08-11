'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
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
  IconAlertCircle,
  IconAlertTriangle,
  IconInfoCircle,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconFilter,
  IconX,
} from '@tabler/icons-react'

// Types
interface AppLog {
  id: string
  timestamp: string
  level: 'ERROR' | 'WARN' | 'INFO'
  source: 'server' | 'client'
  function_name: string
  category: string
  action: string
  message: string
  user_id?: string
  user_email?: string
  request_id?: string
  metadata?: Record<string, unknown>
  error_stack?: string
}

interface AuditLog {
  id: string
  timestamp: string
  action: string
  entity_type: string
  entity_id?: string
  actor_id?: string
  actor_email?: string
  actor_role?: string
  target_user_id?: string
  target_user_email?: string
  old_values?: Record<string, unknown>
  new_values?: Record<string, unknown>
  description?: string
  ip_address?: string
}

interface PaginationInfo {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

const supabase = getSupabaseBrowserClient()

export default function AdminLogsPage() {
  useAdminGuard()
  const [activeTab, setActiveTab] = useState<'app' | 'audit'>('app')
  const [appLogs, setAppLogs] = useState<AppLog[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    pageSize: 50,
    total: 0,
    totalPages: 0,
  })

  // Filters
  const [filters, setFilters] = useState({
    level: '',
    source: '',
    category: '',
    action: '',
    search: '',
    startDate: '',
    endDate: '',
  })
  const [showFilters, setShowFilters] = useState(false)

  // Table state
  const [sorting, setSorting] = useState<SortingState>([])

  const fetchLogs = async (page = 1) => {
    setLoading(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('Not authenticated')
        return
      }

      const params = new URLSearchParams({
        type: activeTab,
        page: page.toString(),
        pageSize: pagination.pageSize.toString(),
      })

      // Add filters
      if (filters.level) params.append('level', filters.level)
      if (filters.source) params.append('source', filters.source)
      if (filters.category) params.append('category', filters.category)
      if (filters.action) params.append('action', filters.action)
      if (filters.search) params.append('search', filters.search)
      if (filters.startDate) params.append('startDate', filters.startDate)
      if (filters.endDate) params.append('endDate', filters.endDate)

      const response = await fetch(`/.netlify/functions/logs?${params}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      if (!response.ok) {
        const friendly = await readFriendlyError(response)
        throw new Error(friendly.message)
      }

      const data = await response.json()

      if (activeTab === 'app') {
        setAppLogs(data.logs)
      } else {
        setAuditLogs(data.logs)
      }
      setPagination(data.pagination)
    } catch (err) {
      setError(friendlyErrorFromThrown(err).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs(1)
  }, [activeTab, filters])

  const clearFilters = () => {
    setFilters({
      level: '',
      source: '',
      category: '',
      action: '',
      search: '',
      startDate: '',
      endDate: '',
    })
  }

  const hasActiveFilters = Object.values(filters).some(v => v !== '')

  // App Logs columns
  const appLogColumns: ColumnDef<AppLog>[] = useMemo(
    () => [
      {
        accessorKey: 'timestamp',
        header: 'Time',
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
        accessorKey: 'level',
        header: 'Level',
        cell: ({ getValue }) => {
          const level = getValue() as string
          const config = {
            ERROR: { icon: IconAlertCircle, color: 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/40' },
            WARN: { icon: IconAlertTriangle, color: 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/40' },
            INFO: { icon: IconInfoCircle, color: 'text-blue-400 bg-blue-900/40 text-blue-400' },
          }[level] || { icon: IconInfoCircle, color: 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-portal-hover' }
          const Icon = config.icon
          return (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${config.color}`}>
              <Icon className="h-3 w-3" />
              {level}
            </span>
          )
        },
        size: 100,
      },
      {
        accessorKey: 'source',
        header: 'Source',
        cell: ({ getValue }) => (
          <span className={`text-xs px-2 py-0.5 rounded ${getValue() === 'server' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400' : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'}`}>
            {getValue() as string}
          </span>
        ),
        size: 80,
      },
      {
        accessorKey: 'function_name',
        header: 'Function',
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-gray-800 dark:text-gray-200">{getValue() as string}</span>
        ),
        size: 150,
      },
      {
        accessorKey: 'category',
        header: 'Category',
        size: 100,
      },
      {
        accessorKey: 'action',
        header: 'Action',
        size: 120,
      },
      {
        accessorKey: 'message',
        header: 'Message',
        cell: ({ getValue }) => (
          <span className="text-sm max-w-md truncate block text-gray-800 dark:text-gray-200" title={getValue() as string}>
            {getValue() as string}
          </span>
        ),
        size: 300,
      },
      {
        accessorKey: 'user_email',
        header: 'User',
        cell: ({ getValue }) => (
          <span className="text-xs text-gray-600 dark:text-gray-400">{(getValue() as string) || '-'}</span>
        ),
        size: 150,
      },
    ],
    []
  )

  // Audit Logs columns
  const auditLogColumns: ColumnDef<AuditLog>[] = useMemo(
    () => [
      {
        accessorKey: 'timestamp',
        header: 'Time',
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
        accessorKey: 'action',
        header: 'Action',
        cell: ({ getValue }) => {
          const action = getValue() as string
          const colors: Record<string, string> = {
            CREATE: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
            UPDATE: 'bg-blue-900/40 text-blue-400',
            DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
            LOGIN: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
            INVITE: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
            PASSWORD_RESET: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
            ROLE_CHANGE: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-400',
            EMAIL_SENT: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-400',
          }
          return (
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${colors[action] || 'bg-gray-100 text-gray-700 dark:bg-portal-hover dark:text-gray-300'}`}>
              {action}
            </span>
          )
        },
        size: 120,
      },
      {
        accessorKey: 'entity_type',
        header: 'Entity',
        size: 100,
      },
      {
        accessorKey: 'actor_email',
        header: 'Actor',
        cell: ({ getValue }) => (
          <span className="text-xs text-gray-800 dark:text-gray-200">{(getValue() as string) || 'System'}</span>
        ),
        size: 150,
      },
      {
        accessorKey: 'target_user_email',
        header: 'Target',
        cell: ({ getValue }) => (
          <span className="text-xs text-gray-600 dark:text-gray-400">{(getValue() as string) || '-'}</span>
        ),
        size: 150,
      },
      {
        accessorKey: 'description',
        header: 'Description',
        cell: ({ getValue }) => (
          <span className="text-sm max-w-md truncate block text-gray-800 dark:text-gray-200" title={getValue() as string}>
            {(getValue() as string) || '-'}
          </span>
        ),
        size: 300,
      },
      {
        accessorKey: 'actor_role',
        header: 'Role',
        cell: ({ getValue }) => (
          <span className="text-xs text-gray-500 dark:text-gray-400">{(getValue() as string) || '-'}</span>
        ),
        size: 80,
      },
    ],
    []
  )

  const appTable = useReactTable({
    data: appLogs,
    columns: appLogColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    pageCount: pagination.totalPages,
  })

  const auditTable = useReactTable({
    data: auditLogs,
    columns: auditLogColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    pageCount: pagination.totalPages,
  })

  const currentTable = activeTab === 'app' ? appTable : auditTable
  const currentColumns = activeTab === 'app' ? appLogColumns : auditLogColumns

  return (
    <div className="p-6 portal-animate">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold font-heading tracking-tight text-gray-900 dark:text-white">System Logs</h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm">Monitor application activity and audit trail</p>
        </div>
        <button
          onClick={() => fetchLogs(pagination.page)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <IconRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 border-b border-gray-200 dark:border-portal-border">
        <button
          onClick={() => setActiveTab('app')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'app'
              ? 'border-blue-400 text-blue-400'
              : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          App Logs
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'audit'
              ? 'border-blue-400 text-blue-400'
              : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          Audit Logs
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
              placeholder="Search logs..."
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
            {activeTab === 'app' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Level</label>
                  <select
                    value={filters.level}
                    onChange={(e) => setFilters({ ...filters, level: e.target.value })}
                    className="w-full pl-3 pr-8 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-portal-hover text-gray-900 dark:text-white"
                  >
                    <option value="">All</option>
                    <option value="ERROR">ERROR</option>
                    <option value="WARN">WARN</option>
                    <option value="INFO">INFO</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Source</label>
                  <select
                    value={filters.source}
                    onChange={(e) => setFilters({ ...filters, source: e.target.value })}
                    className="w-full pl-3 pr-8 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-portal-hover text-gray-900 dark:text-white"
                  >
                    <option value="">All</option>
                    <option value="server">Server</option>
                    <option value="client">Client</option>
                  </select>
                </div>
              </>
            )}
            {activeTab === 'audit' && (
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Action</label>
                <select
                  value={filters.action}
                  onChange={(e) => setFilters({ ...filters, action: e.target.value })}
                  className="w-full pl-3 pr-8 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-portal-hover text-gray-900 dark:text-white"
                >
                  <option value="">All</option>
                  <option value="CREATE">CREATE</option>
                  <option value="UPDATE">UPDATE</option>
                  <option value="DELETE">DELETE</option>
                  <option value="LOGIN">LOGIN</option>
                  <option value="INVITE">INVITE</option>
                  <option value="PASSWORD_RESET">PASSWORD_RESET</option>
                  <option value="ROLE_CHANGE">ROLE_CHANGE</option>
                  <option value="EMAIL_SENT">EMAIL_SENT</option>
                </select>
              </div>
            )}
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
              {currentTable.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                      onClick={header.column.getToggleSortingHandler()}
                      style={{ width: header.column.getSize() }}
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(header.column.columnDef.header as any, header.getContext())}
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
                  <td colSpan={currentColumns.length} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    <IconRefresh className="h-6 w-6 animate-spin mx-auto mb-2" />
                    Loading logs...
                  </td>
                </tr>
              ) : currentTable.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={currentColumns.length} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    No logs found
                  </td>
                </tr>
              ) : (
                currentTable.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-200 dark:border-portal-border hover:bg-gray-50 dark:hover:bg-portal-hover/50">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3">
                        {flexRender(cell.column.columnDef.cell as any, cell.getContext())}
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
            Showing {((pagination.page - 1) * pagination.pageSize) + 1} to{' '}
            {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{' '}
            {pagination.total} results
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchLogs(1)}
              disabled={pagination.page === 1 || loading}
              className="p-2 rounded text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-portal-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <IconChevronsLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => fetchLogs(pagination.page - 1)}
              disabled={pagination.page === 1 || loading}
              className="p-2 rounded text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-portal-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <IconChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-3 py-1 text-sm text-gray-700 dark:text-gray-300">
              Page {pagination.page} of {pagination.totalPages || 1}
            </span>
            <button
              onClick={() => fetchLogs(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages || loading}
              className="p-2 rounded text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-portal-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <IconChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => fetchLogs(pagination.totalPages)}
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
