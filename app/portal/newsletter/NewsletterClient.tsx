'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { newslettersAPI } from '@/lib/api'
import { uploadFile } from '@/lib/fileUpload'
import { useRole } from '@/contexts/RoleContext'
import { useToast } from '@/hooks/useToast'
import { validateNewsletterForm, getFieldError, hasErrors, formatValidationErrors } from '@/lib/portalValidation'
import { parseAPIError, sanitize, ValidationError } from '@/lib/errorHandling'
import FileUpload from '@/components/FileUpload'
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconDownload,
  IconEye,
  IconNotebook,
  IconDeviceFloppy,
  IconX,
} from '@tabler/icons-react'
import { NEWSLETTER_NAME } from '@/lib/siteConfig'

// Dynamically import PDFViewer to avoid SSR issues
const PDFViewer = dynamic(() => import('./PDFViewer'), {
  ssr: false,
  loading: () => <div className="text-center py-8">Loading PDF viewer...</div>
})

interface Newsletter {
  id: string
  title: string
  date: string
  pdfFile: string
  description?: string
  uploadedAt: string
}

interface NewsletterClientProps {
  newsletters: any[]
}

export default function NewsletterClient({ newsletters: initialNewsletters }: NewsletterClientProps) {
  const { user } = useRole()
  const { success, error } = useToast()
  const [newsletters, setNewsletters] = useState<Newsletter[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedNewsletter, setSelectedNewsletter] = useState<Newsletter | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingData, setEditingData] = useState<Partial<Newsletter> | null>(null)
  const [newNewsletter, setNewNewsletter] = useState({
    title: '',
    date: new Date().toISOString().split('T')[0],
    description: ''
  })
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [sortBy] = useState<'title' | 'date'>('date')
  const [sortOrder] = useState<'asc' | 'desc'>('desc')

  const canEdit = user.role === 'admin' || user.role === 'executive'

  // Load newsletters from API
  useEffect(() => {
    loadNewsletters()
  }, [])

  const loadNewsletters = async () => {
    try {
      const data = await newslettersAPI.getAll()
      const mapped = data.map((n: any) => ({
        id: n.id,
        title: n.title,
        date: n.date,
        description: n.description || '',
        pdfFile: n.file_url,
        uploadedAt: n.created_at
      }))
      setNewsletters(mapped)
    } catch (err) {
      error(parseAPIError(err))
    } finally {
      setIsLoading(false)
    }
  }

  // Get the latest newsletter by date
  const latestNewsletter = newsletters.length > 0
    ? newsletters.reduce((latest, current) =>
        new Date(current.date) > new Date(latest.date) ? current : latest
      )
    : null

  // Filter and sort newsletters
  const filteredNewsletters = newsletters
    .filter(newsletter =>
      searchTerm === '' ||
      newsletter.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      newsletter.description?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      let comparison = 0
      switch (sortBy) {
        case 'title':
          comparison = a.title.localeCompare(b.title)
          break
        case 'date':
          comparison = new Date(a.date).getTime() - new Date(b.date).getTime()
          break
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })

  const handleView = (newsletter: Newsletter) => {
    setSelectedNewsletter(newsletter)
  }

  const handleDownload = (newsletter: Newsletter) => {
    if (newsletter.pdfFile) {
      const link = document.createElement('a')
      link.href = newsletter.pdfFile
      link.download = `${newsletter.title}.pdf`
      link.click()
    }
  }

  const handleCreate = async () => {
    if (!selectedFile) {
      error('Please select a PDF file')
      return
    }

    if (selectedFile.type !== 'application/pdf') {
      error('Please select a PDF file')
      return
    }

    const sanitizedTitle = sanitize.text(newNewsletter.title)
    const sanitizedDescription = sanitize.text(newNewsletter.description)

    const dateObj = new Date(newNewsletter.date)
    const month = dateObj.toLocaleDateString('en-CA', { month: 'long' })
    const year = dateObj.getFullYear()

    const formData = {
      title: sanitizedTitle || `${NEWSLETTER_NAME} - ${month} ${year}`,
      month: month,
      year: year,
      description: sanitizedDescription,
      file: selectedFile
    }

    const errors = validateNewsletterForm(formData)
    if (hasErrors(errors)) {
      setValidationErrors(errors)
      error(formatValidationErrors(errors))
      return
    }

    setValidationErrors([])

    try {
      setIsUploading(true)
      const uploadResult = await uploadFile(selectedFile, '/newsletter/')

      const apiData = {
        title: formData.title,
        date: newNewsletter.date,
        description: formData.description,
        file_name: selectedFile.name,
        file_url: uploadResult.url,
        file_size: uploadResult.size,
        is_featured: false
      }

      const created = await newslettersAPI.create(apiData)

      const newItem: Newsletter = {
        id: created.id,
        title: created.title,
        date: created.date,
        description: created.description || '',
        pdfFile: created.file_url,
        uploadedAt: created.created_at
      }

      setNewsletters([newItem, ...newsletters])
      setNewNewsletter({
        title: '',
        date: new Date().toISOString().split('T')[0],
        description: ''
      })
      setSelectedFile(null)
      setValidationErrors([])
      setIsCreating(false)
      success('Newsletter uploaded successfully!')
    } catch (err) {
      error(`Failed to upload newsletter: ${parseAPIError(err)}`)
    } finally {
      setIsUploading(false)
    }
  }

  const startEditing = (newsletter: Newsletter) => {
    setEditingId(newsletter.id)
    setEditingData({
      title: newsletter.title,
      date: newsletter.date,
      description: newsletter.description || ''
    })
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditingData(null)
  }

  const handleSaveEdit = async () => {
    if (!editingId || !editingData) return

    try {
      const sanitizedUpdates = {
        id: editingId,
        title: sanitize.text(editingData.title || ''),
        date: editingData.date,
        description: sanitize.text(editingData.description || '')
      }

      const updated = await newslettersAPI.update(sanitizedUpdates)
      const updatedNewsletters = newsletters.map(n =>
        n.id === editingId ? { ...n, ...editingData } : n
      )
      setNewsletters(updatedNewsletters)
      success('Newsletter updated successfully.')
      cancelEditing()
    } catch (err) {
      error(parseAPIError(err))
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this newsletter?')) return

    try {
      await newslettersAPI.delete(id)
      setNewsletters(newsletters.filter(n => n.id !== id))
      success('Newsletter deleted successfully!')
    } catch (err) {
      error(`Failed to delete newsletter: ${parseAPIError(err)}`)
    }
  }

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'America/Edmonton'
      })
    } catch {
      return dateString
    }
  }

  return (
    <div className="px-3 py-3 sm:p-5 portal-animate">
      {/* Header — compact */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-bold font-heading tracking-tight text-gray-900 dark:text-white">{NEWSLETTER_NAME}</h1>
        {canEdit && !isCreating && (
          <button
            onClick={() => setIsCreating(true)}
            className="bg-orange-500 text-white px-3 py-1.5 rounded-lg hover:bg-orange-600 flex items-center gap-1.5 text-sm flex-shrink-0"
          >
            <IconPlus className="h-4 w-4" />
            Upload
          </button>
        )}
      </div>

      {/* Create New Newsletter Form */}
      {isCreating && (
        <div className="mb-4 bg-white dark:bg-portal-surface rounded-lg border border-gray-200 dark:border-portal-border p-3 sm:p-4">
          <h2 className="text-base font-semibold mb-3 text-gray-900 dark:text-white">Upload Newsletter</h2>

          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                <input
                  type="text"
                  value={newNewsletter.title}
                  onChange={(e) => setNewNewsletter({ ...newNewsletter, title: e.target.value })}
                  placeholder={`e.g., ${NEWSLETTER_NAME} - January 2025`}
                  className={`w-full px-3 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-1 bg-white dark:bg-portal-hover text-gray-900 dark:text-white ${
                    getFieldError(validationErrors, 'title')
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-gray-300 dark:border-portal-border focus:ring-orange-500'
                  }`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
                <input
                  type="date"
                  value={newNewsletter.date}
                  onChange={(e) => setNewNewsletter({ ...newNewsletter, date: e.target.value })}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-portal-border rounded-md focus:outline-none focus:ring-1 focus:ring-orange-500 bg-white dark:bg-portal-hover text-gray-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Description (optional)</label>
              <input
                type="text"
                value={newNewsletter.description}
                onChange={(e) => setNewNewsletter({ ...newNewsletter, description: e.target.value })}
                placeholder="Brief description..."
                className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-portal-border rounded-md focus:outline-none focus:ring-1 focus:ring-orange-500 bg-white dark:bg-portal-hover text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">PDF File *</label>
              <FileUpload
                onFileSelect={setSelectedFile}
                selectedFile={selectedFile}
                accept=".pdf"
                maxSize={10}
                buttonText="Choose PDF File"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={!selectedFile || isUploading}
                className="bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700 flex items-center gap-1.5 text-sm disabled:opacity-50"
              >
                {isUploading ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <IconDeviceFloppy className="h-4 w-4" />
                    Save
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  setIsCreating(false)
                  setSelectedFile(null)
                  setValidationErrors([])
                  setNewNewsletter({ title: '', date: new Date().toISOString().split('T')[0], description: '' })
                }}
                className="bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-md hover:bg-gray-400 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flat newsletter list — no cards, divider-separated rows */}
      <div className="bg-white dark:bg-portal-surface rounded-lg border border-gray-200 dark:border-portal-border divide-y divide-gray-100 dark:divide-portal-border">
        {filteredNewsletters.length === 0 ? (
          <div className="text-center py-8 px-4">
            <IconNotebook className="mx-auto h-8 w-8 text-gray-400 dark:text-gray-500" />
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {canEdit ? 'No newsletters yet. Click "Upload" to add one.' : 'Newsletters will appear here.'}
            </p>
          </div>
        ) : (
          filteredNewsletters.map((newsletter, index) => {
            const isLatest = latestNewsletter && newsletter.id === latestNewsletter.id

            // Inline edit mode
            if (editingId === newsletter.id && editingData) {
              return (
                <div key={newsletter.id} className="p-3 space-y-2">
                  <input
                    type="text"
                    value={editingData.title || ''}
                    onChange={(e) => setEditingData({ ...editingData, title: e.target.value })}
                    className="w-full font-medium px-2 py-1.5 text-sm border border-gray-200 dark:border-portal-border bg-white dark:bg-portal-surface text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={editingData.date || ''}
                      onChange={(e) => setEditingData({ ...editingData, date: e.target.value })}
                      className="px-2 py-1.5 text-sm border border-gray-200 dark:border-portal-border bg-white dark:bg-portal-surface text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-1 focus:ring-orange-500"
                    />
                    <input
                      type="text"
                      value={editingData.description || ''}
                      onChange={(e) => setEditingData({ ...editingData, description: e.target.value })}
                      placeholder="Description..."
                      className="px-2 py-1.5 text-sm border border-gray-200 dark:border-portal-border bg-white dark:bg-portal-surface text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-1 focus:ring-orange-500"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleSaveEdit} className="bg-green-600 text-white px-2.5 py-1 rounded text-xs hover:bg-green-700 flex items-center gap-1">
                      <IconDeviceFloppy className="h-3.5 w-3.5" /> Save
                    </button>
                    <button onClick={cancelEditing} className="text-gray-500 px-2.5 py-1 rounded text-xs hover:bg-gray-100 dark:hover:bg-portal-hover">
                      Cancel
                    </button>
                  </div>
                </div>
              )
            }

            // Normal row — title + date on left, actions on right
            return (
              <div
                key={newsletter.id}
                className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-portal-hover/50 transition-colors ${isLatest ? 'bg-orange-50/50 dark:bg-orange-900/10' : ''}`}
                onClick={() => handleView(newsletter)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-gray-900 dark:text-white text-sm truncate">{newsletter.title}</h3>
                    {isLatest && (
                      <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400">Latest</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{formatDate(newsletter.date)}</p>
                </div>
                <div className="flex items-center gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => handleView(newsletter)} className="p-1.5 text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded" title="View">
                    <IconEye className="h-4 w-4" />
                  </button>
                  <a href={newsletter.pdfFile} download className="p-1.5 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 rounded" title="Download">
                    <IconDownload className="h-4 w-4" />
                  </a>
                  {canEdit && (
                    <>
                      <button onClick={() => startEditing(newsletter)} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-portal-hover rounded" title="Edit">
                        <IconEdit className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleDelete(newsletter.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded" title="Delete">
                        <IconTrash className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* PDF Viewer Modal */}
      {selectedNewsletter && (
        <PDFViewer
          pdfUrl={selectedNewsletter.pdfFile || ''}
          title={selectedNewsletter.title || ''}
          onClose={() => setSelectedNewsletter(null)}
        />
      )}
    </div>
  )
}
