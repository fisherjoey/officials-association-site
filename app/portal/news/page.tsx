import { getAllContent, sortByDate } from '@/lib/content'
import type { Announcement } from '@/lib/adapters/types'
import NewsClient from './NewsClient'
import { DEFAULT_AUTHOR } from '@/lib/siteConfig'

export default function NewsAnnouncementsPage() {
  // Load announcements from CMS files
  const announcements = sortByDate(getAllContent('portal/announcements'))
    .map(item => ({
      id: item.slug,
      title: item.title,
      content: item.body || item.content || '',
      category: (item.category || 'general') as Announcement['category'],
      priority: (item.urgent ? 'high' : 'normal') as Announcement['priority'],
      date: item.date,
      author: item.author || DEFAULT_AUTHOR,
      audience: item.audience || ['all'],
      expires: item.expires
    }))
    .filter(item => {
      // Filter out expired announcements
      if (item.expires && new Date(item.expires) < new Date()) {
        return false
      }
      return true
    })

  return <NewsClient initialAnnouncements={announcements} />
}