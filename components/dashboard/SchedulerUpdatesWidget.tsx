'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { IconClipboardList, IconChevronRight, IconChevronDown } from '@tabler/icons-react'
import { schedulerUpdatesAPI } from '@/lib/api'
import { HTMLViewer } from '@/components/HTMLViewer'

interface SchedulerUpdate {
  id: string
  title: string
  content: string
  author: string
  date: string
}

const MAX_UPDATES = 10

export default function SchedulerUpdatesWidget() {
  const [updates, setUpdates] = useState<SchedulerUpdate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    loadUpdates()
  }, [])

  const loadUpdates = async () => {
    try {
      const data = await schedulerUpdatesAPI.getAll()
      if (Array.isArray(data) && data.length > 0) {
        const sorted = [...data].sort(
          (a: SchedulerUpdate, b: SchedulerUpdate) =>
            new Date(b.date).getTime() - new Date(a.date).getTime()
        )
        const sliced = sorted.slice(0, MAX_UPDATES)
        setUpdates(sliced)
        // Auto-expand the most recent update so the latest content is visible.
        setExpandedId(sliced[0].id)
      }
    } catch (error) {
      console.error('Failed to load scheduler updates:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const Header = (
    <div className="flex items-center justify-between mb-2">
      <h2 className="font-heading text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
        <IconClipboardList className="h-4 w-4 text-orange-500" />
        Scheduler Updates
      </h2>
      <Link
        href="/portal/scheduler-updates"
        className="text-xs text-orange-600 dark:text-portal-accent hover:text-orange-700 font-medium flex items-center gap-0.5"
      >
        All
        <IconChevronRight className="h-3 w-3" />
      </Link>
    </div>
  )

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-portal-surface rounded-lg border border-gray-200 dark:border-portal-border p-3 sm:p-4">
        {Header}
        <div className="animate-pulse space-y-2">
          <div className="h-8 bg-gray-200 dark:bg-portal-hover rounded"></div>
          <div className="h-8 bg-gray-200 dark:bg-portal-hover rounded"></div>
          <div className="h-8 bg-gray-200 dark:bg-portal-hover rounded"></div>
        </div>
      </div>
    )
  }

  if (updates.length === 0) {
    return (
      <div className="bg-white dark:bg-portal-surface rounded-lg border border-gray-200 dark:border-portal-border p-3 sm:p-4">
        {Header}
        <div className="text-center py-6 text-gray-500 dark:text-gray-400">
          <p className="text-xs">No scheduler updates yet</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-portal-surface rounded-lg border border-gray-200 dark:border-portal-border p-3 sm:p-4">
      {Header}

      <div className="divide-y divide-gray-100 dark:divide-portal-border -mx-3 sm:-mx-4">
        {updates.map((update) => {
          const isExpanded = expandedId === update.id
          return (
            <div key={update.id}>
              <button
                onClick={() => setExpandedId(isExpanded ? null : update.id)}
                className="w-full text-left flex items-start gap-2 px-3 sm:px-4 py-2 hover:bg-gray-50 dark:hover:bg-portal-hover/50 transition-colors"
                aria-expanded={isExpanded}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                      {new Date(update.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                      &middot; {update.author}
                    </span>
                  </div>
                  <h3
                    className={`font-medium text-sm text-gray-900 dark:text-white ${
                      isExpanded ? '' : 'truncate'
                    }`}
                  >
                    {update.title}
                  </h3>
                </div>
                <IconChevronDown
                  className={`h-4 w-4 text-gray-400 flex-shrink-0 mt-1 transition-transform duration-200 ${
                    isExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {isExpanded && (
                <div className="px-3 sm:px-4 pb-3 pt-0">
                  <div className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-portal-hover/30 rounded-md p-2.5">
                    <HTMLViewer content={update.content} className="rich-text-content-compact" />
                    <div className="mt-2 pt-2 border-t border-gray-200 dark:border-portal-border text-[10px] text-gray-400 dark:text-gray-500">
                      Posted by {update.author}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
