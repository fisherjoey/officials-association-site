'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { IconBell, IconChevronRight, IconAlertCircle, IconChevronDown } from '@tabler/icons-react'
import { announcementsAPI } from '@/lib/api'
import { HTMLViewer } from '@/components/HTMLViewer'

interface Announcement {
  id: string
  title: string
  content: string
  category: string
  priority: 'high' | 'normal' | 'low'
  date: string
  author: string
}

const MAX_ANNOUNCEMENTS = 10

export default function LatestAnnouncementWidget() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>('__pending__')

  useEffect(() => {
    loadAnnouncements()
  }, [])

  const loadAnnouncements = async () => {
    try {
      const data = await announcementsAPI.getAll()
      if (data.length > 0) {
        const sorted = data.sort((a: Announcement, b: Announcement) =>
          new Date(b.date).getTime() - new Date(a.date).getTime()
        )
        const sliced = sorted.slice(0, MAX_ANNOUNCEMENTS)
        setAnnouncements(sliced)
        if (sliced.length > 0) setExpandedId(sliced[0].id)
      }
    } catch (error) {
      console.error('Failed to load announcements:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'general': return 'bg-blue-50 dark:bg-blue-500/[0.06] text-blue-700/80 dark:text-blue-300/60'
      case 'rules': return 'bg-purple-50 dark:bg-purple-500/[0.06] text-purple-700/80 dark:text-purple-300/60'
      case 'schedule': return 'bg-green-50 dark:bg-green-500/[0.06] text-green-700/80 dark:text-green-300/60'
      case 'training': return 'bg-orange-50 dark:bg-orange-500/[0.06] text-orange-700/80 dark:text-orange-300/60'
      case 'administrative': return 'bg-red-50 dark:bg-red-500/[0.06] text-red-700/80 dark:text-red-300/60'
      default: return 'bg-zinc-100 dark:bg-zinc-500/[0.06] text-zinc-600 dark:text-zinc-400'
    }
  }

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-portal-surface rounded-lg border border-gray-200 dark:border-portal-border p-3 sm:p-4">
        <h2 className="font-heading text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <IconBell className="h-4 w-4 text-orange-500" />
          Announcements
        </h2>
        <div className="animate-pulse space-y-2">
          <div className="h-8 bg-gray-200 dark:bg-portal-hover rounded"></div>
          <div className="h-8 bg-gray-200 dark:bg-portal-hover rounded"></div>
          <div className="h-8 bg-gray-200 dark:bg-portal-hover rounded"></div>
        </div>
      </div>
    )
  }

  if (announcements.length === 0) {
    return (
      <div className="bg-white dark:bg-portal-surface rounded-lg border border-gray-200 dark:border-portal-border p-3 sm:p-4">
        <h2 className="font-heading text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <IconBell className="h-4 w-4 text-orange-500" />
          Announcements
        </h2>
        <div className="text-center py-6 text-gray-500 dark:text-gray-400">
          <p className="text-xs">No announcements yet</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-portal-surface rounded-lg border border-gray-200 dark:border-portal-border p-3 sm:p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-heading text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <IconBell className="h-4 w-4 text-orange-500" />
          Announcements
        </h2>
        <Link
          href="/portal/news"
          className="text-xs text-orange-600 dark:text-portal-accent hover:text-orange-700 font-medium flex items-center gap-0.5"
        >
          All
          <IconChevronRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="divide-y divide-gray-100 dark:divide-portal-border -mx-3 sm:-mx-4">
        {announcements.map((announcement) => {
          const isExpanded = expandedId === announcement.id
          return (
            <div key={announcement.id}>
              <button
                onClick={() => setExpandedId(isExpanded ? null : announcement.id)}
                className={`w-full text-left flex items-start gap-2 px-3 sm:px-4 py-2 hover:bg-gray-50 dark:hover:bg-portal-hover/50 transition-colors ${
                  announcement.priority === 'high' ? 'border-l-2 border-l-red-500' : ''
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold leading-none ${getCategoryColor(announcement.category)}`}>
                      {announcement.category}
                    </span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                      {new Date(announcement.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    {announcement.priority === 'high' && (
                      <IconAlertCircle className="h-3 w-3 text-red-500" />
                    )}
                  </div>
                  <h3 className={`font-medium text-sm text-gray-900 dark:text-white ${isExpanded ? '' : 'truncate'}`}>
                    {announcement.title}
                  </h3>
                </div>
                <IconChevronDown className={`h-4 w-4 text-gray-400 flex-shrink-0 mt-1 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-3 sm:px-4 pb-3 pt-0">
                  <div className="pl-0 text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-portal-hover/30 rounded-md p-2.5">
                    <HTMLViewer content={announcement.content} className="rich-text-content-compact" />
                    <div className="mt-2 pt-2 border-t border-gray-200 dark:border-portal-border text-[10px] text-gray-400 dark:text-gray-500">
                      Posted by {announcement.author}
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
