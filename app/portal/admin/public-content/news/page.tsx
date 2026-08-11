'use client'

import { useState, useEffect } from 'react'
import { IconArticle, IconCalendar, IconSearch, IconPlus, IconEdit, IconTrash, IconDeviceFloppy, IconX, IconStar, IconEye, IconEyeOff } from '@tabler/icons-react'
import { useRole } from '@/contexts/RoleContext'
import { JoditEditor } from '@/components/JoditEditor'
import { HTMLViewer } from '@/components/HTMLViewer'
import { publicNewsAPI } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { parseAPIError, sanitize, ValidationError } from '@/lib/errorHandling'
import { getFieldError } from '@/lib/portalValidation'
import type { PublicNewsItem } from '@/types/publicContent'

export default function PublicNewsAdmin() {
  const { user } = useRole()
  const { success, error, warning, info } = useToast()
  const [newsItems, setNewsItems] = useState<PublicNewsItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingArticle, setEditingArticle] = useState<{
    title: string
    slug: string
    published_date: string
    author: string
    image_url: string
    excerpt: string
    body: string
    featured: boolean
    tags: string
    active: boolean
    priority: number
  } | null>(null)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [newArticle, setNewArticle] = useState({
    title: '',
    slug: '',
    published_date: new Date().toISOString().split('T')[0],
    author: user?.name || '',
    image_url: '',
    excerpt: '',
    body: '',
    featured: false,
    tags: '',
    active: true,
    priority: 0
  })
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])

  const canEdit = user.role === 'admin' || user.role === 'executive'

  // Load news items from API
  useEffect(() => {
    loadNews()
  }, [])

  const loadNews = async () => {
    try {
      const data = await publicNewsAPI.getAll()
      setNewsItems(data)
    } catch (err) {
      const errorMessage = parseAPIError(err)
      error(`Failed to load news articles: ${errorMessage}`)
    } finally {
      setIsLoading(false)
    }
  }

  // Filter news based on search term
  const filteredNews = newsItems.filter(item => {
    const matchesSearch = searchTerm === '' ||
      item.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.excerpt?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.body?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.author?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.tags?.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
    return matchesSearch
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

  const startEditing = (article: PublicNewsItem) => {
    setEditingId(article.id)
    setEditingArticle({
      title: article.title || '',
      slug: article.slug || '',
      published_date: article.published_date ? new Date(article.published_date).toISOString().split('T')[0] : '',
      author: article.author || '',
      image_url: article.image_url || '',
      excerpt: article.excerpt || '',
      body: article.body || '',
      featured: article.featured || false,
      tags: article.tags?.join(', ') || '',
      active: article.active ?? true,
      priority: article.priority || 0
    })
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditingArticle(null)
  }

  const handleCreate = async () => {
    if (!newArticle.title || !newArticle.excerpt || !newArticle.body) {
      error('Please fill in all required fields (title, excerpt, and body)')
      return
    }

    // Sanitize inputs
    const sanitizedTitle = sanitize.text(newArticle.title)
    const sanitizedSlug = newArticle.slug || generateSlug(newArticle.title)
    const sanitizedAuthor = sanitize.text(newArticle.author)
    const sanitizedExcerpt = sanitize.text(newArticle.excerpt)
    const sanitizedBody = sanitize.html(newArticle.body)
    const sanitizedImageUrl = sanitize.text(newArticle.image_url)

    try {
      const created = await publicNewsAPI.create({
        title: sanitizedTitle,
        slug: sanitizedSlug,
        published_date: newArticle.published_date,
        author: sanitizedAuthor,
        image_url: sanitizedImageUrl || undefined,
        excerpt: sanitizedExcerpt,
        body: sanitizedBody,
        featured: newArticle.featured,
        tags: newArticle.tags ? newArticle.tags.split(',').map(t => t.trim()) : [],
        active: newArticle.active,
        priority: newArticle.priority
      })
      setNewsItems([created, ...newsItems])
      setNewArticle({
        title: '',
        slug: '',
        published_date: new Date().toISOString().split('T')[0],
        author: user?.name || '',
        image_url: '',
        excerpt: '',
        body: '',
        featured: false,
        tags: '',
        active: true,
        priority: 0
      })
      setIsCreating(false)
      success('News article created successfully!')
    } catch (err) {
      const errorMessage = parseAPIError(err)
      error(`Failed to create news article: ${errorMessage}`)
    }
  }

  const handleSaveEdit = async () => {
    if (!editingId || !editingArticle) return

    if (!editingArticle.title || !editingArticle.excerpt || !editingArticle.body) {
      error('Please fill in all required fields (title, excerpt, and body)')
      return
    }

    // Sanitize inputs
    const sanitizedData = {
      id: editingId,
      title: sanitize.text(editingArticle.title),
      slug: editingArticle.slug || generateSlug(editingArticle.title),
      published_date: editingArticle.published_date,
      author: sanitize.text(editingArticle.author),
      image_url: editingArticle.image_url ? sanitize.text(editingArticle.image_url) : undefined,
      excerpt: sanitize.text(editingArticle.excerpt),
      body: sanitize.html(editingArticle.body),
      featured: editingArticle.featured,
      tags: editingArticle.tags ? editingArticle.tags.split(',').map((t: string) => t.trim()) : [],
      active: editingArticle.active,
      priority: editingArticle.priority
    }

    try {
      const updated = await publicNewsAPI.update(sanitizedData)
      setNewsItems(prev => prev.map(item =>
        item.id === editingId ? updated : item
      ))
      setEditingId(null)
      setEditingArticle(null)
      success('News article updated successfully!')
    } catch (err) {
      const errorMessage = parseAPIError(err)
      error(`Failed to update news article: ${errorMessage}`)
    }
  }

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this news article?')) {
      try {
        await publicNewsAPI.delete(id)
        setNewsItems(prev => prev.filter(item => item.id !== id))
        success('News article deleted successfully!')
      } catch (err) {
        const errorMessage = parseAPIError(err)
        error(`Failed to delete news article: ${errorMessage}`)
      }
    }
  }

  return (
    <div className="py-5 sm:py-6">

      {/* Header */}
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Public News Articles</h1>
          <p className="mt-1 sm:mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-300">
            Manage news articles displayed on the public website
          </p>
        </div>
        {canEdit && !isCreating && (
          <button
            onClick={() => {
              setIsCreating(true)
              setNewArticle({
                title: '',
                slug: '',
                published_date: new Date().toISOString().split('T')[0],
                author: user?.name || '',
                image_url: '',
                excerpt: '',
                body: '',
                featured: false,
                tags: '',
                active: true,
                priority: 0
              })
            }}
            className="bg-orange-500 text-white px-3 py-2 sm:px-4 rounded-lg hover:bg-orange-600 flex items-center gap-2 text-sm sm:text-base"
          >
            <IconPlus className="h-5 w-5" />
            Add News Article
          </button>
        )}
      </div>

      {/* Search */}
      <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow p-3 sm:p-4">
        <div className="flex-1 min-w-0">
          <input
            type="text"
            placeholder="Search news articles..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 text-sm sm:text-base border border-gray-300 dark:border-gray-700 rounded-md focus:outline-none focus:ring-orange-500 focus:border-orange-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>
      </div>

      {/* Create New Article Form */}
      {isCreating && (
        <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-semibold mb-4 text-gray-900 dark:text-white">Add New News Article</h2>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title *</label>
                <input
                  type="text"
                  value={newArticle.title}
                  onChange={(e) => {
                    setNewArticle({...newArticle, title: e.target.value, slug: generateSlug(e.target.value)})
                  }}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                    getFieldError(validationErrors, 'title')
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-gray-300 dark:border-gray-600 focus:ring-orange-500'
                  }`}
                  placeholder="Article title..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Slug (URL-friendly)</label>
                <input
                  type="text"
                  value={newArticle.slug}
                  onChange={(e) => setNewArticle({...newArticle, slug: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="auto-generated-from-title"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Author *</label>
                <input
                  type="text"
                  value={newArticle.author}
                  onChange={(e) => setNewArticle({...newArticle, author: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Author name..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Published Date *</label>
                <input
                  type="date"
                  value={newArticle.published_date}
                  onChange={(e) => setNewArticle({...newArticle, published_date: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Image URL</label>
              <input
                type="text"
                value={newArticle.image_url}
                onChange={(e) => setNewArticle({...newArticle, image_url: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="https://example.com/image.jpg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Excerpt (Summary) *</label>
              <textarea
                value={newArticle.excerpt}
                onChange={(e) => setNewArticle({...newArticle, excerpt: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                rows={3}
                placeholder="Brief summary of the article..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Body Content *</label>
              <JoditEditor
                value={newArticle.body}
                onChange={(value) => setNewArticle({...newArticle, body: value || ''})}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={newArticle.tags}
                  onChange={(e) => setNewArticle({...newArticle, tags: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="news, basketball, training"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label>
                <input
                  type="number"
                  value={newArticle.priority}
                  onChange={(e) => setNewArticle({...newArticle, priority: parseInt(e.target.value)})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="0"
                />
              </div>
            </div>

            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={newArticle.featured}
                  onChange={(e) => setNewArticle({...newArticle, featured: e.target.checked})}
                  className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Featured Article</span>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={newArticle.active}
                  onChange={(e) => setNewArticle({...newArticle, active: e.target.checked})}
                  className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Active (Visible)</span>
              </label>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleCreate}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
              >
                <IconDeviceFloppy className="h-5 w-5" />
                Save Article
              </button>
              <button
                onClick={() => {
                  setIsCreating(false)
                  setNewArticle({
                    title: '',
                    slug: '',
                    published_date: new Date().toISOString().split('T')[0],
                    author: user?.name || '',
                    image_url: '',
                    excerpt: '',
                    body: '',
                    featured: false,
                    tags: '',
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

      {/* News Articles List */}
      {filteredNews.length > 0 ? (
        <div className="space-y-3 sm:space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {newsItems.length} Article{newsItems.length !== 1 ? 's' : ''}
          </h2>

          {filteredNews.map((article) => {
            const isExpanded = expandedItems.has(article.id)
            const isEditing = editingId === article.id
            const publishedDate = new Date(article.published_date).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })

            if (isEditing && editingArticle) {
              return (
                <div key={article.id} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
                  <h3 className="text-lg sm:text-xl font-semibold mb-4 text-gray-900 dark:text-white">Edit News Article</h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title *</label>
                        <input
                          type="text"
                          value={editingArticle.title}
                          onChange={(e) => setEditingArticle({...editingArticle, title: e.target.value, slug: generateSlug(e.target.value)})}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Slug</label>
                        <input
                          type="text"
                          value={editingArticle.slug}
                          onChange={(e) => setEditingArticle({...editingArticle, slug: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Author *</label>
                        <input
                          type="text"
                          value={editingArticle.author}
                          onChange={(e) => setEditingArticle({...editingArticle, author: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Published Date *</label>
                        <input
                          type="date"
                          value={editingArticle.published_date}
                          onChange={(e) => setEditingArticle({...editingArticle, published_date: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Image URL</label>
                      <input
                        type="text"
                        value={editingArticle.image_url}
                        onChange={(e) => setEditingArticle({...editingArticle, image_url: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Excerpt *</label>
                      <textarea
                        value={editingArticle.excerpt}
                        onChange={(e) => setEditingArticle({...editingArticle, excerpt: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        rows={3}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Body Content *</label>
                      <JoditEditor
                        value={editingArticle.body}
                        onChange={(value) => setEditingArticle({...editingArticle, body: value || ''})}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tags (comma-separated)</label>
                        <input
                          type="text"
                          value={editingArticle.tags}
                          onChange={(e) => setEditingArticle({...editingArticle, tags: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label>
                        <input
                          type="number"
                          value={editingArticle.priority}
                          onChange={(e) => setEditingArticle({...editingArticle, priority: parseInt(e.target.value) || 0})}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={editingArticle.featured}
                          onChange={(e) => setEditingArticle({...editingArticle, featured: e.target.checked})}
                          className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                        />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Featured</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={editingArticle.active}
                          onChange={(e) => setEditingArticle({...editingArticle, active: e.target.checked})}
                          className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                        />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Active</span>
                      </label>
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
                        className="bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 flex items-center justify-center gap-2"
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
                key={article.id}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
              >
                {/* Article Header */}
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    {article.image_url && (
                      <img
                        src={article.image_url}
                        alt={article.title}
                        className="w-20 h-20 object-cover rounded"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            {article.featured && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300">
                                <IconStar className="h-3 w-3" />
                                Featured
                              </span>
                            )}
                            {!article.active && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300">
                                <IconEyeOff className="h-3 w-3" />
                                Hidden
                              </span>
                            )}
                          </div>
                          <h3 className="font-semibold text-gray-900 dark:text-white text-base sm:text-lg">
                            {article.title}
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            By {article.author} on {publishedDate}
                          </p>
                          {article.tags && article.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {article.tags.map((tag, idx) => (
                                <span key={idx} className="px-2 py-0.5 bg-blue-900/30 text-blue-400 rounded text-xs">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {canEdit && (
                          <div className="flex gap-1 flex-shrink-0">
                            <button
                              onClick={() => startEditing(article)}
                              className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                              title="Edit"
                            >
                              <IconEdit className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(article.id)}
                              className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                              title="Delete"
                            >
                              <IconTrash className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                        {article.excerpt}
                      </p>

                      <button
                        onClick={() => toggleExpanded(article.id)}
                        className="mt-2 text-sm text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 font-medium"
                      >
                        {isExpanded ? 'Hide' : 'Show'} full article
                      </button>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <HTMLViewer content={article.body} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow">
          <IconArticle className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No news articles found</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {searchTerm
              ? `No articles match "${searchTerm}"`
              : canEdit
                ? 'Click "Add News Article" to create your first article.'
                : 'News articles will appear here once added by administrators.'}
          </p>
        </div>
      )}
    </div>
  )
}
