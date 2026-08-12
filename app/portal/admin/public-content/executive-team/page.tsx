'use client'

import { useState, useEffect } from 'react'
import { IconUsers, IconSearch, IconPlus, IconEdit, IconTrash, IconDeviceFloppy, IconX, IconEyeOff, IconMail } from '@tabler/icons-react'
import { useRole } from '@/contexts/RoleContext'
import { executiveTeamAPI } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { parseAPIError, sanitize } from '@/lib/errorHandling'
import type { ExecutiveMember } from '@/types/publicContent'
import { EMAIL_DOMAIN } from '@/lib/siteConfig'

export default function ExecutiveTeamAdmin() {
  const { hasRole } = useRole()
  const { success, error } = useToast()
  const [members, setMembers] = useState<ExecutiveMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingMember, setEditingMember] = useState<{
    name: string
    position: string
    email: string
    image_url: string
    bio: string
    active: boolean
    priority: number
  } | null>(null)
  const [newMember, setNewMember] = useState({
    name: '',
    position: '',
    email: '',
    image_url: '',
    bio: '',
    active: true,
    priority: 0
  })

  const canEdit = hasRole('executive')

  useEffect(() => {
    loadMembers()
  }, [])

  const loadMembers = async () => {
    try {
      const data = await executiveTeamAPI.getAll({ includeInactive: true })
      setMembers(data)
    } catch (err) {
      const errorMessage = parseAPIError(err)
      error(`Failed to load executive team: ${errorMessage}`)
    } finally {
      setIsLoading(false)
    }
  }

  const filteredMembers = members.filter(item => {
    const matchesSearch = searchTerm === '' ||
      item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.position?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.email?.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesSearch
  })

  const startEditing = (member: ExecutiveMember) => {
    setEditingId(member.id)
    setEditingMember({
      name: member.name || '',
      position: member.position || '',
      email: member.email || '',
      image_url: member.image_url || '',
      bio: member.bio || '',
      active: member.active ?? true,
      priority: member.priority || 0
    })
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditingMember(null)
  }

  const handleCreate = async () => {
    if (!newMember.name || !newMember.position || !newMember.email) {
      error('Please fill in required fields: name, position, and email')
      return
    }

    try {
      const created = await executiveTeamAPI.create({
        name: sanitize.text(newMember.name),
        position: sanitize.text(newMember.position),
        email: sanitize.text(newMember.email),
        image_url: newMember.image_url ? sanitize.text(newMember.image_url) : undefined,
        bio: newMember.bio ? sanitize.text(newMember.bio) : undefined,
        active: newMember.active,
        priority: newMember.priority
      })
      setMembers([created, ...members])
      setNewMember({
        name: '',
        position: '',
        email: '',
        image_url: '',
        bio: '',
        active: true,
        priority: 0
      })
      setIsCreating(false)
      success('Executive member added successfully!')
    } catch (err) {
      const errorMessage = parseAPIError(err)
      error(`Failed to create executive member: ${errorMessage}`)
    }
  }

  const handleSaveEdit = async () => {
    if (!editingId || !editingMember) return

    if (!editingMember.name || !editingMember.position || !editingMember.email) {
      error('Please fill in required fields: name, position, and email')
      return
    }

    try {
      const updated = await executiveTeamAPI.update({
        id: editingId,
        name: sanitize.text(editingMember.name),
        position: sanitize.text(editingMember.position),
        email: sanitize.text(editingMember.email),
        image_url: editingMember.image_url ? sanitize.text(editingMember.image_url) : undefined,
        bio: editingMember.bio ? sanitize.text(editingMember.bio) : undefined,
        active: editingMember.active,
        priority: editingMember.priority
      })
      setMembers(prev => prev.map(item =>
        item.id === editingId ? updated : item
      ))
      setEditingId(null)
      setEditingMember(null)
      success('Executive member updated successfully!')
    } catch (err) {
      const errorMessage = parseAPIError(err)
      error(`Failed to update executive member: ${errorMessage}`)
    }
  }

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this executive member?')) {
      try {
        await executiveTeamAPI.delete(id)
        setMembers(prev => prev.filter(item => item.id !== id))
        success('Executive member deleted successfully!')
      } catch (err) {
        const errorMessage = parseAPIError(err)
        error(`Failed to delete executive member: ${errorMessage}`)
      }
    }
  }

  if (isLoading) {
    return (
      <div className="py-6 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
      </div>
    )
  }

  return (
    <div className="py-5 sm:py-6">
      {/* Header */}
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Executive Team</h1>
          <p className="mt-1 sm:mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-300">
            Manage executive team members displayed on the About page
          </p>
        </div>
        {canEdit && !isCreating && (
          <button
            onClick={() => setIsCreating(true)}
            className="bg-orange-500 text-white px-3 py-2 sm:px-4 rounded-lg hover:bg-orange-600 flex items-center gap-2 text-sm sm:text-base"
          >
            <IconPlus className="h-5 w-5" />
            Add Member
          </button>
        )}
      </div>

      {/* Search */}
      <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow p-3 sm:p-4">
        <div className="relative">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search executive team..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-3 py-2 text-sm sm:text-base border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-orange-500 focus:border-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>
      </div>

      {/* Create New Member Form */}
      {isCreating && (
        <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-semibold mb-4 text-gray-900 dark:text-white">Add New Executive Member</h2>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
                <input
                  type="text"
                  value={newMember.name}
                  onChange={(e) => setNewMember({...newMember, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Full name..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Position *</label>
                <input
                  type="text"
                  value={newMember.position}
                  onChange={(e) => setNewMember({...newMember, position: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g., President, Vice President..."
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email *</label>
                <input
                  type="email"
                  value={newMember.email}
                  onChange={(e) => setNewMember({...newMember, email: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder={`email@${EMAIL_DOMAIN}`}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Photo URL</label>
                <input
                  type="url"
                  value={newMember.image_url}
                  onChange={(e) => setNewMember({...newMember, image_url: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="https://..."
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bio</label>
              <textarea
                value={newMember.bio}
                onChange={(e) => setNewMember({...newMember, bio: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                rows={3}
                placeholder="Brief biography..."
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority (display order)</label>
                <input
                  type="number"
                  value={newMember.priority}
                  onChange={(e) => setNewMember({...newMember, priority: parseInt(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Higher = shown first"
                />
              </div>

              <div className="flex items-end">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newMember.active}
                    onChange={(e) => setNewMember({...newMember, active: e.target.checked})}
                    className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Active (visible on website)</span>
                </label>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleCreate}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
              >
                <IconDeviceFloppy className="h-5 w-5" />
                Save Member
              </button>
              <button
                onClick={() => {
                  setIsCreating(false)
                  setNewMember({
                    name: '',
                    position: '',
                    email: '',
                    image_url: '',
                    bio: '',
                    active: true,
                    priority: 0
                  })
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

      {/* Members List */}
      {filteredMembers.length > 0 ? (
        <div className="space-y-3 sm:space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Executive Team Members
            <span className="text-gray-500 ml-2">({filteredMembers.length})</span>
          </h2>

          {filteredMembers.map((member) => {
            const isEditing = editingId === member.id

            if (isEditing && editingMember) {
              return (
                <div key={member.id} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
                  <h3 className="text-lg sm:text-xl font-semibold mb-4 text-gray-900 dark:text-white">Edit Executive Member</h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
                        <input
                          type="text"
                          value={editingMember.name}
                          onChange={(e) => setEditingMember({...editingMember, name: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Position *</label>
                        <input
                          type="text"
                          value={editingMember.position}
                          onChange={(e) => setEditingMember({...editingMember, position: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email *</label>
                        <input
                          type="email"
                          value={editingMember.email}
                          onChange={(e) => setEditingMember({...editingMember, email: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Photo URL</label>
                        <input
                          type="url"
                          value={editingMember.image_url}
                          onChange={(e) => setEditingMember({...editingMember, image_url: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bio</label>
                      <textarea
                        value={editingMember.bio}
                        onChange={(e) => setEditingMember({...editingMember, bio: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        rows={3}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label>
                        <input
                          type="number"
                          value={editingMember.priority}
                          onChange={(e) => setEditingMember({...editingMember, priority: parseInt(e.target.value) || 0})}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>

                      <div className="flex items-end">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={editingMember.active}
                            onChange={(e) => setEditingMember({...editingMember, active: e.target.checked})}
                            className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                          />
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Active</span>
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
                key={member.id}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
              >
                <div className="p-4">
                  <div className="flex items-start gap-4">
                    {member.image_url && (
                      <img
                        src={member.image_url}
                        alt={member.name}
                        className="w-16 h-16 rounded-full object-cover"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            {!member.active && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300">
                                <IconEyeOff className="h-3 w-3" />
                                Hidden
                              </span>
                            )}
                          </div>
                          <h3 className="font-semibold text-gray-900 dark:text-white text-base sm:text-lg">
                            {member.name}
                          </h3>
                          <p className="text-sm text-orange-600 dark:text-orange-400 font-medium">
                            {member.position}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 flex items-center gap-1">
                            <IconMail className="h-4 w-4" />
                            <a href={`mailto:${member.email}`} className="text-blue-400 hover:text-blue-300">
                              {member.email}
                            </a>
                          </p>
                          {member.bio && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                              {member.bio}
                            </p>
                          )}
                        </div>

                        {canEdit && (
                          <div className="flex gap-1 flex-shrink-0">
                            <button
                              onClick={() => startEditing(member)}
                              className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                              title="Edit"
                            >
                              <IconEdit className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(member.id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                              title="Delete"
                            >
                              <IconTrash className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow">
          <IconUsers className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No executive team members found</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {searchTerm
              ? `No members match "${searchTerm}"`
              : canEdit ? 'Click "Add Member" to create your first executive team member.' : 'Executive team members will appear here once added.'}
          </p>
        </div>
      )}
    </div>
  )
}
