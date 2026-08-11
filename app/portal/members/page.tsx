'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRole } from '@/contexts/RoleContext'
import { membersAPI, memberActivitiesAPI } from '@/lib/api'
import { IconUser, IconSearch, IconPlus, IconEdit, IconTrash, IconCalendar, IconX, IconCheck, IconFilter, IconLayoutGrid, IconTable, IconUsersPlus, IconLoader2, IconAlertCircle, IconMail, IconKey } from '@tabler/icons-react'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/hooks/useToast'
import {
  validateMemberForm,
  validateActivityForm,
  getFieldError,
  hasErrors,
  formatValidationErrors
} from '@/lib/portalValidation'
import { parseAPIError, sanitize, ValidationError } from '@/lib/errorHandling'
import { DataTable } from '@/components/ui/DataTable'
import { ColumnDef } from '@tanstack/react-table'

interface Member {
  id?: string
  netlify_user_id?: string
  user_id?: string // Supabase auth user ID
  account_setup_complete?: boolean // True if user has actually signed in
  name: string
  email: string
  phone?: string
  certification_level?: string
  rank?: number
  status?: string
  role?: string
  address?: string
  city?: string
  province?: string
  postal_code?: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
  custom_fields?: Record<string, any>
  notes?: string
  created_at?: string
  updated_at?: string
}

interface Activity {
  id?: string
  member_id: string
  activity_type: string
  activity_date: string
  activity_data?: Record<string, any>
  notes?: string
}

export default function MembersPage() {
  const { user } = useRole()
  const [members, setMembers] = useState<Member[]>([])
  const [filteredMembers, setFilteredMembers] = useState<Member[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [certificationFilter, setCertificationFilter] = useState<string>('all')
  const [cityFilter, setCityFilter] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [memberActivities, setMemberActivities] = useState<Activity[]>([])
  const [showMemberModal, setShowMemberModal] = useState(false)
  const [showActivityModal, setShowActivityModal] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editForm, setEditForm] = useState<Member>({
    name: '',
    email: '',
    phone: '',
    certification_level: '',
    status: 'active',
    role: 'official'
  })
  const [activityForm, setActivityForm] = useState<Activity>({
    member_id: '',
    activity_type: 'meeting',
    activity_date: new Date().toISOString().split('T')[0],
    notes: ''
  })
  const { success, error, warning, info } = useToast()
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])
  const [activityValidationErrors, setActivityValidationErrors] = useState<ValidationError[]>([])
  const [isSendingInvite, setIsSendingInvite] = useState(false)

  // Resend pending invites state
  const [showResendPendingModal, setShowResendPendingModal] = useState(false)
  const [isResendingPending, setIsResendingPending] = useState(false)
  const [resendPendingResults, setResendPendingResults] = useState<Array<{ email: string; success: boolean; message: string }> | null>(null)


  // Bulk add members state
  const [showBulkAddModal, setShowBulkAddModal] = useState(false)
  const [bulkEmails, setBulkEmails] = useState('')
  const [bulkAddProgress, setBulkAddProgress] = useState<{
    total: number
    processed: number
    results: Array<{ email: string; success: boolean; message: string }>
  } | null>(null)
  const [isBulkAdding, setIsBulkAdding] = useState(false)

  // Check if user has admin/executive access
  const hasAccess = user.role === 'admin' || user.role === 'executive'

  // Only admins can modify user roles
  const canModifyRoles = user.role === 'admin'

  // Format role for display (capitalize first letter)
  const formatRole = (role: string) => {
    return role.charAt(0).toUpperCase() + role.slice(1)
  }

  // Get role badge color
  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300'
      case 'executive':
        return 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300'
      case 'evaluator':
        return 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300'
      default:
        return 'bg-blue-900/40 text-blue-400'
    }
  }

  useEffect(() => {
    if (hasAccess) {
      loadMembers()
    }
  }, [hasAccess])

  useEffect(() => {
    filterMembers()
  }, [members, searchQuery, statusFilter, roleFilter, certificationFilter, cityFilter])

  const loadMembers = async (forceRefresh: boolean = false) => {
    try {
      setIsLoading(true)
      const data = await membersAPI.getAll({ forceRefresh })
      setMembers(data)
    } catch (err) {
      const errorMessage = parseAPIError(err)
      error(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }


  // Handle bulk add members
  const handleBulkAddMembers = async () => {
    // Parse emails from textarea (one per line, handle commas too)
    const emailLines = bulkEmails
      .split(/[\n,]/)
      .map(e => e.trim().toLowerCase())
      .filter(e => e.length > 0)

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const validEmails = emailLines.filter(e => emailRegex.test(e))
    const invalidEmails = emailLines.filter(e => !emailRegex.test(e))

    if (validEmails.length === 0) {
      error('No valid email addresses found')
      return
    }

    // Remove duplicates
    const uniqueEmails = [...new Set(validEmails)]

    // Check for existing members
    const existingEmails = members.map(m => m.email.toLowerCase())
    const newEmails = uniqueEmails.filter(e => !existingEmails.includes(e))
    const duplicateCount = uniqueEmails.length - newEmails.length

    if (newEmails.length === 0) {
      error('All email addresses already exist in the members list')
      return
    }

    setIsBulkAdding(true)
    setBulkAddProgress({
      total: newEmails.length,
      processed: 0,
      results: []
    })

    const results: Array<{ email: string; success: boolean; message: string }> = []

    // Add invalid emails to results
    for (const email of invalidEmails) {
      results.push({ email, success: false, message: 'Invalid email format' })
    }

    // Process each email
    for (let i = 0; i < newEmails.length; i++) {
      const email = newEmails[i]
      try {
        // Create member with just email - they'll fill in name via complete-profile
        const result = await membersAPI.create({
          email,
          name: email.split('@')[0], // Temporary name from email prefix
          status: 'active',
          role: 'official'
        })

        if (result.inviteSent) {
          results.push({ email, success: true, message: 'Created & invite sent' })
        } else if (result.user_id) {
          results.push({ email, success: true, message: 'Created & linked to existing account' })
        } else {
          results.push({ email, success: true, message: 'Created (invite pending)' })
        }
      } catch (err: any) {
        const errorMsg = parseAPIError(err)
        results.push({ email, success: false, message: errorMsg })
      }

      setBulkAddProgress({
        total: newEmails.length,
        processed: i + 1,
        results: [...results]
      })
    }

    setIsBulkAdding(false)

    // Summary
    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    if (failCount === 0) {
      success(`Successfully added ${successCount} member${successCount > 1 ? 's' : ''}`)
    } else if (successCount === 0) {
      error(`Failed to add all ${failCount} member${failCount > 1 ? 's' : ''}`)
    } else {
      warning(`Added ${successCount} member${successCount > 1 ? 's' : ''}, ${failCount} failed`)
    }

    if (duplicateCount > 0) {
      info(`${duplicateCount} email${duplicateCount > 1 ? 's were' : ' was'} already in the members list`)
    }

    // Refresh members list
    await loadMembers()
  }

  // Reset bulk add modal
  const handleCloseBulkAddModal = () => {
    setShowBulkAddModal(false)
    setBulkEmails('')
    setBulkAddProgress(null)
    setIsBulkAdding(false)
  }

  const filterMembers = () => {
    let filtered = [...members]

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(member =>
        member.name.toLowerCase().includes(query) ||
        member.email.toLowerCase().includes(query) ||
        (member.phone && member.phone.includes(query)) ||
        (member.city && member.city.toLowerCase().includes(query))
      )
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(member => member.status === statusFilter)
    }

    // Apply role filter
    if (roleFilter !== 'all') {
      filtered = filtered.filter(member => (member.role || 'official') === roleFilter)
    }

    // Apply certification filter
    if (certificationFilter !== 'all') {
      if (certificationFilter === 'none') {
        filtered = filtered.filter(member => !member.certification_level || member.certification_level === 'None')
      } else {
        filtered = filtered.filter(member => member.certification_level === certificationFilter)
      }
    }

    // Apply city filter
    if (cityFilter !== 'all') {
      filtered = filtered.filter(member => member.city === cityFilter)
    }

    setFilteredMembers(filtered)
  }

  // Get unique cities from members for filter dropdown
  const uniqueCities = useMemo(() => {
    const cities = members
      .map(m => m.city)
      .filter((city): city is string => !!city && city.trim() !== '')
    return [...new Set(cities)].sort()
  }, [members])

  // Table columns definition
  const tableColumns = useMemo<ColumnDef<Member>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <span className="font-medium text-gray-900 dark:text-white">{row.original.name}</span>
      ),
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => (
        <span className="text-gray-600 dark:text-gray-400">{row.original.email}</span>
      ),
    },
    {
      accessorKey: 'phone',
      header: 'Phone',
      cell: ({ row }) => (
        <span className="text-gray-600 dark:text-gray-400">{row.original.phone || '-'}</span>
      ),
    },
    {
      accessorKey: 'certification_level',
      header: 'Certification Level',
      cell: ({ row }) => (
        row.original.certification_level ? (
          <span className="px-2 py-1 text-xs bg-blue-900/40 text-blue-400 rounded-full">
            {row.original.certification_level}
          </span>
        ) : <span className="text-gray-400 dark:text-gray-500">-</span>
      ),
    },
    {
      accessorKey: 'rank',
      header: 'Rank',
      cell: ({ row }) => (
        <span className="text-gray-600 dark:text-gray-400">{row.original.rank || '-'}</span>
      ),
      meta: { align: 'center' as const },
    },
    {
      accessorKey: 'city',
      header: 'City',
      cell: ({ row }) => (
        <span className="text-gray-600 dark:text-gray-400">{row.original.city || '-'}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <span className={`px-2 py-1 text-xs rounded-full ${
          row.original.status === 'active'
            ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300'
            : 'bg-gray-100 dark:bg-portal-hover text-gray-800 dark:text-gray-300'
        }`}>
          {row.original.status || 'active'}
        </span>
      ),
    },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ row }) => (
        <span className={`px-2 py-1 text-xs rounded-full ${getRoleBadgeColor(row.original.role || 'official')}`}>
          {formatRole(row.original.role || 'official')}
        </span>
      ),
    },
  ], [])

  const handleViewMember = async (member: Member) => {
    setSelectedMember(member)
    setEditForm(member)
    setIsEditing(false)
    setShowMemberModal(true)

    // Load member activities
    if (member.id) {
      try {
        const activities = await memberActivitiesAPI.getAll(member.id)
        setMemberActivities(activities)
      } catch (error) {
        console.error('Error loading activities:', error)
      }
    }
  }

  const handleAddMember = () => {
    setSelectedMember(null)
    setEditForm({
      name: '',
      email: '',
      phone: '',
      certification_level: '',
      status: 'active',
      role: 'official'
    })
    setIsEditing(true)
    setShowMemberModal(true)
    setMemberActivities([])
  }

  const handleEditMember = () => {
    setIsEditing(true)
  }

  const handleSaveMember = async () => {
    try {
      setIsSaving(true)
      setValidationErrors([])

      // Validate form
      const errors = validateMemberForm(editForm)
      if (hasErrors(errors)) {
        setValidationErrors(errors)
        error(formatValidationErrors(errors))
        return
      }

      // Sanitize text inputs
      const sanitizedForm = {
        ...editForm,
        name: sanitize.text(editForm.name),
        email: sanitize.text(editForm.email),
        phone: editForm.phone ? sanitize.text(editForm.phone) : undefined,
        address: editForm.address ? sanitize.text(editForm.address) : undefined,
        city: editForm.city ? sanitize.text(editForm.city) : undefined,
        province: editForm.province ? sanitize.text(editForm.province) : undefined,
        postal_code: editForm.postal_code ? sanitize.text(editForm.postal_code) : undefined,
        emergency_contact_name: editForm.emergency_contact_name ? sanitize.text(editForm.emergency_contact_name) : undefined,
        emergency_contact_phone: editForm.emergency_contact_phone ? sanitize.text(editForm.emergency_contact_phone) : undefined,
        notes: editForm.notes ? sanitize.text(editForm.notes) : undefined
      }

      if (selectedMember?.id) {
        // Update existing member
        await membersAPI.update({
          id: selectedMember.id,
          ...sanitizedForm
        })
        success('Member updated successfully')
      } else {
        // Create new member (also creates auth user and sends invite)
        const result = await membersAPI.create(sanitizedForm)

        if (result.inviteSent) {
          success(`Member created and invite sent to ${sanitizedForm.email}`)
        } else if (result.user_id) {
          success('Member created and linked to existing portal account')
        } else {
          warning('Member created but invite could not be sent. You can resend from the member details.')
        }
      }

      await loadMembers()
      setShowMemberModal(false)
      setIsEditing(false)
      setValidationErrors([])
    } catch (err: any) {
      // Parse the error for user-friendly display
      let errorMessage = parseAPIError(err)

      // Provide more context for common errors
      if (errorMessage.includes('already exists')) {
        errorMessage = `A member with email ${editForm.email} already exists`
      } else if (errorMessage.includes('auth user')) {
        errorMessage = `Failed to create portal account: ${errorMessage}`
      } else if (errorMessage.includes('email')) {
        errorMessage = `Email error: ${errorMessage}`
      }

      error(errorMessage)
      console.error('Member save error:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteMember = async (memberId: string) => {
    if (!confirm('Are you sure you want to delete this member? This will also delete their portal account and all activities.')) {
      return
    }

    try {
      await membersAPI.delete(memberId)
      success('Member and portal account deleted successfully')
      await loadMembers()
      setShowMemberModal(false)
    } catch (err) {
      const errorMessage = parseAPIError(err)
      error(errorMessage)
    }
  }

  const handleAddActivity = () => {
    if (!selectedMember?.id) return

    setActivityForm({
      member_id: selectedMember.id,
      activity_type: 'meeting',
      activity_date: new Date().toISOString().split('T')[0],
      notes: ''
    })
    setShowActivityModal(true)
  }

  const handleSaveActivity = async () => {
    try {
      setIsSaving(true)
      setActivityValidationErrors([])

      // Validate form
      const errors = validateActivityForm(activityForm)
      if (hasErrors(errors)) {
        setActivityValidationErrors(errors)
        error(formatValidationErrors(errors))
        return
      }

      await memberActivitiesAPI.create(activityForm)
      success('Activity added successfully')

      // Reload activities
      if (selectedMember?.id) {
        const activities = await memberActivitiesAPI.getAll(selectedMember.id)
        setMemberActivities(activities)
      }

      setShowActivityModal(false)
      setActivityValidationErrors([])
    } catch (err) {
      const errorMessage = parseAPIError(err)
      error(errorMessage)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteActivity = async (activityId: string) => {
    if (!confirm('Are you sure you want to delete this activity?')) {
      return
    }

    try {
      // Pass memberId to properly invalidate the cache
      await memberActivitiesAPI.delete(activityId, selectedMember?.id)
      success('Activity deleted successfully')

      // Reload activities with force refresh to bypass any remaining cache
      if (selectedMember?.id) {
        const activities = await memberActivitiesAPI.getAll(selectedMember.id, { forceRefresh: true })
        setMemberActivities(activities)
      }
    } catch (err) {
      const errorMessage = parseAPIError(err)
      error(errorMessage)
    }
  }

  const handleResendInvite = async () => {
    if (!selectedMember) return

    try {
      setIsSendingInvite(true)
      await membersAPI.resendInvite({
        email: selectedMember.email,
        name: selectedMember.name,
        role: selectedMember.role
      })
      success(`Invite resent to ${selectedMember.email}`)
      await loadMembers(true)
    } catch (err) {
      const errorMessage = parseAPIError(err)
      error(errorMessage)
    } finally {
      setIsSendingInvite(false)
    }
  }

  const handleSendPasswordReset = async () => {
    if (!selectedMember) return

    try {
      setIsSendingInvite(true)
      await membersAPI.sendPasswordReset(selectedMember.email)
      success(`Password reset email sent to ${selectedMember.email}`)
    } catch (err) {
      const errorMessage = parseAPIError(err)
      error(errorMessage)
    } finally {
      setIsSendingInvite(false)
    }
  }

  const handleResendPendingInvites = async () => {
    try {
      setIsResendingPending(true)
      setResendPendingResults(null)
      const result = await membersAPI.resendPendingInvites()
      setResendPendingResults(result.results || [])

      const successCount = result.results?.filter((r: any) => r.success).length || 0
      const totalCount = result.results?.length || 0

      if (totalCount === 0) {
        info('No pending invites to resend - all members have already signed in')
      } else if (successCount === totalCount) {
        success(`Successfully resent ${successCount} invite${successCount > 1 ? 's' : ''}`)
      } else {
        warning(`Resent ${successCount} of ${totalCount} invites`)
      }

      await loadMembers(true)
    } catch (err) {
      const errorMessage = parseAPIError(err)
      error(errorMessage)
    } finally {
      setIsResendingPending(false)
    }
  }

  const handleCloseResendPendingModal = () => {
    setShowResendPendingModal(false)
    setResendPendingResults(null)
    setIsResendingPending(false)
  }

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400">You don't have permission to access this page.</p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading members...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-3 py-3 sm:p-5 portal-animate">
      {/* Header — compact with overflow menu for actions */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-bold font-heading tracking-tight text-gray-900 dark:text-white">Members</h1>
          <span className="text-xs text-gray-500 dark:text-gray-400">{filteredMembers.length}/{members.length}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowResendPendingModal(true)}
            className="p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-md transition-colors"
            title="Resend Pending Invites"
          >
            <IconMail size={18} />
          </button>
          <button
            onClick={() => setShowBulkAddModal(true)}
            className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-md transition-colors"
            title="Bulk Add"
          >
            <IconUsersPlus size={18} />
          </button>
          <button
            onClick={handleAddMember}
            className="bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 flex items-center gap-1.5 text-sm"
          >
            <IconPlus size={16} />
            <span className="hidden sm:inline">Add Member</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
      </div>

      {/* Search + Filters — compact inline */}
      <div className="mb-3 space-y-2">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Search members..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-portal-border bg-white dark:bg-portal-surface text-gray-900 dark:text-white rounded-md focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-portal-surface text-gray-500 hover:bg-gray-100 dark:hover:bg-portal-hover'}`}
              title="Grid view"
            >
              <IconLayoutGrid size={16} />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 ${viewMode === 'table' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-portal-surface text-gray-500 hover:bg-gray-100 dark:hover:bg-portal-hover'}`}
              title="Table view"
            >
              <IconTable size={16} />
            </button>
          </div>
        </div>

        {/* Filter dropdowns — horizontal scroll on mobile */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-0.5">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="flex-shrink-0 pl-2 pr-6 py-1 text-xs border border-gray-300 dark:border-portal-border bg-white dark:bg-portal-surface text-gray-700 dark:text-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:outline-none"
          >
            <option value="all">Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="flex-shrink-0 pl-2 pr-6 py-1 text-xs border border-gray-300 dark:border-portal-border bg-white dark:bg-portal-surface text-gray-700 dark:text-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:outline-none"
          >
            <option value="all">Role</option>
            <option value="official">Official</option>
            <option value="evaluator">Evaluator</option>
            <option value="executive">Executive</option>
            <option value="admin">Admin</option>
          </select>

          <select
            value={certificationFilter}
            onChange={(e) => setCertificationFilter(e.target.value)}
            className="flex-shrink-0 pl-2 pr-6 py-1 text-xs border border-gray-300 dark:border-portal-border bg-white dark:bg-portal-surface text-gray-700 dark:text-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:outline-none"
          >
            <option value="all">Certification</option>
            <option value="none">None</option>
            <option value="Level 1">L1</option>
            <option value="Level 2">L2</option>
            <option value="Level 3">L3</option>
            <option value="Level 4">L4</option>
            <option value="Level 5">L5</option>
          </select>

          {uniqueCities.length > 0 && (
            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="flex-shrink-0 pl-2 pr-6 py-1 text-xs border border-gray-300 dark:border-portal-border bg-white dark:bg-portal-surface text-gray-700 dark:text-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:outline-none"
            >
              <option value="all">City</option>
              {uniqueCities.map(city => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          )}

          {(statusFilter !== 'all' || roleFilter !== 'all' || certificationFilter !== 'all' || cityFilter !== 'all') && (
            <button
              onClick={() => { setStatusFilter('all'); setRoleFilter('all'); setCertificationFilter('all'); setCityFilter('all') }}
              className="flex-shrink-0 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Members Display - Grid or Table */}
      {viewMode === 'grid' ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
            {filteredMembers.map((member) => (
              <div
                key={member.id}
                onClick={() => handleViewMember(member)}
                className="bg-white dark:bg-portal-surface rounded-md border border-gray-200 dark:border-portal-border px-3 py-2.5 hover:shadow-md transition-shadow cursor-pointer flex items-center gap-3"
              >
                <div className="bg-blue-900/40 p-2 rounded-full flex-shrink-0">
                  <IconUser size={16} className="text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm text-gray-900 dark:text-white truncate">{member.name}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{member.email}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className={`px-1.5 py-0.5 text-[10px] rounded ${
                    member.status === 'active'
                      ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                      : 'bg-gray-100 dark:bg-portal-hover text-gray-600 dark:text-gray-300'
                  }`}>
                    {member.status || 'active'}
                  </span>
                  {member.certification_level && (
                    <span className="text-[10px] text-blue-400">{member.certification_level}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {filteredMembers.length === 0 && (
            <div className="text-center py-12 bg-white dark:bg-portal-surface rounded-lg border border-gray-200 dark:border-portal-border">
              <p className="text-gray-600 dark:text-gray-400">No members found.</p>
            </div>
          )}
        </>
      ) : (
        <div className="bg-white dark:bg-portal-surface rounded-lg border border-gray-200 dark:border-portal-border overflow-hidden">
          <DataTable
            data={filteredMembers}
            columns={tableColumns}
            onRowClick={handleViewMember}
            stickyHeader
            maxHeight="calc(100vh - 300px)"
          />
        </div>
      )}

      {/* Member Detail Modal */}
      <Modal
        isOpen={showMemberModal}
        onClose={() => setShowMemberModal(false)}
        title={isEditing ? (selectedMember ? 'Edit Member' : 'Add Member') : 'Member Details'}
        size="lg"
        showCloseButton={false}
      >
        {/* Action buttons in header area - outside scrollable content */}
        <div className="flex flex-wrap gap-2 justify-end mb-4 -mt-2">
          {!isEditing && selectedMember && (
            <>
              {/* Show Reinvite if account not set up, Password Reset if account is complete */}
              {selectedMember.account_setup_complete ? (
                <button
                  onClick={handleSendPasswordReset}
                  disabled={isSendingInvite}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
                >
                  {isSendingInvite ? (
                    <IconLoader2 size={20} className="animate-spin" />
                  ) : (
                    <IconKey size={20} />
                  )}
                  {isSendingInvite ? 'Sending...' : 'Reset Password'}
                </button>
              ) : (
                <button
                  onClick={handleResendInvite}
                  disabled={isSendingInvite}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isSendingInvite ? (
                    <IconLoader2 size={20} className="animate-spin" />
                  ) : (
                    <IconMail size={20} />
                  )}
                  {isSendingInvite ? 'Sending...' : 'Reinvite Member'}
                </button>
              )}
              <button
                onClick={handleEditMember}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <IconEdit size={20} />
                Edit
              </button>
              <button
                onClick={() => selectedMember.id && handleDeleteMember(selectedMember.id)}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 dark:bg-red-600/80 text-white rounded-lg hover:bg-red-700 dark:hover:bg-red-600"
              >
                <IconTrash size={20} />
                Delete
              </button>
            </>
          )}
          {isEditing && (
            <>
              <button
                onClick={handleSaveMember}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                <IconCheck size={20} />
                {isSaving ? 'Saving...' : 'Save'}
              </button>
              {selectedMember && (
                <button
                  onClick={() => setIsEditing(false)}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-500 dark:bg-gray-600 text-white rounded-lg hover:bg-gray-600 dark:hover:bg-gray-500 disabled:opacity-50"
                >
                  <IconX size={20} />
                  Cancel
                </button>
              )}
            </>
          )}
          <button
            onClick={() => setShowMemberModal(false)}
            className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            <IconX size={24} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto -mx-6 px-6">

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Basic Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-portal-border pb-2">Basic Information</h3>

                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Name *</label>
                    {isEditing ? (
                      <>
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-portal-surface text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 ${
                            getFieldError(validationErrors, 'name')
                              ? 'border-red-500'
                              : 'border-gray-300 dark:border-gray-600'
                          }`}
                          required
                        />
                        {getFieldError(validationErrors, 'name') && (
                          <p className="mt-1 text-sm text-red-600">
                            {getFieldError(validationErrors, 'name')}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-gray-900 dark:text-white">{selectedMember?.name}</p>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Email *</label>
                    {isEditing ? (
                      <>
                        <input
                          type="email"
                          value={editForm.email}
                          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                          className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-portal-surface text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 ${
                            getFieldError(validationErrors, 'email')
                              ? 'border-red-500'
                              : 'border-gray-300 dark:border-gray-600'
                          }`}
                          required
                        />
                        {getFieldError(validationErrors, 'email') && (
                          <p className="mt-1 text-sm text-red-600">
                            {getFieldError(validationErrors, 'email')}
                          </p>
                        )}
                        {/* Portal invite is sent automatically when creating a member */}
                        {!selectedMember && (
                          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                            A portal invite will be sent automatically to this email.
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-gray-900 dark:text-white">{selectedMember?.email}</p>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Phone</label>
                    {isEditing ? (
                      <input
                        type="tel"
                        value={editForm.phone || ''}
                        onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-portal-surface text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <p className="text-gray-900 dark:text-white">{selectedMember?.phone || 'Not provided'}</p>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Certification Level</label>
                    {isEditing ? (
                      <select
                        value={editForm.certification_level || ''}
                        onChange={(e) => setEditForm({ ...editForm, certification_level: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-portal-surface text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select level</option>
                        <option value="None">None</option>
                        <option value="Level 1">Level 1</option>
                        <option value="Level 2">Level 2</option>
                        <option value="Level 3">Level 3</option>
                        <option value="Level 4">Level 4</option>
                        <option value="Level 5">Level 5</option>
                      </select>
                    ) : (
                      <p className="text-gray-900 dark:text-white">{selectedMember?.certification_level || 'Not specified'}</p>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Rank</label>
                    {isEditing ? (
                      <input
                        type="number"
                        value={editForm.rank || ''}
                        onChange={(e) => setEditForm({ ...editForm, rank: e.target.value ? parseInt(e.target.value) : undefined })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-portal-surface text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter numeric rank"
                        min="0"
                      />
                    ) : (
                      <p className="text-gray-900 dark:text-white">{selectedMember?.rank || 'Not set'}</p>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Status</label>
                    {isEditing ? (
                      <select
                        value={editForm.status || 'active'}
                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-portal-surface text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    ) : (
                      <p className="text-gray-900 dark:text-white">{selectedMember?.status || 'active'}</p>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Role</label>
                    {isEditing && canModifyRoles ? (
                      <select
                        value={editForm.role || 'official'}
                        onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-portal-surface text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="official">Official</option>
                        <option value="evaluator">Evaluator</option>
                        <option value="executive">Executive</option>
                        <option value="admin">Admin</option>
                      </select>
                    ) : (
                      <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getRoleBadgeColor(selectedMember?.role || 'official')}`}>
                        {formatRole(selectedMember?.role || 'official')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Contact Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-portal-border pb-2">Contact Information</h3>

                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Address</label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editForm.address || ''}
                        onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-portal-surface text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <p className="text-gray-900 dark:text-white">{selectedMember?.address || 'Not provided'}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">City</label>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editForm.city || ''}
                          onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-portal-surface text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      ) : (
                        <p className="text-gray-900 dark:text-white">{selectedMember?.city || 'N/A'}</p>
                      )}
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Province</label>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editForm.province || ''}
                          onChange={(e) => setEditForm({ ...editForm, province: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-portal-surface text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      ) : (
                        <p className="text-gray-900 dark:text-white">{selectedMember?.province || 'N/A'}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Postal Code</label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editForm.postal_code || ''}
                        onChange={(e) => setEditForm({ ...editForm, postal_code: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-portal-surface text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <p className="text-gray-900 dark:text-white">{selectedMember?.postal_code || 'Not provided'}</p>
                    )}
                  </div>

                  <div className="pt-4 border-t border-gray-200 dark:border-portal-border">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Emergency Contact</h4>

                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Name</label>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.emergency_contact_name || ''}
                            onChange={(e) => setEditForm({ ...editForm, emergency_contact_name: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-portal-surface text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          <p className="text-gray-900 dark:text-white">{selectedMember?.emergency_contact_name || 'Not provided'}</p>
                        )}
                      </div>

                      <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Phone</label>
                        {isEditing ? (
                          <input
                            type="tel"
                            value={editForm.emergency_contact_phone || ''}
                            onChange={(e) => setEditForm({ ...editForm, emergency_contact_phone: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-portal-surface text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          <p className="text-gray-900 dark:text-white">{selectedMember?.emergency_contact_phone || 'Not provided'}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-portal-border">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Notes</h3>
                {isEditing ? (
                  <textarea
                    value={editForm.notes || ''}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-portal-surface text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Add notes about this member..."
                  />
                ) : (
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{selectedMember?.notes || 'No notes'}</p>
                )}
              </div>

              {/* Activities Section - Only show when viewing existing member */}
              {selectedMember && !isEditing && (
                <div className="mt-6 pt-6 border-t border-gray-200 dark:border-portal-border">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Activity History</h3>
                    <button
                      onClick={handleAddActivity}
                      className="flex items-center gap-2 px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                    >
                      <IconPlus size={16} />
                      Add Activity
                    </button>
                  </div>

                  {memberActivities.length === 0 ? (
                    <p className="text-gray-600 dark:text-gray-400">No activities recorded yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {memberActivities.map((activity) => (
                        <div key={activity.id} className="flex items-start justify-between p-3 border border-gray-200 dark:border-portal-border rounded-lg">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <IconCalendar size={16} className="text-gray-500 dark:text-gray-400" />
                              <span className="font-semibold text-gray-900 dark:text-white capitalize">{activity.activity_type}</span>
                              <span className="text-gray-600 dark:text-gray-400 text-sm">
                                {new Date(activity.activity_date).toLocaleDateString()}
                              </span>
                            </div>
                            {activity.notes && (
                              <p className="text-gray-700 dark:text-gray-300 text-sm mt-1 ml-6">{activity.notes}</p>
                            )}
                          </div>
                          <button
                            onClick={() => activity.id && handleDeleteActivity(activity.id)}
                            className="text-red-600 dark:text-red-400/70 hover:text-red-700 dark:hover:text-red-400"
                          >
                            <IconTrash size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
        </div>
      </Modal>

      {/* Add Activity Modal */}
      <Modal
        isOpen={showActivityModal}
        onClose={() => setShowActivityModal(false)}
        title="Add Activity"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Activity Type *</label>
            <select
              value={activityForm.activity_type}
              onChange={(e) => setActivityForm({ ...activityForm, activity_type: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-portal-surface text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="game">Regular Game</option>
              <option value="special_game">Special Game (Finals, Zones, Provincials)</option>
              <option value="training">Training</option>
              <option value="evaluation">Evaluation</option>
              <option value="suspension">Suspension</option>
              <option value="meeting">Meeting</option>
              <option value="certification">Certification</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Date *</label>
            <input
              type="date"
              value={activityForm.activity_date}
              onChange={(e) => setActivityForm({ ...activityForm, activity_date: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-portal-surface text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Notes</label>
            <textarea
              value={activityForm.notes || ''}
              onChange={(e) => setActivityForm({ ...activityForm, notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-portal-surface text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Add details about this activity..."
            />
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <button
              onClick={() => setShowActivityModal(false)}
              className="px-4 py-2 bg-gray-500 dark:bg-gray-600 text-white rounded-lg hover:bg-gray-600 dark:hover:bg-gray-500"
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              onClick={handleSaveActivity}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Activity'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Bulk Add Members Modal */}
      <Modal
        isOpen={showBulkAddModal}
        onClose={handleCloseBulkAddModal}
        title="Bulk Add Members"
        size="lg"
      >
        <div className="space-y-4">
          {!bulkAddProgress ? (
            <>
              <p className="text-gray-600 dark:text-gray-400">
                Enter email addresses below (one per line or comma-separated). Each member will receive an invite to set up their account and complete their profile.
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email Addresses
                </label>
                <textarea
                  value={bulkEmails}
                  onChange={(e) => setBulkEmails(e.target.value)}
                  rows={10}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-portal-surface text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  placeholder={"john@example.com\njane@example.com\nbob@example.com"}
                  disabled={isBulkAdding}
                />
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {bulkEmails.split(/[\n,]/).filter(e => e.trim()).length} email(s) entered
                </p>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-gray-200 dark:border-portal-border">
                <button
                  onClick={handleCloseBulkAddModal}
                  className="px-4 py-2 bg-gray-500 dark:bg-gray-600 text-white rounded-lg hover:bg-gray-600 dark:hover:bg-gray-500"
                  disabled={isBulkAdding}
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkAddMembers}
                  disabled={isBulkAdding || !bulkEmails.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isBulkAdding ? (
                    <>
                      <IconLoader2 size={20} className="animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <IconUsersPlus size={20} />
                      Add Members & Send Invites
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Progress display */}
              <div className="space-y-4">
                {isBulkAdding && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        Processing {bulkAddProgress.processed} of {bulkAddProgress.total}...
                      </span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {Math.round((bulkAddProgress.processed / bulkAddProgress.total) * 100)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-portal-hover rounded-full h-2">
                      <div
                        className="bg-emerald-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(bulkAddProgress.processed / bulkAddProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {!isBulkAdding && (
                  <div className="text-center py-2">
                    <p className="text-lg font-medium text-gray-900 dark:text-white">
                      Processing Complete
                    </p>
                    <p className="text-gray-600 dark:text-gray-400">
                      {bulkAddProgress.results.filter(r => r.success).length} successful, {bulkAddProgress.results.filter(r => !r.success).length} failed
                    </p>
                  </div>
                )}

                {/* Results list */}
                <div className="max-h-80 overflow-y-auto space-y-2">
                  {bulkAddProgress.results.map((result, index) => (
                    <div
                      key={index}
                      className={`flex items-center justify-between p-3 rounded-lg ${
                        result.success
                          ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                          : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {result.success ? (
                          <IconCheck size={18} className="text-green-600 dark:text-green-400 flex-shrink-0" />
                        ) : (
                          <IconAlertCircle size={18} className="text-red-600 dark:text-red-400 flex-shrink-0" />
                        )}
                        <span className="text-gray-900 dark:text-white truncate">
                          {result.email}
                        </span>
                      </div>
                      <span className={`text-sm flex-shrink-0 ml-2 ${
                        result.success ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'
                      }`}>
                        {result.message}
                      </span>
                    </div>
                  ))}
                </div>

                {!isBulkAdding && (
                  <div className="flex gap-3 justify-end pt-4 border-t border-gray-200 dark:border-portal-border">
                    <button
                      onClick={() => {
                        setBulkAddProgress(null)
                        setBulkEmails('')
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Add More Members
                    </button>
                    <button
                      onClick={handleCloseBulkAddModal}
                      className="px-4 py-2 bg-gray-500 dark:bg-gray-600 text-white rounded-lg hover:bg-gray-600 dark:hover:bg-gray-500"
                    >
                      Close
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Resend Pending Invites Modal */}
      <Modal
        isOpen={showResendPendingModal}
        onClose={handleCloseResendPendingModal}
        title="Resend Pending Invites"
        size="lg"
      >
        <div className="space-y-4">
          {!resendPendingResults ? (
            <>
              <p className="text-gray-600 dark:text-gray-400">
                This will resend invite emails to all members who haven't signed in yet. Their previous invite links will be invalidated and new ones will be sent.
              </p>

              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <IconAlertCircle className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" size={20} />
                  <div className="text-sm text-amber-800 dark:text-amber-200">
                    <p className="font-medium">Note:</p>
                    <p>This may take a moment if there are many pending invites. Each member will receive a fresh invite email.</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-gray-200 dark:border-portal-border">
                <button
                  onClick={handleCloseResendPendingModal}
                  className="px-4 py-2 bg-gray-500 dark:bg-gray-600 text-white rounded-lg hover:bg-gray-600 dark:hover:bg-gray-500"
                  disabled={isResendingPending}
                >
                  Cancel
                </button>
                <button
                  onClick={handleResendPendingInvites}
                  disabled={isResendingPending}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
                >
                  {isResendingPending ? (
                    <>
                      <IconLoader2 size={20} className="animate-spin" />
                      Sending Invites...
                    </>
                  ) : (
                    <>
                      <IconMail size={20} />
                      Resend All Pending Invites
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Results display */}
              <div className="space-y-4">
                <div className="text-center py-2">
                  <p className="text-lg font-medium text-gray-900 dark:text-white">
                    {resendPendingResults.length === 0 ? 'No Pending Invites' : 'Resend Complete'}
                  </p>
                  {resendPendingResults.length > 0 && (
                    <p className="text-gray-600 dark:text-gray-400">
                      {resendPendingResults.filter(r => r.success).length} successful, {resendPendingResults.filter(r => !r.success).length} failed
                    </p>
                  )}
                </div>

                {resendPendingResults.length === 0 ? (
                  <p className="text-center text-gray-600 dark:text-gray-400">
                    All members have already signed in to the portal.
                  </p>
                ) : (
                  <div className="max-h-80 overflow-y-auto space-y-2">
                    {resendPendingResults.map((result, index) => (
                      <div
                        key={index}
                        className={`flex items-center justify-between p-3 rounded-lg ${
                          result.success
                            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                            : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {result.success ? (
                            <IconCheck size={18} className="text-green-600 dark:text-green-400 flex-shrink-0" />
                          ) : (
                            <IconAlertCircle size={18} className="text-red-600 dark:text-red-400 flex-shrink-0" />
                          )}
                          <span className="text-gray-900 dark:text-white truncate">
                            {result.email}
                          </span>
                        </div>
                        <span className={`text-sm flex-shrink-0 ml-2 ${
                          result.success ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'
                        }`}>
                          {result.message}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-3 justify-end pt-4 border-t border-gray-200 dark:border-portal-border">
                  <button
                    onClick={handleCloseResendPendingModal}
                    className="px-4 py-2 bg-gray-500 dark:bg-gray-600 text-white rounded-lg hover:bg-gray-600 dark:hover:bg-gray-500"
                  >
                    Close
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}
