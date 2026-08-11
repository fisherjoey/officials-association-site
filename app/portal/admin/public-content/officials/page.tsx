'use client'

import { useState, useEffect } from 'react'
import { IconUserCheck, IconSearch, IconPlus, IconEdit, IconTrash, IconDeviceFloppy, IconX, IconEyeOff, IconMedal } from '@tabler/icons-react'
import { useRole } from '@/contexts/RoleContext'
import { JoditEditor } from '@/components/JoditEditor'
import { HTMLViewer } from '@/components/HTMLViewer'
import { officialsAPI } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { parseAPIError, sanitize, ValidationError } from '@/lib/errorHandling'
import { getFieldError } from '@/lib/portalValidation'
import type { Official } from '@/types/publicContent'

export default function PublicOfficialsAdmin() {
  const { user } = useRole()
  const { success, error, warning, info } = useToast()
  const [officials, setOfficials] = useState<Official[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedLevel, setSelectedLevel] = useState<number | 'all'>('all')
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingOfficial, setEditingOfficial] = useState<{
    name: string
    email: string
    phone: string
    photo_url: string
    level: number
    years_experience: number
    bio: string
    certifications: string
    active: boolean
    priority: number
  } | null>(null)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [newOfficial, setNewOfficial] = useState({
    name: '',
    email: '',
    phone: '',
    photo_url: '',
    level: 1,
    years_experience: 0,
    bio: '',
    certifications: '',
    active: true,
    priority: 0
  })
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])

  const canEdit = user.role === 'admin' || user.role === 'executive'

  const levels = [1, 2, 3, 4, 5]

  // Load officials from API
  useEffect(() => {
    loadOfficials()
  }, [])

  const loadOfficials = async () => {
    try {
      const data = await officialsAPI.getAll()
      setOfficials(data)
    } catch (err) {
      const errorMessage = parseAPIError(err)
      error(`Failed to load officials: ${errorMessage}`)
    } finally {
      setIsLoading(false)
    }
  }

  // Filter officials based on level and search term
  const filteredOfficials = officials.filter(item => {
    const matchesLevel = selectedLevel === 'all' || item.level === selectedLevel
    const matchesSearch = searchTerm === '' ||
      item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.bio?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.certifications?.some(cert => cert.toLowerCase().includes(searchTerm.toLowerCase()))
    return matchesLevel && matchesSearch
  })

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedItems)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedItems(newExpanded)
  }

  const startEditing = (official: Official) => {
    setEditingId(official.id)
    setEditingOfficial({
      name: official.name || '',
      email: official.email || '',
      phone: official.phone || '',
      photo_url: official.photo_url || '',
      level: Number(official.level) || 1,
      years_experience: official.years_experience || 0,
      bio: official.bio || '',
      certifications: official.certifications?.join(', ') || '',
      active: official.active ?? true,
      priority: official.priority || 0
    })
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditingOfficial(null)
  }

  const getLevelColor = (level: number) => {
    const colors: Record<number, string> = {
      1: 'bg-gray-100 text-gray-800',
      2: 'bg-blue-100 text-blue-800',
      3: 'bg-green-100 text-green-800',
      4: 'bg-purple-100 text-purple-800',
      5: 'bg-orange-100 text-orange-800'
    }
    return colors[level] || 'bg-gray-100 text-gray-800'
  }

  const handleCreate = async () => {
    if (!newOfficial.name) {
      error('Please fill in the required field: name')
      return
    }

    // Sanitize inputs
    const sanitizedName = sanitize.text(newOfficial.name)
    const sanitizedEmail = sanitize.text(newOfficial.email)
    const sanitizedPhone = sanitize.text(newOfficial.phone)
    const sanitizedPhotoUrl = sanitize.text(newOfficial.photo_url)
    const sanitizedBio = sanitize.html(newOfficial.bio)

    try {
      const created = await officialsAPI.create({
        name: sanitizedName,
        email: sanitizedEmail || undefined,
        phone: sanitizedPhone || undefined,
        photo_url: sanitizedPhotoUrl || undefined,
        level: newOfficial.level,
        years_experience: newOfficial.years_experience || 0,
        bio: sanitizedBio || undefined,
        certifications: newOfficial.certifications ? newOfficial.certifications.split(',').map(c => c.trim()) : [],
        active: newOfficial.active,
        priority: newOfficial.priority
      })
      setOfficials([created, ...officials])
      setNewOfficial({
        name: '',
        email: '',
        phone: '',
        photo_url: '',
        level: 1,
        years_experience: 0,
        bio: '',
        certifications: '',
        active: true,
        priority: 0
      })
      setIsCreating(false)
      success('Official added successfully!')
    } catch (err) {
      const errorMessage = parseAPIError(err)
      error(`Failed to create official: ${errorMessage}`)
    }
  }

  const handleSaveEdit = async () => {
    if (!editingId || !editingOfficial) return

    if (!editingOfficial.name) {
      error('Please fill in the required field: name')
      return
    }

    // Sanitize inputs
    const sanitizedData = {
      id: editingId,
      name: sanitize.text(editingOfficial.name),
      email: editingOfficial.email ? sanitize.text(editingOfficial.email) : undefined,
      phone: editingOfficial.phone ? sanitize.text(editingOfficial.phone) : undefined,
      photo_url: editingOfficial.photo_url ? sanitize.text(editingOfficial.photo_url) : undefined,
      level: editingOfficial.level,
      years_experience: editingOfficial.years_experience || 0,
      bio: editingOfficial.bio ? sanitize.html(editingOfficial.bio) : undefined,
      certifications: editingOfficial.certifications ? editingOfficial.certifications.split(',').map((c: string) => c.trim()) : [],
      active: editingOfficial.active,
      priority: editingOfficial.priority
    }

    try {
      const updated = await officialsAPI.update(sanitizedData)
      setOfficials(prev => prev.map(item =>
        item.id === editingId ? updated : item
      ))
      setEditingId(null)
      setEditingOfficial(null)
      success('Official updated successfully!')
    } catch (err) {
      const errorMessage = parseAPIError(err)
      error(`Failed to update official: ${errorMessage}`)
    }
  }

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this official profile?')) {
      try {
        await officialsAPI.delete(id)
        setOfficials(prev => prev.filter(item => item.id !== id))
        success('Official deleted successfully!')
      } catch (err) {
        const errorMessage = parseAPIError(err)
        error(`Failed to delete official: ${errorMessage}`)
      }
    }
  }

  return (
    <div className="py-5 sm:py-6 portal-animate">

      {/* Header */}
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold font-heading tracking-tight text-gray-900">Officials Profiles</h1>
          <p className="mt-1 sm:mt-2 text-sm sm:text-base text-gray-600">
            Manage official profiles displayed on the public website
          </p>
        </div>
        {canEdit && !isCreating && (
          <button
            onClick={() => {
              setIsCreating(true)
              setNewOfficial({
                name: '',
                email: '',
                phone: '',
                photo_url: '',
                level: selectedLevel === 'all' ? 1 : selectedLevel,
                years_experience: 0,
                bio: '',
                certifications: '',
                active: true,
                priority: 0
              })
            }}
            className="bg-orange-500 text-white px-3 py-2 sm:px-4 rounded-lg hover:bg-orange-600 flex items-center gap-2 text-sm sm:text-base"
          >
            <IconPlus className="h-5 w-5" />
            Add Official
          </button>
        )}
      </div>

      {/* Search and Level Filter */}
      <div className="mb-6 bg-white rounded-lg border border-gray-200 dark:border-portal-border p-3 sm:p-4">
        <div className="flex-1 min-w-0">
          <input
            type="text"
            placeholder="Search officials..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 text-sm sm:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-orange-500 focus:border-orange-500"
          />
        </div>

        <div className="mt-3 sm:mt-4 flex flex-wrap gap-1.5 sm:gap-2">
          <button
            onClick={() => setSelectedLevel('all')}
            className={`px-2 sm:px-3 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm flex items-center gap-1 sm:gap-2 ${
              selectedLevel === 'all'
                ? 'bg-orange-500 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            <IconUserCheck className="h-3 w-3 sm:h-4 sm:w-4" />
            All Levels
          </button>
          {levels.map(level => (
            <button
              key={level}
              onClick={() => setSelectedLevel(level)}
              className={`px-2 sm:px-3 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm ${
                selectedLevel === level
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Level {level}
            </button>
          ))}
        </div>
      </div>

      {/* Create New Official Form */}
      {isCreating && (
        <div className="mb-6 bg-white rounded-lg border border-gray-200 dark:border-portal-border p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-semibold mb-4">Add New Official</h2>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={newOfficial.name}
                  onChange={(e) => setNewOfficial({...newOfficial, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Official's name..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Level</label>
                <select
                  value={newOfficial.level}
                  onChange={(e) => setNewOfficial({...newOfficial, level: parseInt(e.target.value)})}
                  className="w-full pl-3 pr-8 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {levels.map(level => (
                    <option key={level} value={level}>Level {level}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={newOfficial.email}
                  onChange={(e) => setNewOfficial({...newOfficial, email: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="email@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={newOfficial.phone}
                  onChange={(e) => setNewOfficial({...newOfficial, phone: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Photo URL</label>
                <input
                  type="url"
                  value={newOfficial.photo_url}
                  onChange={(e) => setNewOfficial({...newOfficial, photo_url: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="https://example.com/photo.jpg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Years of Experience</label>
                <input
                  type="number"
                  value={newOfficial.years_experience || ''}
                  onChange={(e) => setNewOfficial({...newOfficial, years_experience: parseInt(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="0"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Certifications (comma-separated)</label>
              <input
                type="text"
                value={newOfficial.certifications}
                onChange={(e) => setNewOfficial({...newOfficial, certifications: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="NFHS Certified, IAABO Member"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
              <JoditEditor
                value={newOfficial.bio}
                onChange={(value) => setNewOfficial({...newOfficial, bio: value || ''})}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <input
                  type="number"
                  value={newOfficial.priority}
                  onChange={(e) => setNewOfficial({...newOfficial, priority: parseInt(e.target.value)})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="0"
                />
              </div>

              <div className="flex items-end">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newOfficial.active}
                    onChange={(e) => setNewOfficial({...newOfficial, active: e.target.checked})}
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
                Save Official
              </button>
              <button
                onClick={() => {
                  setIsCreating(false)
                  setNewOfficial({
                    name: '',
                    email: '',
                    phone: '',
                    photo_url: '',
                    level: 1,
                    years_experience: 0,
                    bio: '',
                    certifications: '',
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

      {/* Officials List */}
      {filteredOfficials.length > 0 ? (
        <div className="space-y-3 sm:space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {selectedLevel === 'all' ? 'All Officials' : `Level ${selectedLevel} Officials`}
            <span className="text-gray-500 ml-2">({filteredOfficials.length})</span>
          </h2>

          {filteredOfficials.map((official) => {
            const isExpanded = expandedItems.has(official.id)
            const isEditing = editingId === official.id

            if (isEditing && editingOfficial) {
              return (
                <div key={official.id} className="bg-white rounded-lg border border-gray-200 dark:border-portal-border p-4 sm:p-6">
                  <h3 className="text-lg sm:text-xl font-semibold mb-4">Edit Official</h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                        <input
                          type="text"
                          value={editingOfficial.name}
                          onChange={(e) => setEditingOfficial({...editingOfficial, name: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Level</label>
                        <select
                          value={editingOfficial.level}
                          onChange={(e) => setEditingOfficial({...editingOfficial, level: parseInt(e.target.value)})}
                          className="w-full pl-3 pr-8 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        >
                          {levels.map(level => (
                            <option key={level} value={level}>Level {level}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input
                          type="email"
                          value={editingOfficial.email}
                          onChange={(e) => setEditingOfficial({...editingOfficial, email: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                        <input
                          type="tel"
                          value={editingOfficial.phone}
                          onChange={(e) => setEditingOfficial({...editingOfficial, phone: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Photo URL</label>
                        <input
                          type="url"
                          value={editingOfficial.photo_url}
                          onChange={(e) => setEditingOfficial({...editingOfficial, photo_url: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Years of Experience</label>
                        <input
                          type="number"
                          value={editingOfficial.years_experience || ''}
                          onChange={(e) => setEditingOfficial({...editingOfficial, years_experience: parseInt(e.target.value) || 0})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Certifications (comma-separated)</label>
                      <input
                        type="text"
                        value={editingOfficial.certifications}
                        onChange={(e) => setEditingOfficial({...editingOfficial, certifications: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
                      <JoditEditor
                        value={editingOfficial.bio}
                        onChange={(value) => setEditingOfficial({...editingOfficial, bio: value || ''})}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                        <input
                          type="number"
                          value={editingOfficial.priority}
                          onChange={(e) => setEditingOfficial({...editingOfficial, priority: parseInt(e.target.value) || 0})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>

                      <div className="flex items-end">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={editingOfficial.active}
                            onChange={(e) => setEditingOfficial({...editingOfficial, active: e.target.checked})}
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
                key={official.id}
                className="bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
              >
                {/* Official Header */}
                <div className="p-4">
                  <div className="flex items-start gap-4">
                    {official.photo_url && (
                      <img
                        src={official.photo_url}
                        alt={official.name}
                        className="w-20 h-20 rounded-full object-cover"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getLevelColor(Number(official.level) || 0)}`}>
                              <IconMedal className="inline h-3 w-3 mr-1" />
                              Level {official.level}
                            </span>
                            {!official.active && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                                <IconEyeOff className="h-3 w-3" />
                                Hidden
                              </span>
                            )}
                          </div>
                          <h3 className="font-semibold text-gray-900 text-base sm:text-lg">
                            {official.name}
                          </h3>
                          {official.years_experience && official.years_experience > 0 && (
                            <p className="text-sm text-gray-600">
                              {official.years_experience} year{official.years_experience !== 1 ? 's' : ''} of experience
                            </p>
                          )}
                          {official.email && (
                            <p className="text-sm text-gray-600 mt-1">
                              <a href={`mailto:${official.email}`} className="text-blue-400 hover:text-blue-700">
                                {official.email}
                              </a>
                            </p>
                          )}
                          {official.phone && (
                            <p className="text-sm text-gray-600">
                              <a href={`tel:${official.phone}`} className="text-blue-400 hover:text-blue-700">
                                {official.phone}
                              </a>
                            </p>
                          )}
                          {official.certifications && official.certifications.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {official.certifications.map((cert, idx) => (
                                <span key={idx} className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                                  {cert}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {canEdit && (
                          <div className="flex gap-1 flex-shrink-0">
                            <button
                              onClick={() => startEditing(official)}
                              className="p-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                              title="Edit"
                            >
                              <IconEdit className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(official.id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="Delete"
                            >
                              <IconTrash className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      {official.bio && (
                        <>
                          <button
                            onClick={() => toggleExpanded(official.id)}
                            className="mt-2 text-sm text-orange-600 hover:text-orange-700 font-medium"
                          >
                            {isExpanded ? 'Hide' : 'Show'} bio
                          </button>

                          {isExpanded && (
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <div className="prose prose-sm max-w-none">
                                <HTMLViewer content={official.bio} />
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200 dark:border-portal-border">
          <IconUserCheck className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No officials found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchTerm
              ? `No officials match "${searchTerm}"`
              : selectedLevel === 'all'
                ? canEdit ? 'Click "Add Official" to create your first official profile.' : 'Official profiles will appear here once added by administrators.'
                : `No officials found for Level ${selectedLevel}.`}
          </p>
        </div>
      )}
    </div>
  )
}
