'use client'

import { useState, useEffect } from 'react'
import { IconCalendarEvent, IconSearch, IconPlus, IconEdit, IconTrash, IconDeviceFloppy, IconX, IconMapPin, IconClock, IconEyeOff } from '@tabler/icons-react'
import { useRole } from '@/contexts/RoleContext'
import { JoditEditor } from '@/components/JoditEditor'
import { HTMLViewer } from '@/components/HTMLViewer'
import { publicTrainingAPI } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { parseAPIError, sanitize, ValidationError } from '@/lib/errorHandling'
import { getFieldError } from '@/lib/portalValidation'
import type { PublicTrainingEvent } from '@/types/publicContent'

export default function PublicTrainingAdmin() {
  const { user } = useRole()
  const { success, error, warning, info } = useToast()
  const [events, setEvents] = useState<PublicTrainingEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingEvent, setEditingEvent] = useState<{
    title: string
    slug: string
    event_date: string
    event_time: string
    location: string
    description: string
    details: string
    registration_url: string
    capacity: number
    instructor: string
    active: boolean
    priority: number
  } | null>(null)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [newEvent, setNewEvent] = useState({
    title: '',
    slug: '',
    event_date: new Date().toISOString().split('T')[0],
    event_time: '',
    location: '',
    description: '',
    details: '',
    registration_url: '',
    capacity: 0,
    instructor: '',
    active: true,
    priority: 0
  })
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])

  const canEdit = user.role === 'admin' || user.role === 'executive'

  // Load training events from API
  useEffect(() => {
    loadEvents()
  }, [])

  const loadEvents = async () => {
    try {
      const data = await publicTrainingAPI.getAll()
      setEvents(data)
    } catch (err) {
      const errorMessage = parseAPIError(err)
      error(`Failed to load training events: ${errorMessage}`)
    } finally {
      setIsLoading(false)
    }
  }

  // Filter events based on search term
  const filteredEvents = events.filter(item => {
    const matchesSearch = searchTerm === '' ||
      item.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.details?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.instructor?.toLowerCase().includes(searchTerm.toLowerCase())
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

  const startEditing = (event: PublicTrainingEvent) => {
    setEditingId(event.id)
    setEditingEvent({
      title: event.title || '',
      slug: event.slug || '',
      event_date: event.event_date ? new Date(event.event_date).toISOString().split('T')[0] : '',
      event_time: event.event_time || '',
      location: event.location || '',
      description: event.description || '',
      details: event.details || '',
      registration_url: event.registration_url || '',
      capacity: event.capacity || 0,
      instructor: event.instructor || '',
      active: event.active ?? true,
      priority: event.priority || 0
    })
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditingEvent(null)
  }

  const handleCreate = async () => {
    if (!newEvent.title || !newEvent.event_date || !newEvent.description) {
      error('Please fill in all required fields (title, event date, and description)')
      return
    }

    // Sanitize inputs
    const sanitizedTitle = sanitize.text(newEvent.title)
    const sanitizedSlug = newEvent.slug || generateSlug(newEvent.title)
    const sanitizedLocation = sanitize.text(newEvent.location)
    const sanitizedDescription = sanitize.text(newEvent.description)
    const sanitizedDetails = sanitize.html(newEvent.details)
    const sanitizedInstructor = sanitize.text(newEvent.instructor)
    const sanitizedRegistrationUrl = sanitize.text(newEvent.registration_url)

    try {
      const created = await publicTrainingAPI.create({
        title: sanitizedTitle,
        slug: sanitizedSlug,
        event_date: newEvent.event_date,
        event_time: newEvent.event_time || undefined,
        location: sanitizedLocation,
        description: sanitizedDescription,
        details: sanitizedDetails,
        registration_url: sanitizedRegistrationUrl || undefined,
        capacity: newEvent.capacity || undefined,
        instructor: sanitizedInstructor || undefined,
        active: newEvent.active,
        priority: newEvent.priority
      })
      setEvents([created, ...events])
      setNewEvent({
        title: '',
        slug: '',
        event_date: new Date().toISOString().split('T')[0],
        event_time: '',
        location: '',
        description: '',
        details: '',
        registration_url: '',
        capacity: 0,
        instructor: '',
        active: true,
        priority: 0
      })
      setIsCreating(false)
      success('Training event created successfully!')
    } catch (err) {
      const errorMessage = parseAPIError(err)
      error(`Failed to create training event: ${errorMessage}`)
    }
  }

  const handleSaveEdit = async () => {
    if (!editingId || !editingEvent) return

    if (!editingEvent.title || !editingEvent.event_date || !editingEvent.description) {
      error('Please fill in all required fields (title, event date, and description)')
      return
    }

    // Sanitize inputs
    const sanitizedData = {
      id: editingId,
      title: sanitize.text(editingEvent.title),
      slug: editingEvent.slug || generateSlug(editingEvent.title),
      event_date: editingEvent.event_date,
      event_time: editingEvent.event_time || undefined,
      location: sanitize.text(editingEvent.location),
      description: sanitize.text(editingEvent.description),
      details: sanitize.html(editingEvent.details),
      registration_url: editingEvent.registration_url ? sanitize.text(editingEvent.registration_url) : undefined,
      capacity: editingEvent.capacity || undefined,
      instructor: editingEvent.instructor ? sanitize.text(editingEvent.instructor) : undefined,
      active: editingEvent.active,
      priority: editingEvent.priority
    }

    try {
      const updated = await publicTrainingAPI.update(sanitizedData)
      setEvents(prev => prev.map(item =>
        item.id === editingId ? updated : item
      ))
      setEditingId(null)
      setEditingEvent(null)
      success('Training event updated successfully!')
    } catch (err) {
      const errorMessage = parseAPIError(err)
      error(`Failed to update training event: ${errorMessage}`)
    }
  }

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this training event?')) {
      try {
        await publicTrainingAPI.delete(id)
        setEvents(prev => prev.filter(item => item.id !== id))
        success('Training event deleted successfully!')
      } catch (err) {
        const errorMessage = parseAPIError(err)
        error(`Failed to delete training event: ${errorMessage}`)
      }
    }
  }

  return (
    <div className="py-5 sm:py-6">

      {/* Header */}
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Public Training Events</h1>
          <p className="mt-1 sm:mt-2 text-sm sm:text-base text-gray-600">
            Manage training events displayed on the public website
          </p>
        </div>
        {canEdit && !isCreating && (
          <button
            onClick={() => {
              setIsCreating(true)
              setNewEvent({
                title: '',
                slug: '',
                event_date: new Date().toISOString().split('T')[0],
                event_time: '',
                location: '',
                description: '',
                details: '',
                registration_url: '',
                capacity: 0,
                instructor: '',
                active: true,
                priority: 0
              })
            }}
            className="bg-orange-500 text-white px-3 py-2 sm:px-4 rounded-lg hover:bg-orange-600 flex items-center gap-2 text-sm sm:text-base"
          >
            <IconPlus className="h-5 w-5" />
            Add Training Event
          </button>
        )}
      </div>

      {/* Search */}
      <div className="mb-6 bg-white rounded-lg shadow p-3 sm:p-4">
        <div className="flex-1 min-w-0">
          <input
            type="text"
            placeholder="Search training events..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 text-sm sm:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-orange-500 focus:border-orange-500"
          />
        </div>
      </div>

      {/* Create New Event Form */}
      {isCreating && (
        <div className="mb-6 bg-white rounded-lg shadow-lg p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-semibold mb-4">Add New Training Event</h2>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={newEvent.title}
                  onChange={(e) => {
                    setNewEvent({...newEvent, title: e.target.value, slug: generateSlug(e.target.value)})
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Event title..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Slug (URL-friendly)</label>
                <input
                  type="text"
                  value={newEvent.slug}
                  onChange={(e) => setNewEvent({...newEvent, slug: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="auto-generated-from-title"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Event Date *</label>
                <input
                  type="date"
                  value={newEvent.event_date}
                  onChange={(e) => setNewEvent({...newEvent, event_date: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Event Time</label>
                <input
                  type="time"
                  value={newEvent.event_time}
                  onChange={(e) => setNewEvent({...newEvent, event_time: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <input
                type="text"
                value={newEvent.location}
                onChange={(e) => setNewEvent({...newEvent, location: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="Venue or address..."
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Instructor</label>
                <input
                  type="text"
                  value={newEvent.instructor}
                  onChange={(e) => setNewEvent({...newEvent, instructor: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Instructor name..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Capacity</label>
                <input
                  type="number"
                  value={newEvent.capacity || ''}
                  onChange={(e) => setNewEvent({...newEvent, capacity: parseInt(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Max attendees (optional)"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description (Summary) *</label>
              <textarea
                value={newEvent.description}
                onChange={(e) => setNewEvent({...newEvent, description: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                rows={3}
                placeholder="Brief description of the event..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Registration URL</label>
              <input
                type="url"
                value={newEvent.registration_url}
                onChange={(e) => setNewEvent({...newEvent, registration_url: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="https://example.com/register"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Details</label>
              <JoditEditor
                value={newEvent.details}
                onChange={(value) => setNewEvent({...newEvent, details: value || ''})}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <input
                  type="number"
                  value={newEvent.priority}
                  onChange={(e) => setNewEvent({...newEvent, priority: parseInt(e.target.value)})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="0"
                />
              </div>

              <div className="flex items-end">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newEvent.active}
                    onChange={(e) => setNewEvent({...newEvent, active: e.target.checked})}
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
                Save Event
              </button>
              <button
                onClick={() => {
                  setIsCreating(false)
                  setNewEvent({
                    title: '',
                    slug: '',
                    event_date: new Date().toISOString().split('T')[0],
                    event_time: '',
                    location: '',
                    description: '',
                    details: '',
                    registration_url: '',
                    capacity: 0,
                    instructor: '',
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

      {/* Training Events List */}
      {filteredEvents.length > 0 ? (
        <div className="space-y-3 sm:space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {events.length} Event{events.length !== 1 ? 's' : ''}
          </h2>

          {filteredEvents.map((event) => {
            const isExpanded = expandedItems.has(event.id)
            const isEditing = editingId === event.id
            const eventDate = new Date(event.event_date).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })
            const isPast = new Date(event.event_date) < new Date()

            if (isEditing && editingEvent) {
              return (
                <div key={event.id} className="bg-white rounded-lg shadow p-4 sm:p-6">
                  <h3 className="text-lg sm:text-xl font-semibold mb-4">Edit Training Event</h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                        <input
                          type="text"
                          value={editingEvent.title}
                          onChange={(e) => setEditingEvent({...editingEvent, title: e.target.value, slug: generateSlug(e.target.value)})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
                        <input
                          type="text"
                          value={editingEvent.slug}
                          onChange={(e) => setEditingEvent({...editingEvent, slug: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Event Date *</label>
                        <input
                          type="date"
                          value={editingEvent.event_date}
                          onChange={(e) => setEditingEvent({...editingEvent, event_date: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Event Time</label>
                        <input
                          type="time"
                          value={editingEvent.event_time}
                          onChange={(e) => setEditingEvent({...editingEvent, event_time: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                      <input
                        type="text"
                        value={editingEvent.location}
                        onChange={(e) => setEditingEvent({...editingEvent, location: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Instructor</label>
                        <input
                          type="text"
                          value={editingEvent.instructor}
                          onChange={(e) => setEditingEvent({...editingEvent, instructor: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Capacity</label>
                        <input
                          type="number"
                          value={editingEvent.capacity || ''}
                          onChange={(e) => setEditingEvent({...editingEvent, capacity: parseInt(e.target.value) || 0})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                      <textarea
                        value={editingEvent.description}
                        onChange={(e) => setEditingEvent({...editingEvent, description: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        rows={3}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Registration URL</label>
                      <input
                        type="url"
                        value={editingEvent.registration_url}
                        onChange={(e) => setEditingEvent({...editingEvent, registration_url: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Full Details</label>
                      <JoditEditor
                        value={editingEvent.details}
                        onChange={(value) => setEditingEvent({...editingEvent, details: value || ''})}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                        <input
                          type="number"
                          value={editingEvent.priority}
                          onChange={(e) => setEditingEvent({...editingEvent, priority: parseInt(e.target.value) || 0})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>

                      <div className="flex items-end">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={editingEvent.active}
                            onChange={(e) => setEditingEvent({...editingEvent, active: e.target.checked})}
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
                key={event.id}
                className={`bg-white border rounded-lg hover:border-gray-300 transition-colors ${
                  isPast ? 'border-gray-300 opacity-75' : 'border-gray-200'
                }`}
              >
                {/* Event Header */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {!event.active && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                            <IconEyeOff className="h-3 w-3" />
                            Hidden
                          </span>
                        )}
                        {isPast && (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                            Past Event
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold text-gray-900 text-base sm:text-lg">
                        {event.title}
                      </h3>
                      <div className="mt-2 space-y-1">
                        <p className="text-sm text-gray-600 flex items-center gap-1">
                          <IconCalendarEvent className="h-4 w-4" />
                          {eventDate} {event.event_time && `at ${event.event_time}`}
                        </p>
                        {event.location && (
                          <p className="text-sm text-gray-600 flex items-center gap-1">
                            <IconMapPin className="h-4 w-4" />
                            {event.location}
                          </p>
                        )}
                        {event.instructor && (
                          <p className="text-sm text-gray-600">
                            <strong>Instructor:</strong> {event.instructor}
                          </p>
                        )}
                        {event.capacity && event.capacity > 0 && (
                          <p className="text-sm text-gray-600">
                            <strong>Capacity:</strong> {event.capacity} attendees
                          </p>
                        )}
                      </div>
                    </div>

                    {canEdit && (
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => startEditing(event)}
                          className="p-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                          title="Edit"
                        >
                          <IconEdit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(event.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Delete"
                        >
                          <IconTrash className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  <p className="text-sm text-gray-600 mt-3">
                    {event.description}
                  </p>

                  {event.registration_url && (
                    <a
                      href={event.registration_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-block text-sm text-orange-600 hover:text-orange-700 font-medium"
                    >
                      Register Now →
                    </a>
                  )}

                  {event.details && (
                    <button
                      onClick={() => toggleExpanded(event.id)}
                      className="mt-2 text-sm text-orange-600 hover:text-orange-700 font-medium"
                    >
                      {isExpanded ? 'Hide' : 'Show'} full details
                    </button>
                  )}

                  {/* Expanded Content */}
                  {isExpanded && event.details && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="prose prose-sm max-w-none">
                        <HTMLViewer content={event.details} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <IconCalendarEvent className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No training events found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchTerm
              ? `No events match "${searchTerm}"`
              : canEdit
                ? 'Click "Add Training Event" to create your first event.'
                : 'Training events will appear here once added by administrators.'}
          </p>
        </div>
      )}
    </div>
  )
}
