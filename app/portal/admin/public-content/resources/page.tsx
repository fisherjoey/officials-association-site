'use client'

import { useState, useEffect } from 'react'
import { IconFileDescription, IconSearch, IconPlus, IconEdit, IconTrash, IconDeviceFloppy, IconX, IconDownload, IconEyeOff, IconFolder } from '@tabler/icons-react'
import { useRole } from '@/contexts/RoleContext'
import { JoditEditor } from '@/components/JoditEditor'
import { HTMLViewer } from '@/components/HTMLViewer'
import { publicResourcesAPI } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { parseAPIError, sanitize, ValidationError } from '@/lib/errorHandling'
import { getFieldError } from '@/lib/portalValidation'
import type { PublicResource } from '@/types/publicContent'

export default function PublicResourcesAdmin() {
  const { hasRole } = useRole()
  const { success, error, warning, info } = useToast()
  const [resources, setResources] = useState<PublicResource[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingResource, setEditingResource] = useState<{
    title: string
    slug: string
    category: string
    description: string
    file_url: string
    file_type: string
    file_size: string
    active: boolean
    priority: number
  } | null>(null)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [newResource, setNewResource] = useState({
    title: '',
    slug: '',
    category: 'Rules & Regulations',
    description: '',
    file_url: '',
    file_type: 'PDF',
    file_size: '',
    active: true,
    priority: 0
  })
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])

  const canEdit = hasRole('executive')

  const categories = [
    'Rules & Regulations',
    'Training Materials',
    'Forms & Documents',
    'Guides & Manuals',
    'Other'
  ]

  // Load resources from API
  useEffect(() => {
    loadResources()
  }, [])

  const loadResources = async () => {
    try {
      const data = await publicResourcesAPI.getAll()
      setResources(data)
    } catch (err) {
      const errorMessage = parseAPIError(err)
      error(`Failed to load resources: ${errorMessage}`)
    } finally {
      setIsLoading(false)
    }
  }

  // Filter resources based on category and search term
  const filteredResources = resources.filter(item => {
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory
    const matchesSearch = searchTerm === '' ||
      item.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.category?.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesCategory && matchesSearch
  })

  // Auto-generate slug from title
  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
  }

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedItems)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedItems(newExpanded)
  }

  const startEditing = (resource: PublicResource) => {
    setEditingId(resource.id)
    setEditingResource({
      title: resource.title || '',
      slug: resource.slug || '',
      category: resource.category || 'Rules & Regulations',
      description: resource.description || '',
      file_url: resource.file_url || '',
      file_type: resource.file_type || 'PDF',
      file_size: resource.file_size || '',
      active: resource.active ?? true,
      priority: resource.priority || 0
    })
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditingResource(null)
  }

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'Rules & Regulations': 'bg-blue-100 text-blue-800',
      'Training Materials': 'bg-green-100 text-green-800',
      'Forms & Documents': 'bg-purple-100 text-purple-800',
      'Guides & Manuals': 'bg-orange-100 text-orange-800',
      'Other': 'bg-gray-100 text-gray-800'
    }
    return colors[category] || 'bg-gray-100 text-gray-800'
  }

  const handleCreate = async () => {
    if (!newResource.title || !newResource.file_url) {
      error('Please fill in all required fields (title and file URL)')
      return
    }

    // Sanitize inputs
    const sanitizedTitle = sanitize.text(newResource.title)
    const sanitizedSlug = newResource.slug || generateSlug(newResource.title)
    const sanitizedDescription = sanitize.html(newResource.description)
    const sanitizedFileUrl = sanitize.text(newResource.file_url)
    const sanitizedFileSize = sanitize.text(newResource.file_size)

    try {
      const created = await publicResourcesAPI.create({
        title: sanitizedTitle,
        slug: sanitizedSlug,
        category: newResource.category,
        description: sanitizedDescription,
        file_url: sanitizedFileUrl,
        file_type: newResource.file_type,
        file_size: sanitizedFileSize || undefined,
        active: newResource.active,
        priority: newResource.priority
      })
      setResources([created, ...resources])
      setNewResource({
        title: '',
        slug: '',
        category: 'Rules & Regulations',
        description: '',
        file_url: '',
        file_type: 'PDF',
        file_size: '',
        active: true,
        priority: 0
      })
      setIsCreating(false)
      success('Resource created successfully!')
    } catch (err) {
      const errorMessage = parseAPIError(err)
      error(`Failed to create resource: ${errorMessage}`)
    }
  }

  const handleSaveEdit = async () => {
    if (!editingId || !editingResource) return

    if (!editingResource.title || !editingResource.file_url) {
      error('Please fill in all required fields (title and file URL)')
      return
    }

    // Sanitize inputs
    const sanitizedData = {
      id: editingId,
      title: sanitize.text(editingResource.title),
      slug: editingResource.slug || generateSlug(editingResource.title),
      category: editingResource.category,
      description: sanitize.html(editingResource.description),
      file_url: sanitize.text(editingResource.file_url),
      file_type: editingResource.file_type,
      file_size: editingResource.file_size ? sanitize.text(editingResource.file_size) : undefined,
      active: editingResource.active,
      priority: editingResource.priority
    }

    try {
      const updated = await publicResourcesAPI.update(sanitizedData)
      setResources(prev => prev.map(item =>
        item.id === editingId ? updated : item
      ))
      setEditingId(null)
      setEditingResource(null)
      success('Resource updated successfully!')
    } catch (err) {
      const errorMessage = parseAPIError(err)
      error(`Failed to update resource: ${errorMessage}`)
    }
  }

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this resource?')) {
      try {
        await publicResourcesAPI.delete(id)
        setResources(prev => prev.filter(item => item.id !== id))
        success('Resource deleted successfully!')
      } catch (err) {
        const errorMessage = parseAPIError(err)
        error(`Failed to delete resource: ${errorMessage}`)
      }
    }
  }

  return (
    <div className="py-5 sm:py-6 portal-animate">

      {/* Header */}
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold font-heading tracking-tight text-gray-900">Public Resources</h1>
          <p className="mt-1 sm:mt-2 text-sm sm:text-base text-gray-600">
            Manage downloadable resources displayed on the public website
          </p>
        </div>
        {canEdit && !isCreating && (
          <button
            onClick={() => {
              setIsCreating(true)
              setNewResource({
                title: '',
                slug: '',
                category: selectedCategory === 'all' ? 'Rules & Regulations' : selectedCategory,
                description: '',
                file_url: '',
                file_type: 'PDF',
                file_size: '',
                active: true,
                priority: 0
              })
            }}
            className="bg-orange-500 text-white px-3 py-2 sm:px-4 rounded-lg hover:bg-orange-600 flex items-center gap-2 text-sm sm:text-base"
          >
            <IconPlus className="h-5 w-5" />
            Add Resource
          </button>
        )}
      </div>

      {/* Search and Category Filter */}
      <div className="mb-6 bg-white rounded-lg border border-gray-200 dark:border-portal-border p-3 sm:p-4">
        <div className="flex-1 min-w-0">
          <input
            type="text"
            placeholder="Search resources..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 text-sm sm:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-orange-500 focus:border-orange-500"
          />
        </div>

        <div className="mt-3 sm:mt-4 flex flex-wrap gap-1.5 sm:gap-2">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-2 sm:px-3 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm flex items-center gap-1 sm:gap-2 ${
              selectedCategory === 'all'
                ? 'bg-orange-500 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            <IconFileDescription className="h-3 w-3 sm:h-4 sm:w-4" />
            All Categories
          </button>
          {categories.map(category => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-2 sm:px-3 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm ${
                selectedCategory === category
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Create New Resource Form */}
      {isCreating && (
        <div className="mb-6 bg-white rounded-lg border border-gray-200 dark:border-portal-border p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-semibold mb-4">Add New Resource</h2>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={newResource.title}
                  onChange={(e) => {
                    setNewResource({...newResource, title: e.target.value, slug: generateSlug(e.target.value)})
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Resource title..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Slug (URL-friendly)</label>
                <input
                  type="text"
                  value={newResource.slug}
                  onChange={(e) => setNewResource({...newResource, slug: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="auto-generated-from-title"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                <select
                  value={newResource.category}
                  onChange={(e) => setNewResource({...newResource, category: e.target.value})}
                  className="w-full pl-3 pr-8 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">File Type</label>
                <select
                  value={newResource.file_type}
                  onChange={(e) => setNewResource({...newResource, file_type: e.target.value})}
                  className="w-full pl-3 pr-8 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="PDF">PDF</option>
                  <option value="DOC">Word Document</option>
                  <option value="XLS">Excel Spreadsheet</option>
                  <option value="PPT">PowerPoint</option>
                  <option value="ZIP">ZIP Archive</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">File URL *</label>
              <input
                type="url"
                value={newResource.file_url}
                onChange={(e) => setNewResource({...newResource, file_url: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="https://example.com/file.pdf"
              />
              <p className="mt-1 text-xs text-gray-500">URL to the file in your storage (Supabase, Netlify, etc.)</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">File Size (e.g., "2.5 MB")</label>
              <input
                type="text"
                value={newResource.file_size}
                onChange={(e) => setNewResource({...newResource, file_size: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="2.5 MB"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <JoditEditor
                value={newResource.description}
                onChange={(value) => setNewResource({...newResource, description: value || ''})}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <input
                  type="number"
                  value={newResource.priority}
                  onChange={(e) => setNewResource({...newResource, priority: parseInt(e.target.value)})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="0"
                />
              </div>

              <div className="flex items-end">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newResource.active}
                    onChange={(e) => setNewResource({...newResource, active: e.target.checked})}
                    className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Active (Visible on website)</span>
                </label>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleCreate}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
              >
                <IconDeviceFloppy className="h-5 w-5" />
                Save Resource
              </button>
              <button
                onClick={() => {
                  setIsCreating(false)
                  setNewResource({
                    title: '',
                    slug: '',
                    category: 'Rules & Regulations',
                    description: '',
                    file_url: '',
                    file_type: 'PDF',
                    file_size: '',
                    active: true,
                    priority: 0
                  })
                }}
                className="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 flex items-center justify-center gap-2"
              >
                <IconX className="h-5 w-5" />
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resources List */}
      {filteredResources.length > 0 ? (
        <div className="space-y-3 sm:space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {selectedCategory === 'all' ? 'All Resources' : `${selectedCategory}`}
            <span className="text-gray-500 ml-2">({filteredResources.length})</span>
          </h2>

          {filteredResources.map((resource) => {
            const isExpanded = expandedItems.has(resource.id)
            const isEditing = editingId === resource.id

            if (isEditing && editingResource) {
              return (
                <div key={resource.id} className="bg-white rounded-lg border border-gray-200 dark:border-portal-border p-4 sm:p-6">
                  <h3 className="text-lg sm:text-xl font-semibold mb-4">Edit Resource</h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                        <input
                          type="text"
                          value={editingResource.title}
                          onChange={(e) => setEditingResource({...editingResource, title: e.target.value, slug: generateSlug(e.target.value)})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
                        <input
                          type="text"
                          value={editingResource.slug}
                          onChange={(e) => setEditingResource({...editingResource, slug: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                        <select
                          value={editingResource.category}
                          onChange={(e) => setEditingResource({...editingResource, category: e.target.value})}
                          className="w-full pl-3 pr-8 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        >
                          {categories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">File Type</label>
                        <select
                          value={editingResource.file_type}
                          onChange={(e) => setEditingResource({...editingResource, file_type: e.target.value})}
                          className="w-full pl-3 pr-8 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        >
                          <option value="PDF">PDF</option>
                          <option value="DOC">Word Document</option>
                          <option value="XLS">Excel Spreadsheet</option>
                          <option value="PPT">PowerPoint</option>
                          <option value="ZIP">ZIP Archive</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">File URL *</label>
                      <input
                        type="url"
                        value={editingResource.file_url}
                        onChange={(e) => setEditingResource({...editingResource, file_url: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">File Size</label>
                      <input
                        type="text"
                        value={editingResource.file_size}
                        onChange={(e) => setEditingResource({...editingResource, file_size: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                      <JoditEditor
                        value={editingResource.description}
                        onChange={(value) => setEditingResource({...editingResource, description: value || ''})}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                        <input
                          type="number"
                          value={editingResource.priority}
                          onChange={(e) => setEditingResource({...editingResource, priority: parseInt(e.target.value) || 0})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>

                      <div className="flex items-end">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={editingResource.active}
                            onChange={(e) => setEditingResource({...editingResource, active: e.target.checked})}
                            className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                          />
                          <span className="text-sm font-medium text-gray-700">Active</span>
                        </label>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        onClick={handleSaveEdit}
                        className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
                      >
                        <IconDeviceFloppy className="h-5 w-5" />
                        Save Changes
                      </button>
                      <button
                        onClick={cancelEditing}
                        className="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 flex items-center justify-center gap-2"
                      >
                        <IconX className="h-5 w-5" />
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )
            }

            return (
              <div
                key={resource.id}
                className="bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
              >
                {/* Resource Header */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${getCategoryColor(resource.category)}`}>
                          <IconFolder className="inline h-3 w-3 mr-1" />
                          {resource.category}
                        </span>
                        {!resource.active && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                            <IconEyeOff className="h-3 w-3" />
                            Hidden
                          </span>
                        )}
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                          {resource.file_type}
                        </span>
                        {resource.file_size && (
                          <span className="text-xs text-gray-500">
                            {resource.file_size}
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold text-gray-900 text-base sm:text-lg">
                        {resource.title}
                      </h3>

                      {resource.description && (
                        <>
                          <button
                            onClick={() => toggleExpanded(resource.id)}
                            className="mt-2 text-sm text-orange-600 hover:text-orange-700 font-medium"
                          >
                            {isExpanded ? 'Hide' : 'Show'} description
                          </button>

                          {isExpanded && (
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <div className="prose prose-sm max-w-none">
                                <HTMLViewer content={resource.description} />
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      <a
                        href={resource.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-700 font-medium"
                      >
                        <IconDownload className="h-4 w-4" />
                        Download File
                      </a>
                    </div>

                    {canEdit && (
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => startEditing(resource)}
                          className="p-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                          title="Edit"
                        >
                          <IconEdit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(resource.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Delete"
                        >
                          <IconTrash className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200 dark:border-portal-border">
          <IconFileDescription className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No resources found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchTerm
              ? `No resources match "${searchTerm}"`
              : selectedCategory === 'all'
                ? canEdit ? 'Click "Add Resource" to create your first resource.' : 'Resources will appear here once added by administrators.'
                : `No resources found for "${selectedCategory}".`}
          </p>
        </div>
      )}
    </div>
  )
}
