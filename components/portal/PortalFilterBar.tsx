'use client'

import { type ComponentType, type ReactNode } from 'react'
import { IconSortAscending, IconSortDescending, IconLayoutList, IconLayoutGrid } from '@tabler/icons-react'

export interface CategoryOption {
  value: string
  label: string
  icon?: ComponentType<{ className?: string }>
}

export interface SortOption {
  value: string
  label: string
}

export interface PortalFilterBarProps {
  // Search (always present)
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string

  // Categories (optional)
  categories?: CategoryOption[]
  selectedCategory?: string
  onCategoryChange?: (value: string) => void

  // Sort (optional)
  sortOptions?: SortOption[]
  sortValue?: string
  onSortChange?: (value: string) => void
  sortDirection?: 'asc' | 'desc'
  onSortDirectionChange?: (direction: 'asc' | 'desc') => void

  // View mode (optional)
  viewMode?: 'list' | 'grid'
  onViewModeChange?: (mode: 'list' | 'grid') => void

  // Extra controls slot (optional, rendered in bottom row)
  extraControls?: ReactNode
}

export default function PortalFilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  categories,
  selectedCategory,
  onCategoryChange,
  sortOptions,
  sortValue,
  onSortChange,
  sortDirection,
  onSortDirectionChange,
  viewMode,
  onViewModeChange,
  extraControls,
}: PortalFilterBarProps) {
  const hasSort = sortOptions && sortOptions.length > 0 && onSortChange
  const hasCategories = categories && categories.length > 0 && onCategoryChange
  const hasViewToggle = viewMode && onViewModeChange
  const hasBottomRow = hasViewToggle || extraControls

  return (
    <div className="mb-6 bg-white dark:bg-portal-surface rounded-xl border border-gray-200 dark:border-portal-border p-3 sm:p-4">
      {/* Row 1: Search + Sort */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <div className="flex-1 min-w-0">
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full px-3 py-2 text-sm sm:text-base border border-gray-300 dark:border-portal-border rounded-lg bg-slate-50 dark:bg-portal-bg focus:outline-none focus:bg-white dark:focus:bg-gray-800 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 text-gray-900 dark:text-white transition-all duration-200"
          />
        </div>
        {hasSort && (
          <div className="flex items-center gap-2 sm:w-auto">
            <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Sort by:</span>
            <select
              value={sortValue}
              onChange={(e) => onSortChange(e.target.value)}
              className="w-full sm:w-auto text-sm border border-gray-300 dark:border-portal-border bg-white dark:bg-portal-surface text-gray-900 dark:text-white rounded pl-3 pr-8 py-2 focus:outline-none focus:ring-1 focus:ring-orange-500"
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {onSortDirectionChange && (
              <button
                onClick={() => onSortDirectionChange(sortDirection === 'asc' ? 'desc' : 'asc')}
                className="p-1.5 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-portal-hover rounded"
                title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
              >
                {sortDirection === 'asc' ? (
                  <IconSortAscending className="h-4 w-4" />
                ) : (
                  <IconSortDescending className="h-4 w-4" />
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Row 2: Category pills */}
      {hasCategories && (
        <div className="mt-3 sm:mt-4 flex flex-wrap gap-1.5 sm:gap-2">
          {categories.map((cat) => {
            const isActive = selectedCategory === cat.value
            const Icon = cat.icon
            return (
              <button
                key={cat.value}
                onClick={() => onCategoryChange(cat.value)}
                className={`px-2 sm:px-3 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm flex items-center gap-1 sm:gap-2 transition-all duration-200 ${
                  isActive
                    ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/25'
                    : 'bg-slate-100 dark:bg-portal-hover text-gray-600 dark:text-gray-300 border border-transparent hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                {Icon && <Icon className="h-3 w-3 sm:h-4 sm:w-4" />}
                {cat.label}
              </button>
            )
          })}
        </div>
      )}

      {/* Row 3: Extra controls + View toggle */}
      {hasBottomRow && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-portal-border flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {extraControls}
          </div>

          {hasViewToggle && (
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-portal-hover rounded-lg p-0.5">
              <button
                onClick={() => onViewModeChange('list')}
                className={`p-1.5 rounded-md ${viewMode === 'list' ? 'bg-white dark:bg-portal-surface shadow text-orange-600' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                title="List view"
              >
                <IconLayoutList className="h-4 w-4" />
              </button>
              <button
                onClick={() => onViewModeChange('grid')}
                className={`p-1.5 rounded-md ${viewMode === 'grid' ? 'bg-white dark:bg-portal-surface shadow text-orange-600' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                title="Grid view"
              >
                <IconLayoutGrid className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
