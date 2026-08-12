'use client'

import { useState, useEffect } from 'react'
import { IconGavel, IconSearch, IconPlus, IconEdit, IconTrash, IconDeviceFloppy, IconX, IconChevronDown } from '@tabler/icons-react'
import { Accordion, AccordionButton, AccordionPanel, AccordionChevron } from '@/components/ui/Accordion'
import { ContentItem } from '@/lib/content'
import { useRole } from '@/contexts/RoleContext'
import { JoditEditor } from '@/components/JoditEditor'
import { HTMLViewer } from '@/components/HTMLViewer'
import { ruleModificationsAPI } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { parseAPIError, sanitize, ValidationError } from '@/lib/errorHandling'
import { getFieldError } from '@/lib/portalValidation'

// Category group accordion for rule modifications
function RuleCategoryGroup({ category, count, color, children }: {
  category: string
  count: number
  color: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-start gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-portal-hover/50 transition-colors">
        <IconGavel className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${color}`}>{category}</span>
        <span className="text-[10px] text-gray-400 dark:text-gray-500">{count}</span>
        <IconChevronDown className={`h-3.5 w-3.5 text-gray-400 ml-auto transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && children}
    </div>
  )
}

interface RuleModificationsClientProps {
  modifications: ContentItem[]
  categories: string[]
}

export default function RuleModificationsClient({ modifications: initialModifications, categories: initialCategories }: RuleModificationsClientProps) {
  const { hasRole } = useRole()
  const { success, error, warning, info } = useToast()
  const [modifications, setModifications] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState('all')

  // Derive categories from loaded modifications (API data takes precedence)
  const categories = modifications.length > 0
    ? Array.from(new Set(modifications.map(mod => mod.category))).filter(Boolean).sort() as string[]
    : initialCategories
  const [sortField, setSortField] = useState<'title' | 'date' | 'category'>('title')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [searchTerm, setSearchTerm] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingData, setEditingData] = useState<any>(null)
  const [newModification, setNewModification] = useState({
    title: '',
    category: 'Club Tournament',
    summary: '',
    content: ''
  })
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])

  const canEdit = hasRole('executive')

  // Load rule modifications from API
  useEffect(() => {
    loadModifications()
  }, [])

  const loadModifications = async () => {
    try {
      const data = await ruleModificationsAPI.getAll()
      setModifications(data)
    } catch (err) {
      const errorMessage = parseAPIError(err)
      error(`Failed to load rule modifications: ${errorMessage}`)
    } finally {
      setIsLoading(false)
    }
  }

  // Filter modifications based on category and search term
  const filteredModifications = modifications.filter(mod => {
    const matchesCategory = selectedCategory === 'all' || mod.category === selectedCategory
    const matchesSearch = searchTerm === '' ||
      mod.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      mod.summary?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      mod.content?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      mod.body?.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesCategory && matchesSearch && mod.active !== false
  }).sort((a, b) => {
    let comparison = 0
    switch (sortField) {
      case 'title':
        comparison = (a.title || '').localeCompare(b.title || '')
        break
      case 'category': {
        const catCompare = (a.category || '').localeCompare(b.category || '')
        comparison = catCompare !== 0 ? catCompare : (a.title || '').localeCompare(b.title || '')
        break
      }
      case 'date':
        comparison = new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
        break
    }
    return sortDirection === 'asc' ? comparison : -comparison
  })

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      // Original categories
      'School League': 'bg-blue-100 text-blue-800',
      'School Tournament': 'bg-purple-100 text-purple-800',
      'Club League': 'bg-green-100 text-green-800',
      'Club Tournament': 'bg-orange-100 text-orange-800',
      'Adult': 'bg-yellow-100 text-yellow-800',
      // New categories
      'General': 'bg-gray-100 text-gray-800',
      'High School': 'bg-blue-100 text-blue-800',
      'Junior High': 'bg-indigo-100 text-indigo-800',
      'Elementary': 'bg-cyan-100 text-cyan-800',
      'League': 'bg-green-100 text-green-800',
      'Tournament': 'bg-orange-100 text-orange-800',
      '3x3': 'bg-pink-100 text-pink-800'
    }
    return colors[category] || 'bg-gray-100 text-gray-800'
  }

  const handleCreate = async () => {
    if (!newModification.title || !newModification.content) {
      error('Please fill in all required fields (title and content)')
      return
    }

    // Sanitize text inputs
    const sanitizedTitle = sanitize.text(newModification.title)
    const sanitizedSummary = sanitize.text(newModification.summary)
    const sanitizedContent = sanitize.html(newModification.content) // HTML from the rich-text editor

    try {
      const created = await ruleModificationsAPI.create({
        title: sanitizedTitle,
        category: newModification.category,
        summary: sanitizedSummary,
        content: sanitizedContent,
        active: true
      })
      setModifications([created, ...modifications])
      setNewModification({
        title: '',
        category: categories[0] || 'Club Tournament',
        summary: '',
        content: ''
      })
      setIsCreating(false)
      success('Rule modification created successfully!')
    } catch (err) {
      const errorMessage = parseAPIError(err)
      error(`Failed to create rule modification: ${errorMessage}`)
    }
  }

  const startEditing = (modification: any) => {
    setEditingId(modification.id)
    setEditingData({
      title: modification.title || '',
      category: modification.category || categories[0] || 'Club Tournament',
      summary: modification.summary || '',
      content: modification.content || modification.body || ''
    })
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditingData(null)
  }

  const handleSaveEdit = async () => {
    if (!editingId || !editingData) return

    // Sanitize text inputs
    const sanitizedUpdates = {
      title: sanitize.text(editingData.title),
      category: editingData.category,
      summary: sanitize.text(editingData.summary),
      content: sanitize.html(editingData.content)
    }

    try {
      const updated = await ruleModificationsAPI.update({ id: editingId, ...sanitizedUpdates })
      setModifications(prev => prev.map(mod =>
        mod.id === editingId ? updated : mod
      ))
      success('Rule modification updated successfully!')
      cancelEditing()
    } catch (err) {
      const errorMessage = parseAPIError(err)
      error(`Failed to update rule modification: ${errorMessage}`)
    }
  }

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this rule modification?')) {
      try {
        await ruleModificationsAPI.delete(id)
        setModifications(prev => prev.filter(mod => mod.id !== id))
        success('Rule modification deleted successfully!')
      } catch (err) {
        const errorMessage = parseAPIError(err)
        error(`Failed to delete rule modification: ${errorMessage}`)
      }
    }
  }

  return (
    <div className="px-1 py-3 sm:py-4 portal-animate">

      {/* Header — compact */}
      <div className="mb-3 flex items-center justify-between gap-2 px-2">
        <h1 className="text-xl sm:text-2xl font-bold font-heading tracking-tight text-gray-900 dark:text-white">Rule Modifications</h1>
        {canEdit && !isCreating && (
          <button
            onClick={() => {
              setIsCreating(true)
              const category = selectedCategory === 'all' ? (categories[0] || 'Club Tournament') : selectedCategory
              setNewModification({ title: '', category, summary: '', content: '' })
            }}
            className="bg-orange-500 text-white px-3 py-1.5 rounded-lg hover:bg-orange-600 flex items-center gap-1.5 text-sm flex-shrink-0"
          >
            <IconPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Add Rule</span>
            <span className="sm:hidden">Add</span>
          </button>
        )}
      </div>

      {/* Search only */}
      <div className="mb-3 px-2 relative">
        <IconSearch className="absolute left-4.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <input
          type="text"
          placeholder="Search rules..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-portal-border rounded-md bg-white dark:bg-portal-surface text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
      </div>

      {/* Create New Rule Form */}
      {isCreating && (
        <div className="mb-6 bg-white dark:bg-portal-surface rounded-md border border-gray-200 dark:border-portal-border p-3 sm:p-4">
          <h2 className="text-lg sm:text-xl font-semibold mb-4 text-gray-900 dark:text-white">Add New Rule Modification</h2>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title *</label>
                <input
                  type="text"
                  value={newModification.title}
                  onChange={(e) => setNewModification({...newModification, title: e.target.value})}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 bg-white dark:bg-portal-surface text-gray-900 dark:text-white ${
                    getFieldError(validationErrors, 'title')
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-gray-300 dark:border-portal-border focus:ring-orange-500'
                  }`}
                  placeholder="Rule title..."
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
                  value={newModification.category}
                  onChange={(e) => setNewModification({...newModification, category: e.target.value})}
                  className="w-full pl-3 pr-8 py-2 border border-gray-300 dark:border-portal-border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-portal-surface text-gray-900 dark:text-white"
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Summary</label>
              <input
                type="text"
                value={newModification.summary}
                onChange={(e) => setNewModification({...newModification, summary: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 dark:border-portal-border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-portal-surface text-gray-900 dark:text-white"
                placeholder="Brief summary..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Content *</label>
              <JoditEditor
                value={newModification.content}
                onChange={(value) => setNewModification({...newModification, content: value || ''})}
              />
              {getFieldError(validationErrors, 'content') && (
                <p className="mt-1 text-sm text-red-600">
                  {getFieldError(validationErrors, 'content')}
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleCreate}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
              >
                <IconDeviceFloppy className="h-5 w-5" />
                Save Rule Modification
              </button>
              <button
                onClick={() => {
                  setIsCreating(false)
                  setNewModification({
                    title: '',
                    category: categories[0] || 'Club Tournament',
                    summary: '',
                    content: ''
                  })
                }}
                className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-lg hover:bg-gray-400 flex items-center justify-center gap-2"
              >
                <IconX className="h-5 w-5" />
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rule Modifications — grouped by category in accordions */}
      {filteredModifications.length > 0 ? (
        <div className="px-2">
          {(() => {
            // Group by category
            const grouped: Record<string, typeof filteredModifications> = {}
            filteredModifications.forEach(mod => {
              const cat = mod.category || 'Uncategorized'
              if (!grouped[cat]) grouped[cat] = []
              grouped[cat].push(mod)
            })

            return (
              <div className="bg-white dark:bg-portal-surface rounded-md border border-gray-200 dark:border-portal-border divide-y divide-gray-200 dark:divide-portal-border">
                {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([category, mods]) => (
                  <RuleCategoryGroup key={category} category={category} count={mods.length} color={getCategoryColor(category)}>
                    <div className="divide-y divide-gray-100 dark:divide-portal-border/50">
                      {mods.sort((a, b) => (a.title || '').localeCompare(b.title || '')).map(modification => {
                        if (editingId === modification.id && editingData) {
                          return (
                            <div key={modification.id} className="p-3 sm:p-4">
                              <div className="space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                                    <input type="text" value={editingData.title} onChange={(e) => setEditingData({ ...editingData, title: e.target.value })}
                                      className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-portal-border rounded-md focus:outline-none focus:ring-1 focus:ring-orange-500 bg-white dark:bg-portal-surface text-gray-900 dark:text-white" />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
                                    <select value={editingData.category} onChange={(e) => setEditingData({ ...editingData, category: e.target.value })}
                                      className="w-full pl-3 pr-8 py-1.5 text-sm border border-gray-300 dark:border-portal-border rounded-md focus:outline-none focus:ring-1 focus:ring-orange-500 bg-white dark:bg-portal-surface text-gray-900 dark:text-white">
                                      {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                    </select>
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Summary</label>
                                  <input type="text" value={editingData.summary} onChange={(e) => setEditingData({ ...editingData, summary: e.target.value })}
                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-portal-border rounded-md focus:outline-none focus:ring-1 focus:ring-orange-500 bg-white dark:bg-portal-surface text-gray-900 dark:text-white" />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Content</label>
                                  <JoditEditor value={editingData.content} onChange={(value) => setEditingData({ ...editingData, content: value || '' })} />
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={handleSaveEdit} className="bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700 flex items-center gap-1.5 text-sm">
                                    <IconDeviceFloppy className="h-4 w-4" /> Save
                                  </button>
                                  <button onClick={cancelEditing} className="text-gray-600 dark:text-gray-400 px-3 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-portal-hover text-sm">
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            </div>
                          )
                        }

                        return (
                          <Accordion key={modification.id}>
                            <div>
                              <div className="flex items-center gap-2 py-2 pr-3">
                                <AccordionButton className="flex items-center gap-2 flex-1 min-w-0 pl-3">
                                  {({ open }) => (
                                    <>
                                      <AccordionChevron open={open} className="flex-shrink-0" />
                                      <div className="flex-1 min-w-0 text-left">
                                        <h3 className="font-medium text-sm text-gray-900 dark:text-white leading-snug">
                                          {modification.title}
                                        </h3>
                                        {modification.summary && (
                                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{modification.summary}</p>
                                        )}
                                      </div>
                                    </>
                                  )}
                                </AccordionButton>
                                {canEdit && (
                                  <div className="flex gap-0.5 flex-shrink-0">
                                    <button onClick={() => startEditing(modification)} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded hidden sm:block" title="Edit">
                                      <IconEdit className="h-3.5 w-3.5" />
                                    </button>
                                    <button onClick={() => handleDelete(modification.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded hidden sm:block" title="Delete">
                                      <IconTrash className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                              <AccordionPanel className="border-t border-gray-100 dark:border-portal-border/50 bg-gray-50 dark:bg-portal-surface/50">
                                <div className="py-3 px-4">
                                  <HTMLViewer content={modification.content || modification.body || ''} compact />
                                  {canEdit && (
                                    <div className="flex gap-2 mt-3 pt-2 border-t border-gray-200 dark:border-portal-border sm:hidden">
                                      <button onClick={() => startEditing(modification)} className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Edit</button>
                                      <button onClick={() => handleDelete(modification.id)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
                                    </div>
                                  )}
                                </div>
                              </AccordionPanel>
                            </div>
                          </Accordion>
                        )
                      })}
                    </div>
                  </RuleCategoryGroup>
                ))}
              </div>
            )
          })()}
        </div>
      ) : (
        <div className="text-center py-8 mx-2 bg-white dark:bg-portal-surface rounded-md border border-gray-200 dark:border-portal-border">
          <IconGavel className="mx-auto h-8 w-8 text-gray-400" />
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {searchTerm ? `No rules match "${searchTerm}"` : canEdit ? 'Click "Add Rule" to create one.' : 'Rule modifications will appear here.'}
          </p>
        </div>
      )}
    </div>
  )
}