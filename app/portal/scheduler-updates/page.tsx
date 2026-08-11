'use client'

import { useState, useEffect } from 'react'
import { IconPlus, IconEdit, IconTrash, IconDeviceFloppy, IconX, IconChevronDown, IconAlertCircle } from '@tabler/icons-react'
import { JoditEditor } from '@/components/JoditEditor'
import { HTMLViewer } from '@/components/HTMLViewer'
import { useRole } from '@/contexts/RoleContext'
import { schedulerUpdatesAPI } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { parseAPIError, sanitize } from '@/lib/errorHandling'

/**
 * Who a schedule update can be attributed to. Roles, not named individuals:
 * this is a client component, so the list ships in the static export and is
 * readable by anyone who can fetch the JS. One array, shared by the create and
 * the edit form, so the two cannot drift.
 */
const AUTHOR_OPTIONS = ['Scheduler', 'Assignor'] as const

interface SchedulerUpdate {
  id: string
  title: string
  content: string
  author: string
  date: string
}

function SchedulerUpdateRow({ item, canEdit, onEdit, onDelete }: {
  item: { id: string; title: string; content: string; author: string; date: string }
  canEdit: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div>
      <button onClick={() => setExpanded(!expanded)}
        className="w-full text-left flex items-start gap-2 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-portal-hover/50 transition-colors">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          </div>
          <h3 className={`font-medium text-sm text-gray-900 dark:text-white ${expanded ? '' : 'line-clamp-2'}`}>
            {item.title}
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
            <HTMLViewer content={item.content} className="rich-text-content-compact" />
            <div className="mt-2 pt-2 border-t border-gray-200 dark:border-portal-border flex items-center justify-between">
              <span className="text-[10px] text-gray-400 dark:text-gray-500">Posted by {item.author}</span>
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

export default function SchedulerUpdatesPage() {
  const { user } = useRole()
  const [updates, setUpdates] = useState<SchedulerUpdate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingData, setEditingData] = useState<Partial<SchedulerUpdate>>({})
  const [newUpdate, setNewUpdate] = useState<Partial<SchedulerUpdate>>({
    title: '',
    content: '',
    author: 'Scheduler',
  })
  const { success, error: showError } = useToast()

  const canEdit = user.role === 'admin' || user.role === 'executive'

  useEffect(() => {
    loadUpdates()
  }, [])

  const loadUpdates = async () => {
    try {
      const data = await schedulerUpdatesAPI.getAll()
      setUpdates(data)
    } catch (err) {
      console.error(`Failed to load scheduler updates: ${parseAPIError(err)}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!newUpdate.title?.trim() || !newUpdate.content?.trim()) {
      showError('Title and content are required')
      return
    }

    try {
      const sanitizedData = {
        title: newUpdate.title.trim(),
        content: sanitize.html(newUpdate.content),
        author: (newUpdate.author || 'Scheduler').trim(),
        date: new Date().toISOString()
      }

      const created = await schedulerUpdatesAPI.create(sanitizedData)
      setUpdates([created, ...updates])
      success('Scheduler update created')
      setNewUpdate({ title: '', content: '', author: 'Scheduler' })
      setIsCreating(false)
    } catch (err) {
      showError(`Failed to create update: ${parseAPIError(err)}`)
    }
  }

  const startEditing = (item: SchedulerUpdate) => {
    setEditingId(item.id)
    setEditingData({ ...item })
  }

  const saveEdit = async (id: string) => {
    try {
      const sanitizedUpdates = {
        ...editingData,
        title: editingData.title?.trim(),
        content: editingData.content ? sanitize.html(editingData.content) : undefined,
        author: editingData.author?.trim()
      }

      const updated = await schedulerUpdatesAPI.update({ id, ...sanitizedUpdates })
      setUpdates(prev => prev.map(u => u.id === id ? updated : u))
      setEditingId(null)
      setEditingData({})
      success('Update saved')
    } catch (err) {
      showError(`Failed to save: ${parseAPIError(err)}`)
    }
  }

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this update?')) {
      try {
        await schedulerUpdatesAPI.delete(id)
        setUpdates(prev => prev.filter(u => u.id !== id))
        success('Update deleted')
      } catch (err) {
        showError(`Failed to delete: ${parseAPIError(err)}`)
      }
    }
  }

  return (
    <div className="px-3 py-4 sm:p-5 portal-animate">
      {/* Header */}
      <div className="mb-4 sm:mb-5 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <h1 className="text-xl sm:text-2xl font-bold font-heading tracking-tight text-gray-900 dark:text-white">Scheduler Updates</h1>
        {canEdit && !isCreating && (
          <button
            onClick={() => setIsCreating(true)}
            className="bg-orange-500 text-white px-3 py-2 sm:px-4 rounded-lg shadow-sm shadow-orange-500/20 hover:bg-orange-600 flex items-center gap-2 text-sm sm:text-base"
          >
            <IconPlus className="h-5 w-5" />
            New Update
          </button>
        )}
      </div>

      {/* Create Form — compact */}
      {isCreating && (
        <div className="mb-4 bg-white dark:bg-portal-surface rounded-md border border-gray-200 dark:border-portal-border p-3 sm:p-4">
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                <input type="text" value={newUpdate.title} onChange={(e) => setNewUpdate({ ...newUpdate, title: e.target.value })}
                  className="w-full px-3 py-1.5 text-sm border bg-white dark:bg-portal-hover text-gray-900 dark:text-white border-gray-200 dark:border-portal-border rounded-md focus:outline-none focus:ring-1 focus:ring-orange-500"
                  placeholder="e.g. New junior high games added" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Author</label>
                <select value={newUpdate.author} onChange={(e) => setNewUpdate({ ...newUpdate, author: e.target.value })}
                  className="w-full pl-3 pr-8 py-1.5 text-sm border bg-white dark:bg-portal-hover text-gray-900 dark:text-white border-gray-200 dark:border-portal-border rounded-md focus:outline-none focus:ring-1 focus:ring-orange-500">
                  {AUTHOR_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
            </div>
            <JoditEditor value={newUpdate.content || ''} onChange={(val) => setNewUpdate({ ...newUpdate, content: val })} height={250} placeholder="Describe the schedule change..." />
            <div className="flex gap-2">
              <button onClick={handleCreate} className="bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700 flex items-center gap-1.5 text-sm">
                <IconDeviceFloppy className="h-4 w-4" /> Save
              </button>
              <button onClick={() => { setIsCreating(false); setNewUpdate({ title: '', content: '', author: 'Scheduler' }) }}
                className="text-gray-600 dark:text-gray-400 px-3 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-portal-hover text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Updates — accordion rows */}
      {!isLoading && updates.length === 0 ? (
        <div className="text-center py-8 bg-white dark:bg-portal-surface rounded-md border border-gray-200 dark:border-portal-border">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {canEdit ? 'No updates yet. Click "New" to post one.' : 'Schedule updates will appear here.'}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-portal-surface rounded-md border border-gray-200 dark:border-portal-border divide-y divide-gray-100 dark:divide-portal-border">
          {updates.map(item => (
            editingId === item.id ? (
              <div key={item.id} className="p-3 sm:p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input type="text" value={editingData.title || ''} onChange={(e) => setEditingData({ ...editingData, title: e.target.value })}
                    className="w-full font-medium px-3 py-1.5 text-sm border border-gray-200 dark:border-portal-border bg-white dark:bg-portal-surface text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-1 focus:ring-orange-500" />
                  <select value={editingData.author || 'Scheduler'} onChange={(e) => setEditingData({ ...editingData, author: e.target.value })}
                    className="pl-3 pr-8 py-1.5 text-sm border bg-white dark:bg-portal-hover text-gray-900 dark:text-white border-gray-200 dark:border-portal-border rounded-md focus:outline-none focus:ring-1 focus:ring-orange-500">
                    {AUTHOR_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <JoditEditor value={editingData.content || ''} onChange={(val) => setEditingData({ ...editingData, content: val })} height={250} />
                <div className="flex gap-2">
                  <button onClick={() => saveEdit(item.id)} className="bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700 flex items-center gap-1.5 text-sm">
                    <IconDeviceFloppy className="h-4 w-4" /> Save
                  </button>
                  <button onClick={() => { setEditingId(null); setEditingData({}) }}
                    className="text-gray-600 dark:text-gray-400 px-3 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-portal-hover text-sm">Cancel</button>
                </div>
              </div>
            ) : (
              <SchedulerUpdateRow key={item.id} item={item} canEdit={canEdit} onEdit={() => startEditing(item)} onDelete={() => handleDelete(item.id)} />
            )
          ))}
        </div>
      )}
    </div>
  )
}
