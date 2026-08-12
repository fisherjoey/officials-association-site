'use client'

import { useState, useEffect, useCallback } from 'react'
import { resourcesAPI } from '@/lib/api'
import { uploadFile } from '@/lib/fileUpload'
import ResourceViewer from '@/components/ResourceViewer'
import ResourceThumbnail from '@/components/ResourceThumbnail'
import { useRole } from '@/contexts/RoleContext'
import { useToast } from '@/hooks/useToast'
import { useCache } from '@/hooks/useCache'
import { CACHE_TTL } from '@/lib/cache'
import {
  getFieldError,
  hasErrors,
  formatValidationErrors
} from '@/lib/portalValidation'
import { parseAPIError, sanitize, ValidationError } from '@/lib/errorHandling'
import { JoditEditor } from '@/components/JoditEditor'
import { HTMLViewer } from '@/components/HTMLViewer'
import FileUpload from '@/components/FileUpload'
import PortalFilterBar from '@/components/portal/PortalFilterBar'
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconDownload,
  IconExternalLink,
  IconFile,
  IconBook,
  IconFileText,
  IconVideo,
  IconClipboard,
  IconDeviceFloppy,
  IconX,
  IconUpload,
  IconLink,
  IconArticle,
  IconChevronDown,
  IconChevronUp,
  IconSortAscending,
  IconSortDescending,
  IconLayoutList,
  IconLayoutGrid
} from '@tabler/icons-react'

// Simple accordion for resource category groups
function ResourceCategoryAccordion({ label, count, icon: Icon, children }: {
  label: string
  count: number
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-start gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-portal-hover/50 transition-colors">
        <IconChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        <Icon className="h-3.5 w-3.5 text-gray-400" />
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">{label}</span>
        <span className="text-[10px] text-gray-400 dark:text-gray-500">{count}</span>
      </button>
      {open && children}
    </div>
  )
}

type ResourceType = 'file' | 'link' | 'video' | 'text'

interface Resource {
  id: string
  title: string
  description: string
  category: 'rulebooks' | 'forms' | 'training' | 'policies' | 'guides' | 'videos'
  resourceType: ResourceType
  fileUrl?: string
  externalLink?: string
  fileSize?: string
  lastUpdated: string
  featured?: boolean
  accessLevel?: 'all' | 'level1' | 'level2' | 'level3' | 'level4' | 'level5'
}

export default function ResourcesClient() {
  const { hasRole } = useRole()
  const { success, error, warning, info } = useToast()
  const [resources, setResources] = useState<Resource[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingData, setEditingData] = useState<Partial<Resource> | null>(null)
  const [viewingResource, setViewingResource] = useState<Resource | null>(null)
  const [newResource, setNewResource] = useState<Partial<Resource>>({
    title: '',
    description: '',
    category: 'rulebooks',
    resourceType: 'file',
    accessLevel: 'all'
  })
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [existingFiles, setExistingFiles] = useState<Array<{name: string, url: string, size: string}>>([])
  const [fileSearchTerm, setFileSearchTerm] = useState('')
  const [showFileDropdown, setShowFileDropdown] = useState(false)
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])
  const [expandedTextResources, setExpandedTextResources] = useState<Set<string>>(new Set())
  const [sortBy, setSortBy] = useState<'title' | 'date' | 'type'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [groupByCategory, setGroupByCategory] = useState(true)
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')

  const canEdit = hasRole('executive')

  // Map API data to frontend format (handles both API format and already-mapped format)
  const mapApiResource = useCallback((r: any): Resource => {
    // Check if already in frontend format (has resourceType) or API format (has resource_type)
    const isApiFormat = 'resource_type' in r || 'file_url' in r || 'is_featured' in r

    if (isApiFormat) {
      return {
        id: r.id,
        title: r.title,
        description: r.description || '',
        category: r.category,
        resourceType: (r.resource_type || 'file') as ResourceType,
        fileUrl: r.file_name === 'external-link' ? '' : r.file_url,
        externalLink: r.file_name === 'external-link' ? r.file_url : undefined,
        lastUpdated: r.updated_at || r.created_at,
        featured: r.is_featured,
        accessLevel: r.access_level || 'all'
      }
    }

    // Already in frontend format
    return {
      id: r.id,
      title: r.title,
      description: r.description || '',
      category: r.category,
      resourceType: (r.resourceType || 'file') as ResourceType,
      fileUrl: r.fileUrl || '',
      externalLink: r.externalLink,
      lastUpdated: r.lastUpdated,
      featured: r.featured,
      accessLevel: r.accessLevel || 'all'
    }
  }, [])

  // Fetch function for resources
  const fetchResources = useCallback(async () => {
    const data = await resourcesAPI.getAll()
    return data.map(mapApiResource)
  }, [mapApiResource])

  // Use cached data for resources
  const {
    data: cachedResources,
    isLoading,
    isFromCache,
    refresh: refreshResources,
    setData: setCachedResources
  } = useCache<Resource[]>({
    cacheKey: 'resources',
    fetchFn: fetchResources,
    ttl: CACHE_TTL.resources,
    onSuccess: (data) => {
      // Ensure data is properly mapped (in case of stale cache with API format)
      const mappedData = data.map(mapApiResource)
      setResources(mappedData)
    },
    onError: (err) => {
      error('Failed to Load Resources', parseAPIError(err))
      setResources([])
    }
  })

  // Load existing files for file picker
  const loadExistingFiles = useCallback(async () => {
    try {
      const API_BASE = process.env.NODE_ENV === 'production'
        ? '/.netlify/functions'
        : 'http://localhost:9000/.netlify/functions'

      const response = await fetch(`${API_BASE}/list-resource-files`)
      if (response.ok) {
        const data = await response.json()
        setExistingFiles(data.files || [])
      }
    } catch (error) {
      console.error('Failed to load existing files:', error)
    }
  }, [])

  // Load existing files on mount
  useEffect(() => {
    loadExistingFiles()
  }, [loadExistingFiles])

  const categories = [
    { value: 'all', label: 'All Resources', icon: IconFile },
    { value: 'rulebooks', label: 'Rulebooks', icon: IconBook },
    { value: 'forms', label: 'Forms', icon: IconClipboard },
    { value: 'training', label: 'Training Materials', icon: IconFileText },
    { value: 'policies', label: 'Policies', icon: IconFileText },
    { value: 'guides', label: 'Guides', icon: IconBook },
    { value: 'videos', label: 'Videos', icon: IconVideo }
  ]

  const resourceTypes = [
    { value: 'file', label: 'File Upload', icon: IconFile, description: 'Upload a PDF, document, or other file' },
    { value: 'link', label: 'External Link', icon: IconLink, description: 'Link to an external website or resource' },
    { value: 'video', label: 'Video', icon: IconVideo, description: 'Embed a video link (YouTube, Vimeo, etc.)' },
    { value: 'text', label: 'Text Content', icon: IconArticle, description: 'Rich text content displayed directly' }
  ]

  // Custom validation based on resource type
  const validateResourceFormCustom = (data: Partial<Resource>, file?: File | null): ValidationError[] => {
    const errors: ValidationError[] = []

    // Title validation
    if (!data.title || data.title.trim().length < 3) {
      errors.push({ field: 'title', message: 'Title must be at least 3 characters' })
    }
    if (data.title && data.title.length > 200) {
      errors.push({ field: 'title', message: 'Title must be less than 200 characters' })
    }

    // Category validation
    if (!data.category) {
      errors.push({ field: 'category', message: 'Category is required' })
    }

    // Resource type specific validation
    const resourceType = data.resourceType || 'file'

    if (resourceType === 'file') {
      if (!file && !data.fileUrl) {
        errors.push({ field: 'file', message: 'Please upload a file or select an existing one' })
      }
    } else if (resourceType === 'link' || resourceType === 'video') {
      if (!data.externalLink) {
        errors.push({ field: 'externalLink', message: 'Please provide a URL' })
      }
    } else if (resourceType === 'text') {
      // For text resources, description is required and should have content
      if (!data.description || data.description.trim().length < 10) {
        errors.push({ field: 'description', message: 'Text content must be at least 10 characters' })
      }
    }

    // Description validation for non-text types (optional but with max length if provided)
    if (resourceType !== 'text' && data.description && data.description.length > 1000) {
      errors.push({ field: 'description', message: 'Description must be less than 1000 characters' })
    }

    return errors
  }

  const filteredResources = resources
    .filter(resource => {
      const matchesCategory = selectedCategory === 'all' || resource.category === selectedCategory
      const matchesSearch = searchTerm === '' ||
        resource.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        resource.description.toLowerCase().includes(searchTerm.toLowerCase())
      return matchesCategory && matchesSearch
    })
    .sort((a, b) => {
      let comparison = 0
      switch (sortBy) {
        case 'title':
          comparison = a.title.localeCompare(b.title)
          break
        case 'date':
          comparison = new Date(a.lastUpdated).getTime() - new Date(b.lastUpdated).getTime()
          break
        case 'type':
          comparison = (a.resourceType || 'file').localeCompare(b.resourceType || 'file')
          break
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })

  // Group resources by category (include featured resources in their categories)
  const groupedResources = groupByCategory && selectedCategory === 'all'
    ? categories.slice(1).reduce((acc, cat) => {
        const categoryResources = filteredResources.filter(r => r.category === cat.value)
        if (categoryResources.length > 0) {
          acc[cat.value] = { label: cat.label, resources: categoryResources }
        }
        return acc
      }, {} as Record<string, { label: string; resources: Resource[] }>)
    : null

  const handleCreate = async () => {
    // Clear previous validation errors
    setValidationErrors([])

    // Validate form data using custom validation
    const errors = validateResourceFormCustom(newResource, uploadedFile)

    if (hasErrors(errors)) {
      setValidationErrors(errors)
      error('Validation Failed', formatValidationErrors(errors))
      return
    }

    // Sanitize inputs - don't sanitize HTML for text type
    const resourceType = newResource.resourceType || 'file'
    const sanitizedData = {
      title: sanitize.text(newResource.title || ''),
      description: resourceType === 'text' ? newResource.description || '' : sanitize.text(newResource.description || ''),
      category: newResource.category,
      resourceType: resourceType,
      externalLink: newResource.externalLink ? sanitize.url(newResource.externalLink) : undefined,
      accessLevel: newResource.accessLevel || 'all',
      featured: newResource.featured || false
    }

    try {
      setIsUploading(true)
      let fileUrl = newResource.fileUrl
      let fileName: string | undefined

      // Handle file upload with automatic validation (only for file type)
      if (resourceType === 'file' && uploadedFile) {
        try {
          const uploadResult = await uploadFile(uploadedFile)
          fileUrl = uploadResult.url
          fileName = uploadResult.fileName
          success('File Uploaded', `${uploadResult.fileName} uploaded successfully`)
        } catch (uploadError) {
          error('Upload Failed', parseAPIError(uploadError))
          setIsUploading(false)
          return
        }
      }

      // Determine file_url and file_name based on resource type
      let apiFileUrl = ''
      let apiFileName = ''
      if (resourceType === 'file') {
        apiFileUrl = fileUrl || ''
        apiFileName = fileName || 'uploaded-file'
      } else if (resourceType === 'link' || resourceType === 'video') {
        apiFileUrl = sanitizedData.externalLink || ''
        apiFileName = 'external-link'
      } else if (resourceType === 'text') {
        apiFileUrl = ''
        apiFileName = 'text-content'
      }

      const apiData = {
        title: sanitizedData.title,
        description: sanitizedData.description,
        category: sanitizedData.category,
        resource_type: sanitizedData.resourceType,
        file_url: apiFileUrl,
        file_name: apiFileName,
        is_featured: sanitizedData.featured,
        access_level: sanitizedData.accessLevel
      }

      const created = await resourcesAPI.create(apiData)
      const mappedResource: Resource = {
        id: created.id,
        title: created.title,
        description: created.description,
        category: created.category,
        resourceType: (created.resource_type || 'file') as ResourceType,
        fileUrl: created.file_name === 'external-link' || created.file_name === 'text-content' ? '' : created.file_url,
        externalLink: created.file_name === 'external-link' ? created.file_url : undefined,
        fileSize: newResource.fileSize,
        lastUpdated: created.created_at,
        featured: created.is_featured,
        accessLevel: created.access_level
      }

      const updatedResources = [...resources, mappedResource]
      setResources(updatedResources)
      setCachedResources(updatedResources)
      success('Resource Created', 'The resource was successfully added to the library.')

      // Reset form
      setNewResource({
        title: '',
        description: '',
        category: 'rulebooks',
        resourceType: 'file',
        accessLevel: 'all'
      })
      setUploadedFile(null)
      setFileSearchTerm('')
      setShowFileDropdown(false)
      setValidationErrors([])
      setIsCreating(false)
    } catch (err) {
      error('Failed to Create Resource', parseAPIError(err))
    } finally {
      setIsUploading(false)
    }
  }

  // Start editing a resource - copy data to local buffer
  const startEditing = (resource: Resource) => {
    setEditingId(resource.id)
    setEditingData({
      title: resource.title || '',
      description: resource.description || '',
      category: resource.category,
      resourceType: resource.resourceType || 'file',
      fileUrl: resource.fileUrl,
      externalLink: resource.externalLink,
      featured: resource.featured,
      accessLevel: resource.accessLevel
    })
  }

  // Cancel editing - clear local buffer
  const cancelEditing = () => {
    setEditingId(null)
    setEditingData(null)
  }

  // Save edit - only call API when Save button is clicked
  const handleSaveEdit = async () => {
    if (!editingId || !editingData) return

    try {
      // Sanitize updates - don't sanitize HTML for text type
      const isTextType = editingData.resourceType === 'text'
      const sanitizedUpdates: any = { id: editingId }
      if (editingData.title !== undefined) sanitizedUpdates.title = sanitize.text(editingData.title)
      if (editingData.description !== undefined) {
        sanitizedUpdates.description = isTextType ? editingData.description : sanitize.text(editingData.description)
      }
      if (editingData.category !== undefined) sanitizedUpdates.category = editingData.category
      if (editingData.resourceType !== undefined) sanitizedUpdates.resource_type = editingData.resourceType
      if (editingData.fileUrl !== undefined) sanitizedUpdates.file_url = editingData.fileUrl
      if (editingData.externalLink !== undefined) {
        sanitizedUpdates.file_url = editingData.externalLink ? sanitize.url(editingData.externalLink) : null
      }
      if (editingData.featured !== undefined) sanitizedUpdates.is_featured = editingData.featured
      if (editingData.accessLevel !== undefined) sanitizedUpdates.access_level = editingData.accessLevel

      const updated = await resourcesAPI.update(sanitizedUpdates)
      const updatedResources = resources.map(r =>
        r.id === editingId ? {
          ...r,
          ...editingData,
          lastUpdated: updated.updated_at
        } : r
      )
      setResources(updatedResources)
      setCachedResources(updatedResources)
      success('Resource Updated', 'Changes saved successfully.')
      cancelEditing()
    } catch (err) {
      error('Update Failed', parseAPIError(err))
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this resource?')) return

    try {
      await resourcesAPI.delete(id)
      const updatedResources = resources.filter(r => r.id !== id)
      setResources(updatedResources)
      setCachedResources(updatedResources)
      success('Resource Deleted', 'The resource has been removed.')
    } catch (err) {
      error('Delete Failed', parseAPIError(err))
    }
  }

  const getCategoryIcon = (category: string) => {
    const cat = categories.find(c => c.value === category)
    return cat ? cat.icon : IconFile
  }

  // Format date to MST timezone in a readable format
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'America/Edmonton' // MST/MDT
      })
    } catch {
      return dateString
    }
  }

  const toggleTextResourceExpanded = (id: string) => {
    setExpandedTextResources(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  // Get icon and colors based on resource type
  const getResourceIcon = (type: ResourceType) => {
    switch (type) {
      case 'video': return { icon: IconVideo, bg: 'bg-red-100', color: 'text-red-600' }
      case 'link': return { icon: IconLink, bg: 'bg-green-100', color: 'text-green-600' }
      case 'text': return { icon: IconArticle, bg: 'bg-purple-100', color: 'text-purple-600' }
      default: return { icon: IconFile, bg: 'bg-blue-100', color: 'text-blue-400' }
    }
  }

  // Get video thumbnail URL from external link
  const getVideoThumbnail = (url: string | undefined): string | null => {
    if (!url) return null

    // YouTube thumbnail
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      const videoId = url.includes('youtu.be')
        ? url.split('/').pop()?.split('?')[0]
        : url.split('v=')[1]?.split('&')[0]
      if (videoId) {
        return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
      }
    }

    // Vimeo - would need API call, skip for now
    // Google Drive - no easy thumbnail access

    return null
  }

  // Render a single resource (list or grid view)
  const renderResource = (resource: Resource) => {
    // Check if editing this resource
    if (editingId === resource.id && editingData) {
      return (
        <div key={resource.id} className="bg-white dark:bg-portal-surface rounded-lg border border-gray-200 dark:border-portal-border p-4 col-span-full">
          <div className="space-y-3">
            {/* Resource Type Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Resource Type</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {resourceTypes.map((type) => {
                  const TypeIcon = type.icon
                  const isSelected = editingData.resourceType === type.value
                  return (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setEditingData({ ...editingData, resourceType: type.value as ResourceType })}
                      className={`p-2 rounded-lg border-2 transition-all flex flex-col items-center gap-1 ${
                        isSelected
                          ? 'border-orange-500 bg-orange-50 text-orange-700'
                          : 'border-gray-200 dark:border-portal-border hover:border-gray-300 text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      <TypeIcon className="h-5 w-5" />
                      <span className="text-xs font-medium">{type.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <input
              type="text"
              value={editingData.title || ''}
              onChange={(e) => setEditingData({ ...editingData, title: e.target.value })}
              className="w-full font-semibold px-3 py-2 border border-gray-200 dark:border-portal-border bg-white dark:bg-portal-surface text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="Resource title..."
            />

            {/* Description/Content */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {editingData.resourceType === 'text' ? 'Content' : 'Description'}
              </label>
              {editingData.resourceType === 'text' ? (
                <JoditEditor
                  value={editingData.description || ''}
                  onChange={(value) => setEditingData({ ...editingData, description: value })}
                  height={300}
                  placeholder="Enter your content here..."
                />
              ) : (
                <textarea
                  value={editingData.description || ''}
                  onChange={(e) => setEditingData({ ...editingData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-portal-border bg-white dark:bg-portal-surface text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  rows={2}
                  placeholder="Resource description..."
                />
              )}
            </div>

            {/* External Link for link/video types */}
            {(editingData.resourceType === 'link' || editingData.resourceType === 'video') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {editingData.resourceType === 'video' ? 'Video URL' : 'External Link'}
                </label>
                <input
                  type="url"
                  value={editingData.externalLink || ''}
                  onChange={(e) => setEditingData({ ...editingData, externalLink: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-portal-border bg-white dark:bg-portal-surface text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="https://..."
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
                <select
                  value={editingData.category || 'rulebooks'}
                  onChange={(e) => setEditingData({ ...editingData, category: e.target.value as Resource['category'] })}
                  className="w-full pl-3 pr-8 py-2 border border-gray-200 dark:border-portal-border bg-white dark:bg-portal-surface text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="rulebooks">Rulebooks</option>
                  <option value="forms">Forms</option>
                  <option value="training">Training Materials</option>
                  <option value="policies">Policies</option>
                  <option value="guides">Guides</option>
                  <option value="videos">Videos</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Access Level</label>
                <select
                  value={editingData.accessLevel || 'all'}
                  onChange={(e) => setEditingData({ ...editingData, accessLevel: e.target.value as Resource['accessLevel'] })}
                  className="w-full pl-3 pr-8 py-2 border border-gray-200 dark:border-portal-border bg-white dark:bg-portal-surface text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="all">All Officials</option>
                  <option value="level1">Level 1+</option>
                  <option value="level2">Level 2+</option>
                  <option value="level3">Level 3+</option>
                  <option value="level4">Level 4+</option>
                  <option value="level5">Level 5 Only</option>
                </select>
              </div>
            </div>
            <div className="flex items-center">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingData.featured || false}
                  onChange={(e) => setEditingData({ ...editingData, featured: e.target.checked })}
                  className="rounded text-orange-500 focus:ring-orange-500"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Featured</span>
              </label>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveEdit}
                className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 flex items-center gap-1"
              >
                <IconDeviceFloppy className="h-4 w-4" />
                Save Changes
              </button>
              <button
                onClick={cancelEditing}
                className="bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 px-3 py-1 rounded text-sm hover:bg-gray-400 dark:hover:bg-gray-500 flex items-center gap-1"
              >
                <IconX className="h-4 w-4" />
                Cancel
              </button>
            </div>
          </div>
        </div>
      )
    }

    const resourceIcon = getResourceIcon(resource.resourceType || 'file')
    const IconComponent = resourceIcon.icon
    const isTextResource = resource.resourceType === 'text'
    const isExpanded = isTextResource && expandedTextResources.has(resource.id)
    const isVideo = resource.resourceType === 'video'
    const videoThumbnail = isVideo ? getVideoThumbnail(resource.externalLink) : null

    // Handle clicking on the resource card/row
    const handleResourceClick = () => {
      if (isTextResource) {
        toggleTextResourceExpanded(resource.id)
      } else if (resource.fileUrl || resource.externalLink) {
        setViewingResource(resource)
      }
    }

    // Text resources share the same flat-row layout as everything else.
    // The whole row is the click target (matching other resource rows);
    // the trailing chevron is just a visual cue that this one expands.
    if (isTextResource) {
      return (
        <div
          key={resource.id}
          id={`resource-${resource.id}`}
          className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-portal-hover/50 transition-colors ${
            resource.featured ? 'bg-orange-50/50 dark:bg-orange-900/10' : ''
          }`}
          onClick={handleResourceClick}
        >
          <div className="px-3 py-2.5">
            <div className="flex items-start gap-2.5">
              <div className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 ${resourceIcon.bg}`}>
                <IconComponent className={`h-4 w-4 ${resourceIcon.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-sm text-gray-900 dark:text-white leading-snug">
                  {resource.title}
                  {resource.featured && (
                    <span className="ml-1.5 text-[9px] font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400">Featured</span>
                  )}
                </h3>
                <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  <span>{formatDate(resource.lastUpdated)}</span>
                </div>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <span className="p-2 text-gray-400 dark:text-gray-500" aria-hidden="true">
                  {isExpanded ? <IconChevronUp className="h-4 w-4" /> : <IconChevronDown className="h-4 w-4" />}
                </span>
                {canEdit && (
                  <>
                    <button onClick={() => startEditing(resource)} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded hidden sm:block" title="Edit">
                      <IconEdit className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => handleDelete(resource.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded hidden sm:block" title="Delete">
                      <IconTrash className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
          {isExpanded && (
            <div className="border-t border-gray-100 dark:border-portal-border/60 bg-gray-50/50 dark:bg-portal-surface/40 px-4 py-3" onClick={(e) => e.stopPropagation()}>
              <HTMLViewer content={resource.description} compact />
            </div>
          )}
        </div>
      )
    }

    // Flat row — title wraps, primary action prominent, admin actions subtle
    return (
      <div
        key={resource.id}
        id={`resource-${resource.id}`}
        className={`px-3 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-portal-hover/50 transition-colors ${
          resource.featured ? 'bg-orange-50/50 dark:bg-orange-900/10' : ''
        }`}
        onClick={handleResourceClick}
      >
        <div className="flex items-start gap-2.5">
          <div className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 ${resourceIcon.bg}`}>
            <IconComponent className={`h-4 w-4 ${resourceIcon.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm text-gray-900 dark:text-white leading-snug">
              {resource.title}
              {resource.featured && (
                <span className="ml-1.5 text-[9px] font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400">Featured</span>
              )}
            </h3>
            <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              <span>{formatDate(resource.lastUpdated)}</span>
              {resource.fileSize && <span>{resource.fileSize}</span>}
            </div>
          </div>
          {/* Primary action only — download or open */}
          <div className="flex items-center gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            {resource.fileUrl && (
              <a href={resource.fileUrl} download className="p-2 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 rounded" title="Download">
                <IconDownload className="h-4 w-4" />
              </a>
            )}
            {resource.externalLink && (
              <a href={resource.externalLink} target="_blank" rel="noopener noreferrer" className="p-2 text-blue-400 hover:bg-blue-900/30 rounded" title="Open">
                <IconExternalLink className="h-4 w-4" />
              </a>
            )}
            {canEdit && (
              <>
                <button onClick={() => startEditing(resource)} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded hidden sm:block" title="Edit">
                  <IconEdit className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => handleDelete(resource.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded hidden sm:block" title="Delete">
                  <IconTrash className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            {isTextResource && (
              <button onClick={() => toggleTextResourceExpanded(resource.id)} className="p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-portal-hover rounded">
                {isExpanded ? <IconChevronUp className="h-4 w-4" /> : <IconChevronDown className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-3 py-3 sm:p-5 portal-animate">

      {/* Header — compact */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-bold font-heading tracking-tight text-gray-900 dark:text-white">Resources</h1>
        {canEdit && !isCreating && (
          <button
            onClick={() => {
              setIsCreating(true)
              const category = selectedCategory === 'all' ? 'rulebooks' : selectedCategory
              setNewResource({
                title: '',
                description: '',
                category: category as Resource['category'],
                resourceType: 'file',
                accessLevel: 'all'
              })
            }}
            className="bg-orange-500 text-white px-3 py-1.5 rounded-lg hover:bg-orange-600 flex items-center gap-1.5 text-sm flex-shrink-0"
          >
            <IconPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Add Resource</span>
            <span className="sm:hidden">Add</span>
          </button>
        )}
      </div>

      {/* Create New Resource Form */}
      {isCreating && (
        <div className="mb-6 bg-white dark:bg-portal-surface rounded-lg border border-gray-200 dark:border-portal-border p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-semibold mb-4 text-gray-900 dark:text-white">Add New Resource</h2>

          <div className="space-y-4">
            {/* Resource Type Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Resource Type *</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {resourceTypes.map((type) => {
                  const Icon = type.icon
                  const isSelected = newResource.resourceType === type.value
                  return (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setNewResource({ ...newResource, resourceType: type.value as ResourceType, externalLink: '', fileUrl: '' })}
                      className={`p-3 rounded-lg border-2 transition-all flex flex-col items-center gap-1 ${
                        isSelected
                          ? 'border-orange-500 bg-orange-50 text-orange-700'
                          : 'border-gray-200 dark:border-portal-border hover:border-gray-300 text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      <Icon className="h-6 w-6" />
                      <span className="text-sm font-medium">{type.label}</span>
                    </button>
                  )
                })}
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {resourceTypes.find(t => t.value === newResource.resourceType)?.description}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title *</label>
                <input
                  type="text"
                  value={newResource.title}
                  onChange={(e) => setNewResource({ ...newResource, title: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-portal-surface text-gray-900 dark:text-white focus:outline-none focus:ring-2 ${
                    getFieldError(validationErrors, 'title')
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-gray-300 dark:border-portal-border focus:ring-orange-500'
                  }`}
                  placeholder="Resource title..."
                />
                {getFieldError(validationErrors, 'title') && (
                  <p className="mt-1 text-sm text-red-600">
                    {getFieldError(validationErrors, 'title')}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category *</label>
                <select
                  value={newResource.category}
                  onChange={(e) => setNewResource({ ...newResource, category: e.target.value as any })}
                  className="w-full pl-3 pr-8 py-2 border border-gray-200 dark:border-portal-border bg-white dark:bg-portal-surface text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="rulebooks">Rulebooks</option>
                  <option value="forms">Forms</option>
                  <option value="training">Training Materials</option>
                  <option value="policies">Policies</option>
                  <option value="guides">Guides</option>
                  <option value="videos">Videos</option>
                </select>
              </div>
            </div>

            {/* Description/Content - rich text for text type, textarea for others */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {newResource.resourceType === 'text' ? 'Content *' : 'Description'}
              </label>
              {newResource.resourceType === 'text' ? (
                <div className={`border rounded-lg ${getFieldError(validationErrors, 'description') ? 'border-red-500' : 'border-gray-300 dark:border-portal-border'}`}>
                  <JoditEditor
                    value={newResource.description || ''}
                    onChange={(value) => setNewResource({ ...newResource, description: value })}
                    height={400}
                    placeholder="Enter your content here..."
                  />
                </div>
              ) : (
                <textarea
                  value={newResource.description}
                  onChange={(e) => setNewResource({ ...newResource, description: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-portal-surface text-gray-900 dark:text-white focus:outline-none focus:ring-2 ${
                    getFieldError(validationErrors, 'description')
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-gray-300 dark:border-portal-border focus:ring-orange-500'
                  }`}
                  rows={3}
                  placeholder="Brief description of the resource..."
                />
              )}
              {getFieldError(validationErrors, 'description') && (
                <p className="mt-1 text-sm text-red-600">
                  {getFieldError(validationErrors, 'description')}
                </p>
              )}
            </div>

            {/* File Upload - only for file type */}
            {newResource.resourceType === 'file' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Resource File *</label>
                <FileUpload
                  onFileSelect={(file) => {
                    setUploadedFile(file)
                    if (file) {
                      const sizeInMB = (file.size / (1024 * 1024)).toFixed(2)
                      setNewResource({
                        ...newResource,
                        fileSize: `${sizeInMB} MB`,
                        fileUrl: ''
                      })
                    } else {
                      setNewResource({ ...newResource, fileSize: '', fileUrl: '' })
                    }
                    setFileSearchTerm('')
                  }}
                  selectedFile={uploadedFile}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                  maxSize={10}
                  buttonText="Upload File"
                />
                {getFieldError(validationErrors, 'file') && (
                  <p className="mt-1 text-sm text-red-600">{getFieldError(validationErrors, 'file')}</p>
                )}
              </div>
            )}

            {/* External Link - for link and video types */}
            {(newResource.resourceType === 'link' || newResource.resourceType === 'video') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {newResource.resourceType === 'video' ? 'Video URL *' : 'External Link *'}
                </label>
                <input
                  type="url"
                  value={newResource.externalLink || ''}
                  onChange={(e) => setNewResource({ ...newResource, externalLink: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-portal-surface text-gray-900 dark:text-white focus:outline-none focus:ring-2 ${
                    getFieldError(validationErrors, 'externalLink')
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-gray-300 dark:border-portal-border focus:ring-orange-500'
                  }`}
                  placeholder={newResource.resourceType === 'video' ? 'https://youtube.com/watch?v=...' : 'https://...'}
                />
                {getFieldError(validationErrors, 'externalLink') && (
                  <p className="mt-1 text-sm text-red-600">{getFieldError(validationErrors, 'externalLink')}</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Access Level</label>
                <select
                  value={newResource.accessLevel}
                  onChange={(e) => setNewResource({ ...newResource, accessLevel: e.target.value as any })}
                  className="w-full pl-3 pr-8 py-2 border border-gray-200 dark:border-portal-border bg-white dark:bg-portal-surface text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="all">All Officials</option>
                  <option value="level1">Level 1+</option>
                  <option value="level2">Level 2+</option>
                  <option value="level3">Level 3+</option>
                  <option value="level4">Level 4+</option>
                  <option value="level5">Level 5 Only</option>
                </select>
              </div>

              <div className="flex items-center">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newResource.featured || false}
                    onChange={(e) => setNewResource({ ...newResource, featured: e.target.checked })}
                    className="rounded text-orange-500 focus:ring-orange-500"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Featured Resource</span>
                </label>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleCreate}
                disabled={isUploading}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <>
                    <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <IconDeviceFloppy className="h-5 w-5" />
                    Save Resource
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  setIsCreating(false)
                  setNewResource({
                    title: '',
                    description: '',
                    category: 'rulebooks',
                    resourceType: 'file',
                    accessLevel: 'all'
                  })
                  setUploadedFile(null)
                  setFileSearchTerm('')
                  setShowFileDropdown(false)
                }}
                className="bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 flex items-center justify-center gap-2"
              >
                <IconX className="h-5 w-5" />
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search + Sort — compact inline */}
      <div className="mb-2 flex gap-2">
        <div className="flex-1 relative">
          <IconFile className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search resources..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-portal-border rounded-md bg-white dark:bg-portal-surface text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'title' | 'date' | 'type')}
          className="text-xs border border-gray-300 dark:border-portal-border bg-white dark:bg-portal-surface text-gray-700 dark:text-gray-300 rounded-md pl-2 pr-6 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-500"
        >
          <option value="date">Date</option>
          <option value="title">Title</option>
          <option value="type">Type</option>
        </select>
        <button
          onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
          className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border border-gray-300 dark:border-portal-border rounded-md bg-white dark:bg-portal-surface"
        >
          {sortOrder === 'asc' ? <IconSortAscending className="h-4 w-4" /> : <IconSortDescending className="h-4 w-4" />}
        </button>
        <button
          onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
          className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border border-gray-300 dark:border-portal-border rounded-md bg-white dark:bg-portal-surface"
        >
          {viewMode === 'list' ? <IconLayoutGrid className="h-4 w-4" /> : <IconLayoutList className="h-4 w-4" />}
        </button>
      </div>

      {/* Category pills — horizontal scroll */}
      <div className="mb-3 flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-1">
        {categories.map(cat => {
          const Icon = cat.icon
          return (
            <button
              key={cat.value}
              onClick={() => setSelectedCategory(cat.value)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all ${
                selectedCategory === cat.value
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 dark:bg-portal-hover text-gray-600 dark:text-gray-400'
              }`}
            >
              <Icon className="h-3 w-3" />
              {cat.label}
            </button>
          )
        })}
        {selectedCategory === 'all' && (
          <label className="flex-shrink-0 flex items-center gap-1.5 ml-2 text-xs text-gray-500 dark:text-gray-400">
            <input
              type="checkbox"
              checked={groupByCategory}
              onChange={(e) => setGroupByCategory(e.target.checked)}
              className="rounded text-orange-500 focus:ring-orange-500 h-3.5 w-3.5"
            />
            Group
          </label>
        )}
      </div>

      {/* Resources List — flat rows in single container */}
      {filteredResources.length === 0 ? (
        <div className="text-center py-8 bg-white dark:bg-portal-surface rounded-lg border border-gray-200 dark:border-portal-border">
          <IconFile className="mx-auto h-8 w-8 text-gray-400 dark:text-gray-500" />
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {canEdit ? 'No resources found. Click "Add" to create one.' : 'Resources will appear here.'}
          </p>
        </div>
      ) : groupedResources ? (
        /* Grouped view — accordion per category */
        <div className="bg-white dark:bg-portal-surface rounded-md border border-gray-200 dark:border-portal-border divide-y divide-gray-200 dark:divide-portal-border">
          {Object.entries(groupedResources).map(([categoryKey, { label, resources: categoryResources }]) => {
            const cat = categories.find(c => c.value === categoryKey)
            const CatIcon = cat?.icon || IconFile
            return (
              <ResourceCategoryAccordion key={categoryKey} label={label} count={categoryResources.length} icon={CatIcon}>
                <div className="divide-y divide-gray-100 dark:divide-portal-border/50">
                  {categoryResources.map(resource => renderResource(resource))}
                </div>
              </ResourceCategoryAccordion>
            )
          })}
        </div>
      ) : (
        /* Flat list */
        <div className="bg-white dark:bg-portal-surface rounded-md border border-gray-200 dark:border-portal-border divide-y divide-gray-100 dark:divide-portal-border">
          {filteredResources.map(resource => renderResource(resource))}
        </div>
      )}

      {/* Resource Viewer Modal */}
      {viewingResource && (
        <ResourceViewer
          resource={viewingResource}
          onClose={() => setViewingResource(null)}
        />
      )}
    </div>
  )
}