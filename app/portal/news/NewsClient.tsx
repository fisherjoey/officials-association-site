'use client'

import { useState, useEffect, useMemo } from 'react'
import { IconPlus, IconEdit, IconTrash, IconDeviceFloppy, IconX, IconAlertCircle, IconChevronDown } from '@tabler/icons-react'
import PortalFilterBar from '@/components/portal/PortalFilterBar'
import { JoditEditor } from '@/components/JoditEditor'
import { HTMLViewer } from '@/components/HTMLViewer'
import { useRole } from '@/contexts/RoleContext'
import { announcementsAPI } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import {
  validateAnnouncementForm,
  getFieldError,
  hasErrors,
  formatValidationErrors
} from '@/lib/portalValidation'
import { parseAPIError, sanitize, ValidationError } from '@/lib/errorHandling'
import { ORG_SHORT_NAME, DEFAULT_AUTHOR } from '@/lib/siteConfig'

// All available categories with display names
const ALL_CATEGORIES = {
  // General categories
  general: 'General',
  rules: 'Rules',
  schedule: 'Schedule',
  training: 'Training',
  administrative: 'Administrative',
  // Executive role categories
  president: 'President',
  'vice-president': 'Vice President',
  'past-president': 'Past President',
  treasurer: 'Treasurer',
  secretary: 'Secretary',
  'performance-assessment': 'Performance & Assessment',
  'member-services': 'Member Services',
  'referee-development': 'Referee Development',
  assignor: 'Assignor',
  scheduler: 'Scheduler',
  webmaster: 'Webmaster',
  'officiating-coordinator': 'Officiating Coordinator',
  'recruiting-coordinator': 'Recruiting Coordinator'
} as const

type CategoryKey = keyof typeof ALL_CATEGORIES

/**
 * Author options for announcements: the organisation and its roles, never
 * named individuals.
 *
 * Two reasons to keep it that way. This module is a client component, so every
 * entry here is baked into the static export and readable by anyone who can
 * fetch the JS, signed in or not — a roster hardcoded here is a published
 * roster. And it would be a second copy of the `members` table that nothing
 * keeps in sync. If an announcement needs a person's name, put it in the body.
 */
const AUTHOR_OPTIONS = [
  // Organization
  { value: DEFAULT_AUTHOR, label: DEFAULT_AUTHOR, group: 'Organization' },
  { value: `${ORG_SHORT_NAME} Board`, label: `${ORG_SHORT_NAME} Board`, group: 'Organization' },
  // Role only
  { value: 'President', label: 'President', group: 'Role Only' },
  { value: 'Vice President', label: 'Vice President', group: 'Role Only' },
  { value: 'Past President', label: 'Past President', group: 'Role Only' },
  { value: 'Treasurer', label: 'Treasurer', group: 'Role Only' },
  { value: 'Secretary', label: 'Secretary', group: 'Role Only' },
  { value: 'Performance & Assessment', label: 'Performance & Assessment', group: 'Role Only' },
  { value: 'Member Services', label: 'Member Services', group: 'Role Only' },
  { value: 'Referee Development', label: 'Referee Development', group: 'Role Only' },
  { value: 'Assignor', label: 'Assignor', group: 'Role Only' },
  { value: 'Scheduler', label: 'Scheduler', group: 'Role Only' },
  { value: 'Webmaster', label: 'Webmaster', group: 'Role Only' },
  { value: 'Officiating Coordinator', label: 'Officiating Coordinator', group: 'Role Only' },
  { value: 'Recruiting Coordinator', label: 'Recruiting Coordinator', group: 'Role Only' },
]

interface Announcement {
  id: string
  title: string
  content: string
  category: string
  priority: 'high' | 'normal' | 'low'
  date: string
  author: string
  audience?: string[]
  expires?: string
}

interface NewsClientProps {
  initialAnnouncements: Announcement[]
}

// Accordion row for a single announcement
function AnnouncementRow({ announcement, canEdit, getCategoryColor, onEdit, onDelete }: {
  announcement: { id: string; title: string; content: string; category: string; priority: string; date: string; author: string }
  canEdit: boolean
  getCategoryColor: (cat: string) => string
  onEdit: () => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full text-left flex items-start gap-2 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-portal-hover/50 transition-colors ${
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
          <h3 className={`font-medium text-sm text-gray-900 dark:text-white ${expanded ? '' : 'line-clamp-2'}`}>
            {announcement.title}
          </h3>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0 mt-1">
          {canEdit && (
            <>
              <span onClick={(e) => { e.stopPropagation(); onEdit() }} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded hidden sm:block">
                <IconEdit className="h-3.5 w-3.5" />
              </span>
              <span onClick={(e) => { e.stopPropagation(); onDelete() }} className="p-1.5 text-gray-400 hover:text-red-500 rounded hidden sm:block">
                <IconTrash className="h-3.5 w-3.5" />
              </span>
            </>
          )}
          <IconChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3">
          <div className="bg-gray-50 dark:bg-portal-hover/30 rounded-md p-2.5">
            <HTMLViewer content={announcement.content} className="rich-text-content-compact" />
            <div className="mt-2 pt-2 border-t border-gray-200 dark:border-portal-border flex items-center justify-between">
              <span className="text-[10px] text-gray-400 dark:text-gray-500">Posted by {announcement.author}</span>
              {canEdit && (
                <div className="flex gap-2 sm:hidden">
                  <button onClick={onEdit} className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Edit</button>
                  <button onClick={onDelete} className="text-xs text-red-500 hover:text-red-700">Delete</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function NewsClient({ initialAnnouncements }: NewsClientProps) {
  const { hasRole } = useRole()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | CategoryKey>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingData, setEditingData] = useState<Partial<Announcement>>({}) // Buffer for editing
  const [newAnnouncement, setNewAnnouncement] = useState<Partial<Announcement>>({
    title: '',
    content: '',
    category: 'general',
    priority: 'normal',
    author: DEFAULT_AUTHOR,
    date: new Date().toISOString()
  })
  const [sendAsEmail, setSendAsEmail] = useState(false)
  const [emailRecipients, setEmailRecipients] = useState<string[]>(['all-members'])
  const { success, error, warning, info } = useToast()
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])

  const canEdit = hasRole('executive')

  // Load announcements from API
  useEffect(() => {
    loadAnnouncements()
  }, [])

  const loadAnnouncements = async () => {
    try {
      const data = await announcementsAPI.getAll()
      setAnnouncements(data)
    } catch (err) {
      const errorMessage = parseAPIError(err)
      console.error(`Failed to load announcements: ${errorMessage}`)
    } finally {
      setIsLoading(false)
    }
  }

  // Compute which categories have posts (for dynamic filter buttons)
  const categoriesWithPosts = useMemo(() => {
    const categories = new Set<string>()
    announcements.forEach(a => {
      if (a.category) categories.add(a.category)
    })
    return categories
  }, [announcements])

  const filteredAnnouncements = announcements.filter(item => {
    const matchesFilter = filter === 'all' || item.category === filter
    const matchesSearch = searchTerm === '' || 
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.content.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesFilter && matchesSearch
  })

  const handleCreate = async () => {
    // Validate form
    const errors = validateAnnouncementForm(newAnnouncement)
    if (hasErrors(errors)) {
      setValidationErrors(errors)
      error('Please fix the validation errors before submitting')
      return
    }

    try {
      // Prepare data - React handles XSS for text content, so no need to HTML-encode titles
      const sanitizedData = {
        title: (newAnnouncement.title || '').trim(),
        content: sanitize.html(newAnnouncement.content || ''), // HTML from the rich-text editor
        category: newAnnouncement.category || 'general',
        priority: newAnnouncement.priority || 'normal',
        author: (newAnnouncement.author || DEFAULT_AUTHOR).trim(),
        date: new Date().toISOString()
      }

      const created = await announcementsAPI.create(sanitizedData)
      setAnnouncements([created, ...announcements])

      // Send as email if checkbox is selected
      if (sendAsEmail) {
        try {
          await sendAnnouncementAsEmail(sanitizedData.title, sanitizedData.content)
          success('Announcement created and email sent successfully')
        } catch (emailError) {
          warning('Announcement created but email failed to send')
        }
      } else {
        success('Announcement created successfully')
      }

      setNewAnnouncement({
        title: '',
        content: '',
        category: 'general',
        priority: 'normal',
        author: DEFAULT_AUTHOR,
        date: new Date().toISOString()
      })
      setValidationErrors([])
      setIsCreating(false)
      setSendAsEmail(false)
      setEmailRecipients(['all-members'])
    } catch (err) {
      const errorMessage = parseAPIError(err)
      error(`Failed to create announcement: ${errorMessage}`)
    }
  }

  const sendAnnouncementAsEmail = async (subject: string, htmlContent: string) => {
    const API_BASE = process.env.NODE_ENV === 'production'
      ? '/.netlify/functions'
      : 'http://localhost:9000/.netlify/functions'

    const { generateEmailTemplate } = await import('@/lib/emailTemplate')
    const emailHtml = generateEmailTemplate({
      subject,
      content: htmlContent, // Already HTML
      previewText: subject
    })

    const response = await fetch(`${API_BASE}/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: emailRecipients,
        subject,
        html: emailHtml
      })
    })

    if (!response.ok) {
      throw new Error('Failed to send email')
    }
  }

  const startEditing = (announcement: Announcement) => {
    setEditingId(announcement.id)
    setEditingData({ ...announcement }) // Copy data to buffer
  }

  const handleEditChange = (field: keyof Announcement, value: any) => {
    setEditingData(prev => ({ ...prev, [field]: value }))
  }

  const saveEdit = async (id: string) => {
    try {
      // Prepare updates - React handles XSS for text content
      const sanitizedUpdates = {
        ...editingData,
        title: editingData.title ? editingData.title.trim() : undefined,
        content: editingData.content ? sanitize.html(editingData.content) : undefined, // HTML from the rich-text editor
        author: editingData.author ? editingData.author.trim() : undefined
      }

      const updated = await announcementsAPI.update({ id, ...sanitizedUpdates })
      setAnnouncements(prev => prev.map(a =>
        a.id === id ? updated : a
      ))
      setEditingId(null)
      setEditingData({})
      success('Announcement updated successfully')
    } catch (err) {
      const errorMessage = parseAPIError(err)
      error(`Failed to update announcement: ${errorMessage}`)
    }
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingData({})
  }

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this announcement?')) {
      try {
        await announcementsAPI.delete(id)
        setAnnouncements(prev => prev.filter(a => a.id !== id))
        success('Announcement deleted successfully')
      } catch (err) {
        const errorMessage = parseAPIError(err)
        error(`Failed to delete announcement: ${errorMessage}`)
      }
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      // General categories
      case 'general': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/80 dark:text-blue-300'
      case 'rules': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/80 dark:text-purple-300'
      case 'schedule': return 'bg-green-100 text-green-800 dark:bg-green-900/80 dark:text-green-300'
      case 'training': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/80 dark:text-orange-300'
      case 'administrative': return 'bg-red-100 text-red-800 dark:bg-red-900/80 dark:text-red-300'
      // Executive role categories
      case 'president': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/80 dark:text-amber-300'
      case 'vice-president': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/80 dark:text-amber-300'
      case 'past-president': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/80 dark:text-amber-300'
      case 'treasurer': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/80 dark:text-emerald-300'
      case 'secretary': return 'bg-sky-100 text-sky-800 dark:bg-sky-900/80 dark:text-sky-300'
      case 'performance-assessment': return 'bg-violet-100 text-violet-800 dark:bg-violet-900/80 dark:text-violet-300'
      case 'member-services': return 'bg-teal-100 text-teal-800 dark:bg-teal-900/80 dark:text-teal-300'
      case 'referee-development': return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/80 dark:text-indigo-300'
      case 'assignor': return 'bg-rose-100 text-rose-800 dark:bg-rose-900/80 dark:text-rose-300'
      case 'scheduler': return 'bg-pink-100 text-pink-800 dark:bg-pink-900/80 dark:text-pink-300'
      case 'webmaster': return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/80 dark:text-cyan-300'
      case 'officiating-coordinator': return 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/80 dark:text-fuchsia-300'
      case 'recruiting-coordinator': return 'bg-lime-100 text-lime-800 dark:bg-lime-900/80 dark:text-lime-300'
      default: return 'bg-gray-100 text-gray-800 dark:bg-portal-hover/80 dark:text-gray-300'
    }
  }

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high': return { text: 'High Priority', color: 'text-red-600', icon: '🔴' }
      case 'normal': return { text: 'Normal', color: 'text-yellow-600', icon: '🟡' }
      case 'low': return { text: 'Low', color: 'text-green-600', icon: '🟢' }
      default: return { text: '', color: '', icon: '' }
    }
  }

  return (
    <div className="px-3 py-4 sm:p-5 portal-animate">

      {/* Header */}
      <div className="mb-4 sm:mb-5 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <h1 className="text-xl sm:text-2xl font-bold font-heading tracking-tight text-gray-900 dark:text-white">News & Announcements</h1>
        {canEdit && !isCreating && (
          <button
            onClick={() => {
              setIsCreating(true)
              // Pre-select the category based on the current filter
              const category = filter === 'all' ? 'general' : filter
              setNewAnnouncement({
                title: '',
                content: '',
                category: category,
                priority: 'normal',
                author: DEFAULT_AUTHOR,
                date: new Date().toISOString()
              })
            }}
            className="bg-orange-500 text-white px-3 py-2 sm:px-4 rounded-lg shadow-sm shadow-orange-500/20 hover:bg-orange-600 flex items-center gap-2 text-sm sm:text-base"
          >
            <IconPlus className="h-5 w-5" />
            New Announcement
          </button>
        )}
      </div>

      {/* Create New Announcement Form */}
      {isCreating && (
        <div className="mb-4 bg-white dark:bg-portal-surface rounded-lg border border-gray-200 dark:border-portal-border p-4">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Create New Announcement</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
              <input
                type="text"
                value={newAnnouncement.title}
                onChange={(e) => setNewAnnouncement({ ...newAnnouncement, title: e.target.value })}
                className={`w-full px-3 py-2 border bg-white dark:bg-portal-hover text-gray-900 dark:text-white border-gray-200 dark:border-portal-border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                  getFieldError(validationErrors, 'title') ? 'border-red-500' : ''
                }`}
                placeholder="Enter announcement title..."
              />
              {getFieldError(validationErrors, 'title') && (
                <p className="mt-1 text-sm text-red-600">{getFieldError(validationErrors, 'title')}</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
                <select
                  value={newAnnouncement.category}
                  onChange={(e) => setNewAnnouncement({ ...newAnnouncement, category: e.target.value as any })}
                  className="w-full pl-3 pr-8 py-2 border bg-white dark:bg-portal-hover text-gray-900 dark:text-white border-gray-200 dark:border-portal-border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <optgroup label="General">
                    <option value="general">General</option>
                    <option value="rules">Rules</option>
                    <option value="schedule">Schedule</option>
                    <option value="training">Training</option>
                    <option value="administrative">Administrative</option>
                  </optgroup>
                  <optgroup label="Executive">
                    <option value="president">President</option>
                    <option value="vice-president">Vice President</option>
                    <option value="past-president">Past President</option>
                    <option value="treasurer">Treasurer</option>
                    <option value="secretary">Secretary</option>
                    <option value="performance-assessment">Performance &amp; Assessment</option>
                    <option value="member-services">Member Services</option>
                    <option value="referee-development">Referee Development</option>
                    <option value="assignor">Assignor</option>
                    <option value="scheduler">Scheduler</option>
                    <option value="webmaster">Webmaster</option>
                    <option value="officiating-coordinator">Officiating Coordinator</option>
                    <option value="recruiting-coordinator">Recruiting Coordinator</option>
                  </optgroup>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label>
                <select
                  value={newAnnouncement.priority}
                  onChange={(e) => setNewAnnouncement({ ...newAnnouncement, priority: e.target.value as any })}
                  className="w-full pl-3 pr-8 py-2 border bg-white dark:bg-portal-hover text-gray-900 dark:text-white border-gray-200 dark:border-portal-border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="high">High</option>
                  <option value="normal">Normal</option>
                  <option value="low">Low</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Author</label>
                <select
                  value={newAnnouncement.author}
                  onChange={(e) => setNewAnnouncement({ ...newAnnouncement, author: e.target.value })}
                  className="w-full pl-3 pr-8 py-2 border bg-white dark:bg-portal-hover text-gray-900 dark:text-white border-gray-200 dark:border-portal-border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <optgroup label="Organization">
                    {AUTHOR_OPTIONS.filter(o => o.group === 'Organization').map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Role Only">
                    {AUTHOR_OPTIONS.filter(o => o.group === 'Role Only').map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Content</label>
              <div className={getFieldError(validationErrors, 'content') ? 'border-2 border-red-500 rounded-lg' : ''}>
                <JoditEditor
                  value={newAnnouncement.content || ''}
                  onChange={(val) => setNewAnnouncement({ ...newAnnouncement, content: val })}
                  height={400}
                  placeholder="Enter announcement content..."
                />
              </div>
              {getFieldError(validationErrors, 'content') && (
                <p className="mt-1 text-sm text-red-600">{getFieldError(validationErrors, 'content')}</p>
              )}
            </div>

            {/* Send as Email Checkbox */}
            <div className="border-t border-gray-200 dark:border-portal-border pt-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendAsEmail}
                  onChange={(e) => setSendAsEmail(e.target.checked)}
                  className="h-5 w-5 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                />
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">Also send as email</div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">Send this announcement to all members via email</div>
                </div>
              </label>

              {sendAsEmail && (
                <div className="mt-3 ml-8 p-3 bg-gray-50 dark:bg-portal-surface/50 rounded-lg">
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">Recipients: <span className="font-medium">All Members</span></p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">The announcement will be formatted in an email template and sent to all registered members.</p>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2"
              >
                <IconDeviceFloppy className="h-5 w-5" />
                Save Announcement
              </button>
              <button
                onClick={() => {
                  setIsCreating(false)
                  setNewAnnouncement({
                    title: '',
                    content: '',
                    category: 'announcement',
                    priority: 'normal',
                    author: DEFAULT_AUTHOR
                  })
                }}
                className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-lg hover:bg-gray-400 flex items-center gap-2"
              >
                <IconX className="h-5 w-5" />
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <PortalFilterBar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search announcements..."
        categories={[
          { value: 'all', label: 'All' },
          ...(Object.keys(ALL_CATEGORIES) as CategoryKey[])
            .filter(cat => categoriesWithPosts.has(cat))
            .map(cat => ({ value: cat, label: ALL_CATEGORIES[cat] }))
        ]}
        selectedCategory={filter}
        onCategoryChange={(val) => setFilter(val as 'all' | CategoryKey)}
      />

      {/* Important Announcements Banner */}
      {filteredAnnouncements.some(a => a.priority === 'high') && (
        <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4">
          <div className="flex">
            <IconAlertCircle className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Important Updates</h3>
              <p className="mt-1 text-sm text-red-700">
                There are high-priority announcements that require your attention.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Announcements List — accordion rows */}
      {filteredAnnouncements.length === 0 ? (
        <div className="text-center py-8 bg-white dark:bg-portal-surface rounded-md border border-gray-200 dark:border-portal-border">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {canEdit ? 'No announcements yet. Click "New" to create one.' : 'Announcements will appear here.'}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-portal-surface rounded-md border border-gray-200 dark:border-portal-border divide-y divide-gray-100 dark:divide-portal-border">
          {filteredAnnouncements.map(announcement => (
            editingId === announcement.id ? (
              <div key={announcement.id} className="p-3 sm:p-4">
                <div className="space-y-3">
                  <input
                    type="text"
                    value={editingData.title || ''}
                    onChange={(e) => handleEditChange('title', e.target.value)}
                    className="w-full font-medium px-3 py-1.5 text-sm border bg-white dark:bg-portal-hover text-gray-900 dark:text-white border-gray-200 dark:border-portal-border rounded-md focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <select value={editingData.category || 'general'} onChange={(e) => handleEditChange('category', e.target.value)}
                      className="pl-2 pr-6 py-1.5 text-xs border bg-white dark:bg-portal-hover text-gray-900 dark:text-white border-gray-200 dark:border-portal-border rounded-md focus:outline-none focus:ring-1 focus:ring-orange-500">
                      <optgroup label="General">
                        <option value="general">General</option><option value="rules">Rules</option><option value="schedule">Schedule</option>
                        <option value="training">Training</option><option value="administrative">Administrative</option>
                      </optgroup>
                      <optgroup label="Executive">
                        <option value="president">President</option><option value="vice-president">Vice President</option>
                        <option value="treasurer">Treasurer</option><option value="secretary">Secretary</option>
                        <option value="scheduler">Scheduler</option><option value="webmaster">Webmaster</option>
                      </optgroup>
                    </select>
                    <select value={editingData.priority || 'normal'} onChange={(e) => handleEditChange('priority', e.target.value)}
                      className="pl-2 pr-6 py-1.5 text-xs border bg-white dark:bg-portal-hover text-gray-900 dark:text-white border-gray-200 dark:border-portal-border rounded-md focus:outline-none focus:ring-1 focus:ring-orange-500">
                      <option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option>
                    </select>
                    <select value={editingData.author || DEFAULT_AUTHOR} onChange={(e) => handleEditChange('author', e.target.value)}
                      className="pl-2 pr-6 py-1.5 text-xs border bg-white dark:bg-portal-hover text-gray-900 dark:text-white border-gray-200 dark:border-portal-border rounded-md focus:outline-none focus:ring-1 focus:ring-orange-500 col-span-2 sm:col-span-1">
                      {AUTHOR_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                  <JoditEditor value={editingData.content || ''} onChange={(val) => handleEditChange('content', val)} height={300} />
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(announcement.id)} className="bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700 flex items-center gap-1.5 text-sm">
                      <IconDeviceFloppy className="h-4 w-4" /> Save
                    </button>
                    <button onClick={cancelEdit} className="text-gray-600 dark:text-gray-400 px-3 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-portal-hover text-sm">Cancel</button>
                  </div>
                </div>
              </div>
            ) : (
              <AnnouncementRow
                key={announcement.id}
                announcement={announcement}
                canEdit={canEdit}
                getCategoryColor={getCategoryColor}
                onEdit={() => startEditing(announcement)}
                onDelete={() => handleDelete(announcement.id)}
              />
            )
          ))}
        </div>
      )}
    </div>
  )
}