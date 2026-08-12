'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { IconSend, IconUsers, IconMail, IconCheck, IconAlertCircle, IconEye, IconX } from '@tabler/icons-react'
import { useToast } from '@/contexts/ToastContext'
import { JoditEditor } from '@/components/JoditEditor'
import { generateEmailTemplate } from '@/lib/emailTemplate'
import { readFriendlyError, friendlyErrorFromThrown } from '@/lib/userFacingError'
import { DEFAULT_AUTHOR } from '@/lib/siteConfig'
import {
  AUDIENCE_GROUPS,
  audienceGroupsFor,
  findAudienceGroup,
  hasRole,
  principalInAudienceGroup,
  toPrincipal,
  type Principal,
} from '@/lib/roles'

/**
 * A row in the recipient picker. Carries a resolved principal rather than a
 * role string, because group membership now asks two different questions —
 * "what rung" and "which grants" — and a single string can only answer one.
 */
interface MailRecipient {
  email: string
  name: string
  principal: Principal
}

export default function MailPage() {
  const { user, getAccessToken } = useAuth()
  const router = useRouter()
  const { addToast } = useToast()

  const [subject, setSubject] = useState('')
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [manuallySelected, setManuallySelected] = useState<string[]>([])
  const [excludedFromGroups, setExcludedFromGroups] = useState<string[]>([])
  const [externalEmails, setExternalEmails] = useState<string[]>([])
  const [content, setContent] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [showPreview, setShowPreview] = useState(true)
  const [rankFilter, setRankFilter] = useState('')
  const [memberSearch, setMemberSearch] = useState('')
  const [externalEmailInput, setExternalEmailInput] = useState('')
  const [allMembers, setAllMembers] = useState<MailRecipient[]>([])
  const [saveAsAnnouncement, setSaveAsAnnouncement] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [previewInitialized, setPreviewInitialized] = useState(false)

  // Generate the initial template shell (only once)
  const templateShell = useMemo(() => {
    return generateEmailTemplate({
      subject: 'Email Subject',
      content: '<div id="live-content"></div>',
      previewText: ''
    })
  }, [])

  // Update just the content inside the iframe (no full reload)
  useEffect(() => {
    if (!previewInitialized || !iframeRef.current) return

    const iframeDoc = iframeRef.current.contentDocument
    if (!iframeDoc) return

    const contentDiv = iframeDoc.getElementById('live-content')
    if (contentDiv) {
      contentDiv.innerHTML = content || '<p style="color: #999;">Start typing to see your content here...</p>'
    }

    // Update subject in preview text if it exists
    const titleEl = iframeDoc.querySelector('title')
    if (titleEl) {
      titleEl.textContent = subject || 'Email Subject'
    }
  }, [content, subject, previewInitialized])

  // Handle iframe load
  const handleIframeLoad = () => {
    setPreviewInitialized(true)
  }

  // Redirect non-executives
  useEffect(() => {
    if (user && !hasRole(user, 'executive')) {
      router.push('/portal')
    }
  }, [user, router])

  // Fetch all members for email selection
  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const API_BASE = process.env.NODE_ENV === 'production'
          ? '/.netlify/functions'
          : 'http://localhost:9000/.netlify/functions'

        const token = await getAccessToken()
        const response = await fetch(`${API_BASE}/members`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : undefined
        })
        if (response.ok) {
          const data = await response.json()
          setAllMembers(data.map((m: any) => ({
            email: m.email,
            name: `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.name || m.email,
            principal: toPrincipal({ role: m.role, capabilities: m.capabilities }),
          })))
        }
      } catch (error) {
        console.error('Error fetching members:', error)
      }
    }
    fetchMembers()
  }, [getAccessToken])

  // Built from AUDIENCE_GROUPS so this list and the one send-email.ts resolves
  // cannot drift. "By Role" is the org ladder, "By Capability" is what someone
  // does — the old flat list mixed the two under one heading and could not
  // address an executive who also evaluates.
  const recipientGroups = [
    { id: 'all', label: 'All Members', description: 'Everyone in the portal', category: 'General' },
    ...AUDIENCE_GROUPS.map(g => ({
      id: g.id,
      label: g.label,
      description: g.description,
      category: g.role ? 'By Role' : 'By Capability',
    })),
  ]

  // Group recipients by category
  const groupedRecipients = recipientGroups.reduce((acc, group) => {
    if (!acc[group.category]) {
      acc[group.category] = []
    }
    acc[group.category].push(group)
    return acc
  }, {} as Record<string, typeof recipientGroups>)

  // Helper to check if a member belongs to a group
  const memberBelongsToGroup = (member: MailRecipient, groupId: string): boolean =>
    principalInAudienceGroup(member.principal, groupId)

  // Check if member is selected via any group
  const isMemberSelectedViaGroup = (member: MailRecipient): boolean => {
    if (excludedFromGroups.includes(member.email)) return false
    return selectedGroups.some(groupId => memberBelongsToGroup(member, groupId))
  }

  // Check if member is selected (either via group or manually)
  const isMemberSelected = (member: MailRecipient): boolean => {
    return isMemberSelectedViaGroup(member) || manuallySelected.includes(member.email)
  }

  // Get groups that a member belongs to (for display)
  const getMemberGroups = (member: MailRecipient): string[] =>
    audienceGroupsFor(member.principal)

  // Compute final selected emails
  const computedSelectedEmails = useMemo(() => {
    const emails = new Set<string>()

    // Add members selected via groups (excluding overrides)
    allMembers.forEach(member => {
      if (isMemberSelectedViaGroup(member)) {
        emails.add(member.email)
      }
    })

    // Add manually selected members
    manuallySelected.forEach(email => emails.add(email))

    // Add external emails
    externalEmails.forEach(email => emails.add(email))

    return Array.from(emails)
  }, [allMembers, selectedGroups, manuallySelected, excludedFromGroups, externalEmails])

  const toggleRecipientGroup = (groupId: string) => {
    setSelectedGroups(prev =>
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    )
    // Clear exclusions when group is toggled off
    if (selectedGroups.includes(groupId)) {
      // Group is being removed, clear exclusions for members of that group
      const membersOfGroup = allMembers.filter(m => memberBelongsToGroup(m, groupId))
      setExcludedFromGroups(prev =>
        prev.filter(email => !membersOfGroup.some(m => m.email === email))
      )
    }
  }

  // Filter members based on search
  const filteredMembers = allMembers.filter(member =>
    member.email.toLowerCase().includes(memberSearch.toLowerCase()) ||
    member.name.toLowerCase().includes(memberSearch.toLowerCase())
  )

  // Check if search text is a valid email format
  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }

  // Toggle individual member selection
  const toggleMemberSelection = (member: MailRecipient) => {
    const isSelected = isMemberSelected(member)
    const isExcluded = excludedFromGroups.includes(member.email)
    const belongsToSelectedGroup = selectedGroups.some(groupId => memberBelongsToGroup(member, groupId))
    const isManuallySelected = manuallySelected.includes(member.email)

    if (isSelected) {
      // Currently selected - need to deselect
      if (isManuallySelected) {
        // Remove from manual selection
        setManuallySelected(prev => prev.filter(e => e !== member.email))
      }
      if (belongsToSelectedGroup && !isExcluded) {
        // Add to exclusions if they belong to a selected group
        setExcludedFromGroups(prev => [...prev, member.email])
      }
    } else {
      // Currently not selected - need to select
      if (isExcluded) {
        // Remove from exclusions (will be selected via group again)
        setExcludedFromGroups(prev => prev.filter(e => e !== member.email))
      } else {
        // Add to manual selection
        setManuallySelected(prev => [...prev, member.email])
      }
    }
  }

  // Add external email
  const addExternalEmail = () => {
    const email = externalEmailInput.trim()
    if (isValidEmail(email) && !externalEmails.includes(email) && !allMembers.some(m => m.email === email)) {
      setExternalEmails(prev => [...prev, email])
      setExternalEmailInput('')
    }
  }

  // Remove external email
  const removeExternalEmail = (email: string) => {
    setExternalEmails(prev => prev.filter(e => e !== email))
  }

  // Select all visible members
  const selectAllMembers = () => {
    const emailsToAdd = filteredMembers
      .filter(m => !isMemberSelected(m))
      .map(m => m.email)
    setManuallySelected(prev => [...prev, ...emailsToAdd])
    // Clear any exclusions for filtered members
    setExcludedFromGroups(prev =>
      prev.filter(email => !filteredMembers.some(m => m.email === email))
    )
  }

  // Deselect all members
  const deselectAllMembers = () => {
    setManuallySelected([])
    // Add all group-selected members to exclusions
    const groupSelectedEmails = allMembers
      .filter(m => selectedGroups.some(g => memberBelongsToGroup(m, g)))
      .map(m => m.email)
    setExcludedFromGroups(groupSelectedEmails)
  }

  const handleSend = async () => {
    // Validation
    if (!subject.trim()) {
      addToast('Please enter a subject line', 'error')
      return
    }

    if (computedSelectedEmails.length === 0) {
      addToast('Please select at least one recipient', 'error')
      return
    }

    if (!content.trim()) {
      addToast('Please enter email content', 'error')
      return
    }

    setIsSending(true)

    try {
      // Content is already HTML from the rich-text editor
      const htmlContent = content

      const API_BASE = process.env.NODE_ENV === 'production'
        ? '/.netlify/functions'
        : 'http://localhost:9000/.netlify/functions'

      // Get auth token for the request
      const token = await getAccessToken()

      // Send computed email list directly instead of groups
      const response = await fetch(`${API_BASE}/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          subject,
          recipientGroups: [], // Not using groups anymore, sending direct list
          customEmails: computedSelectedEmails,
          htmlContent,
          rankFilter: rankFilter || undefined
        })
      })

      if (!response.ok) {
        const friendly = await readFriendlyError(response)
        throw new Error(friendly.message)
      }

      const data = await response.json()
      addToast(`Email sent successfully to ${data.recipientCount} recipients!`, 'success')

      // Save as announcement if checkbox is selected
      if (saveAsAnnouncement) {
        try {
          await saveEmailAsAnnouncement(subject, content)
          addToast('Email sent and saved as announcement!', 'success')
        } catch (announcementError) {
          console.error('Failed to save announcement:', announcementError)
          addToast('Email sent but failed to save as announcement', 'warning')
        }
      }

      // Reset form
      setSubject('')
      setSelectedGroups([])
      setManuallySelected([])
      setExcludedFromGroups([])
      setExternalEmails([])
      setContent('')
      setRankFilter('')
      setSaveAsAnnouncement(false)
    } catch (error) {
      console.error('Error sending email:', error)
      addToast(friendlyErrorFromThrown(error).message, 'error')
    } finally {
      setIsSending(false)
    }
  }

  const saveEmailAsAnnouncement = async (title: string, htmlContent: string) => {
    const API_BASE = process.env.NODE_ENV === 'production'
      ? '/.netlify/functions'
      : 'http://localhost:9000/.netlify/functions'

    const response = await fetch(`${API_BASE}/announcements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        content: htmlContent, // Already HTML, no template wrapping needed
        category: 'general',
        priority: 'normal',
        author: DEFAULT_AUTHOR,
        date: new Date().toISOString()
      })
    })

    if (!response.ok) {
      const friendly = await readFriendlyError(response)
      throw new Error(friendly.message)
    }
  }

  if (!user || !hasRole(user, 'executive')) {
    return null
  }

  return (
    <div className="px-3 py-3 sm:p-5 portal-animate">
      {/* Header — compact */}
      <div className="mb-3">
        <h1 className="text-xl sm:text-2xl font-bold font-heading tracking-tight text-gray-900 dark:text-white">Send Email</h1>
      </div>

      {/* Email Composer */}
      <div className="bg-white dark:bg-portal-surface rounded-lg border border-gray-200 dark:border-portal-border p-3 sm:p-4 space-y-4">

        {/* Subject Line */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Subject *</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Enter email subject..."
            className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-orange-500 focus:outline-none bg-white dark:bg-portal-hover text-gray-900 dark:text-white"
          />
        </div>

        {/* Recipient Groups */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Recipients *</label>
          <div className="space-y-3">
            {Object.entries(groupedRecipients).map(([category, groups]) => (
              <div key={category}>
                <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">{category}</p>
                <div className="flex flex-wrap gap-1.5">
                  {groups.map(group => (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => toggleRecipientGroup(group.id)}
                      className={`px-2.5 py-1.5 border rounded-md text-left transition-all text-xs font-medium ${
                        selectedGroups.includes(group.id)
                          ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300'
                          : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                      }`}
                    >
                      {group.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Filter by Rank */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Rank Filter (optional)</label>
          <select
            value={rankFilter}
            onChange={(e) => setRankFilter(e.target.value)}
            className="pl-3 pr-8 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-orange-500 focus:outline-none bg-white dark:bg-portal-hover text-gray-900 dark:text-white"
          >
            <option value="">No filter</option>
            <option value="150+">150+</option>
            <option value="175+">175+</option>
            <option value="200+">200+</option>
            <option value="225+">225+</option>
            <option value="250+">250+</option>
            <option value="275+">275+</option>
            <option value="300+">300+</option>
          </select>
        </div>

        {/* Individual Member Selection */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Individual Recipients</label>

          {/* Search and Actions Bar */}
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <input
              type="text"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Search members by name or email..."
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white dark:bg-portal-hover text-gray-900 dark:text-white placeholder-gray-400"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectAllMembers}
                className="px-3 py-2 text-sm bg-gray-100 dark:bg-portal-hover text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={deselectAllMembers}
                className="px-3 py-2 text-sm bg-gray-100 dark:bg-portal-hover text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Member List */}
          <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
            <div className="max-h-64 overflow-y-auto">
              {filteredMembers.length > 0 ? (
                filteredMembers.map(member => {
                  const isSelected = isMemberSelected(member)
                  const isViaGroup = isMemberSelectedViaGroup(member)
                  const isExcluded = excludedFromGroups.includes(member.email)
                  const memberGroups = getMemberGroups(member)

                  return (
                    <div
                      key={member.email}
                      onClick={() => toggleMemberSelection(member)}
                      className={`px-4 py-2.5 cursor-pointer flex items-center gap-3 border-b border-gray-100 dark:border-portal-border last:border-b-0 transition-colors ${
                        isSelected
                          ? 'bg-orange-50 dark:bg-orange-900/20'
                          : 'hover:bg-gray-50 dark:hover:bg-portal-hover'
                      } ${isExcluded ? 'opacity-60' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="h-4 w-4 text-orange-600 rounded border-gray-300 dark:border-gray-500 focus:ring-orange-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {member.name}
                          </span>
                          {memberGroups.map(group => (
                            <span
                              key={group}
                              className={`text-xs px-1.5 py-0.5 rounded ${
                                isViaGroup && selectedGroups.some(g =>
                                  g === 'all' || findAudienceGroup(g)?.label === group
                                )
                                  ? 'bg-orange-200 dark:bg-orange-800 text-orange-800 dark:text-orange-200'
                                  : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                              }`}
                            >
                              {group}
                            </span>
                          ))}
                          {isExcluded && (
                            <span className="text-xs text-red-500 dark:text-red-400">excluded</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {member.email}
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                  {memberSearch ? 'No members match your search' : 'No members available'}
                </div>
              )}
            </div>
          </div>

          {/* Selected Count */}
          <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {computedSelectedEmails.length} recipient{computedSelectedEmails.length !== 1 ? 's' : ''} selected
            {externalEmails.length > 0 && ` (including ${externalEmails.length} external)`}
          </div>
        </div>

        {/* External Email Addresses */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">External Emails (optional)</label>
          <div className="flex gap-2">
            <input
              type="email"
              value={externalEmailInput}
              onChange={(e) => setExternalEmailInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addExternalEmail()
                }
              }}
              placeholder="Enter non-member email address..."
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white dark:bg-portal-hover text-gray-900 dark:text-white placeholder-gray-400"
            />
            <button
              type="button"
              onClick={addExternalEmail}
              disabled={!isValidEmail(externalEmailInput)}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>

          {/* External Emails List */}
          {externalEmails.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {externalEmails.map(email => (
                <div
                  key={email}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-900/30 border border-blue-700 rounded-lg text-sm"
                >
                  <span className="text-gray-900 dark:text-white">{email}</span>
                  <button
                    type="button"
                    onClick={() => removeExternalEmail(email)}
                    className="text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    <IconX className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Email Content Editor with Preview */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">Content *</label>
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-portal-hover text-gray-700 dark:text-gray-300 transition-colors"
            >
              <IconEye className="h-4 w-4" />
              {showPreview ? 'Hide' : 'Show'} Preview
            </button>
          </div>

          <div className="flex flex-col gap-4">
            {/* Editor */}
            <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
              <JoditEditor
                value={content}
                onChange={setContent}
                placeholder="Write your email content here using Markdown..."
                height={350}
              />
            </div>

            {/* Live Preview */}
            {showPreview && (
              <div className="rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
                <div className="bg-gray-700 dark:bg-portal-bg text-white px-4 py-2 text-sm font-semibold flex items-center gap-2">
                  <IconEye className="h-4 w-4" />
                  Live Email Preview
                </div>
                <div className="bg-gray-100 dark:bg-portal-surface p-4">
                  <iframe
                    ref={iframeRef}
                    srcDoc={templateShell}
                    onLoad={handleIframeLoad}
                    className="w-full border-0"
                    style={{ height: '400px' }}
                    title="Email Preview"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Save as Announcement Checkbox */}
        <div className="border-t border-gray-200 dark:border-portal-border pt-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={saveAsAnnouncement}
              onChange={(e) => setSaveAsAnnouncement(e.target.checked)}
              className="h-5 w-5 text-orange-600 border-gray-300 dark:border-gray-500 rounded focus:ring-orange-500"
            />
            <div>
              <div className="font-medium text-gray-900 dark:text-white">Also save as announcement</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Post this email content to News & Announcements</div>
            </div>
          </label>

          {saveAsAnnouncement && (
            <div className="mt-3 ml-8 p-3 bg-gray-50 dark:bg-portal-hover rounded-lg">
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">This will be saved as:</p>
              <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc list-inside">
                <li>Title: <span className="font-medium">{subject || '(Email Subject)'}</span></li>
                <li>Category: <span className="font-medium">General</span></li>
                <li>Priority: <span className="font-medium">Normal</span></li>
              </ul>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">The content will be saved without the email template styling.</p>
            </div>
          )}
        </div>

        {/* Info Banner */}
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg p-4 flex gap-3">
          <IconAlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-orange-800 dark:text-orange-300">
            <p className="font-semibold mb-1">Email Sending Notes:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Emails will be sent from the sender address configured for this site</li>
              <li>All sent emails will appear in the shared mailbox Sent Items</li>
              <li>Recipients are determined by their portal role and certification level</li>
              <li>Please review your content carefully before sending</li>
            </ul>
          </div>
        </div>

        {/* Send Button */}
        <div className="flex flex-col sm:flex-row justify-end gap-2 pt-4 border-t border-gray-200 dark:border-portal-border">
          <button
            type="button"
            onClick={() => router.push('/portal')}
            className="bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 flex items-center justify-center gap-2"
          >
            <IconX className="h-5 w-5" />
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={isSending}
            className="bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSending ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Sending...
              </>
            ) : (
              <>
                <IconSend className="h-4 w-4" />
                Send Email
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
