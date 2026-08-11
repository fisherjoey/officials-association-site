'use client'

import { useState, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getExpandedRowModel,
  flexRender,
  ColumnDef,
  SortingState,
  ExpandedState,
  Row,
} from '@tanstack/react-table'
import { IconChevronDown, IconChevronRight, IconArrowUp, IconArrowDown, IconSearch } from '@tabler/icons-react'

interface DataTableProps<TData> {
  data: TData[]
  columns: ColumnDef<TData, any>[]
  searchable?: boolean
  searchPlaceholder?: string
  getSubRows?: (row: TData) => TData[] | undefined
  initialExpanded?: boolean
  className?: string
  maxHeight?: string
  stickyHeader?: boolean
  onRowClick?: (row: TData) => void
}

export function DataTable<TData>({
  data,
  columns,
  searchable = false,
  searchPlaceholder = 'Search...',
  getSubRows,
  initialExpanded = false,
  className = '',
  maxHeight,
  stickyHeader = false,
  onRowClick,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [expanded, setExpanded] = useState<ExpandedState>(initialExpanded ? true : {})

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
      expanded,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSubRows,
  })

  return (
    <div className={className}>
      {searchable && (
        <div className="relative mb-4 max-w-xs">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      <div
        className={`overflow-x-auto ${maxHeight ? 'overflow-y-auto' : ''}`}
        style={maxHeight ? { maxHeight } : undefined}
      >
        <table className="w-full text-sm">
          <thead className={`bg-gray-50 dark:bg-gray-700 ${stickyHeader ? 'sticky top-0 z-10' : ''}`}>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as { align?: 'left' | 'right' | 'center' } | undefined
                  const alignment = meta?.align || 'left'

                  return (
                    <th
                      key={header.id}
                      className={`px-4 py-3 font-medium text-gray-600 dark:text-gray-300 ${
                        alignment === 'right' ? 'text-right' : alignment === 'center' ? 'text-center' : 'text-left'
                      } ${header.column.getCanSort() ? 'cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-600' : ''}`}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className={`flex items-center gap-1 ${alignment === 'right' ? 'justify-end' : ''}`}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && (
                          <span className="text-gray-400 dark:text-gray-500">
                            {{
                              asc: <IconArrowUp className="h-3 w-3" />,
                              desc: <IconArrowDown className="h-3 w-3" />,
                            }[header.column.getIsSorted() as string] ?? (
                              <span className="h-3 w-3 opacity-0 group-hover:opacity-50">↕</span>
                            )}
                          </span>
                        )}
                      </div>
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody className="dark:text-gray-200">
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} row={row} onRowClick={onRowClick} />
            ))}
          </tbody>
        </table>
      </div>

      {table.getRowModel().rows.length === 0 && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          No results found
        </div>
      )}
    </div>
  )
}

function TableRow<TData>({ row, onRowClick }: { row: Row<TData>; onRowClick?: (row: TData) => void }) {
  const isSubRow = row.depth > 0
  const canExpand = row.getCanExpand()
  const isExpanded = row.getIsExpanded()
  const isClickable = canExpand || onRowClick

  const handleClick = () => {
    if (canExpand) {
      row.toggleExpanded()
    } else if (onRowClick) {
      onRowClick(row.original)
    }
  }

  return (
    <tr
      className={`border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 ${isSubRow ? 'bg-gray-50 dark:bg-gray-800' : ''} ${isClickable ? 'cursor-pointer' : ''}`}
      onClick={isClickable ? handleClick : undefined}
    >
      {row.getVisibleCells().map((cell, cellIndex) => {
        const meta = cell.column.columnDef.meta as { align?: 'left' | 'right' | 'center' } | undefined
        const alignment = meta?.align || 'left'

        return (
          <td
            key={cell.id}
            className={`px-4 py-3 ${
              alignment === 'right' ? 'text-right' : alignment === 'center' ? 'text-center' : 'text-left'
            } ${isSubRow ? 'text-gray-600 dark:text-gray-400 text-sm' : ''}`}
            style={isSubRow && cellIndex === 0 ? { paddingLeft: `${row.depth * 1.5 + 1}rem` } : undefined}
          >
            {/* Show expand icon for first cell if row can expand */}
            {cellIndex === 0 && (
              <span className="inline-flex items-center gap-2">
                {canExpand && (
                  <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                    {isExpanded ? (
                      <IconChevronDown className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                    ) : (
                      <IconChevronRight className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                    )}
                  </span>
                )}
                {!canExpand && row.depth === 0 && <span className="w-4" />}
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </span>
            )}
            {cellIndex !== 0 && flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        )
      })}
    </tr>
  )
}

// Helper to create column definitions with proper typing
export function createColumnHelper<TData>() {
  return {
    accessor: <TValue,>(
      accessorKey: keyof TData & string,
      options?: Partial<ColumnDef<TData, TValue>>
    ): ColumnDef<TData, TValue> => ({
      accessorKey,
      header: options?.header || String(accessorKey),
      ...options,
    }),
    display: (options: Partial<ColumnDef<TData, unknown>>): ColumnDef<TData, unknown> => ({
      id: options.id || 'display',
      ...options,
    }),
  }
}
