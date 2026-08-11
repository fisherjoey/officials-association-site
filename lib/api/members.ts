/**
 * Members & member activities APIs with mock data fallback.
 */
import { apiFetch, retryAsync, getAuthToken, isBrowser, API_BASE, USE_MOCK_DATA, AppError } from './client'
import {
  mockMembers, mockActivities,
  getMemberByNetlifyId, getMemberById,
  getActivitiesByMemberId,
  createMockMember, updateMockMember, deleteMockMember
} from '../mockData/members'
import { getFromCache, saveToCache, invalidateCache, CACHE_TTL } from '../cache'

export const membersAPI = {
  async getAll(options?: { forceRefresh?: boolean }) {
    const cacheKey = 'members'
    if (!options?.forceRefresh && isBrowser()) {
      const cached = getFromCache(cacheKey)
      if (cached) return cached
    }
    try {
      const data = await retryAsync(async () => {
        const res = await apiFetch(`${API_BASE}/members`)
        return res.json()
      })
      if (isBrowser()) saveToCache(cacheKey, data)
      return data
    } catch (error) {
      if (USE_MOCK_DATA) { console.warn('Using mock data for members'); return mockMembers }
      throw error
    }
  },

  async getByNetlifyId(netlifyUserId: string) {
    try {
      return await retryAsync(async () => {
        const res = await apiFetch(`${API_BASE}/members?netlify_user_id=${netlifyUserId}`)
        return res.json()
      })
    } catch (error) {
      if (USE_MOCK_DATA) return getMemberByNetlifyId(netlifyUserId)
      throw error
    }
  },

  async getByUserId(userId: string) {
    try {
      return await retryAsync(async () => {
        const res = await apiFetch(`${API_BASE}/members?user_id=${userId}`)
        return res.json()
      })
    } catch (error) {
      if (USE_MOCK_DATA) return getMemberByNetlifyId(userId)
      throw error
    }
  },

  async getByEmail(email: string) {
    try {
      return await retryAsync(async () => {
        const res = await apiFetch(`${API_BASE}/members?email=${encodeURIComponent(email)}`)
        return res.json()
      })
    } catch (error) {
      if (USE_MOCK_DATA) return null
      throw error
    }
  },

  async getById(id: string) {
    try {
      return await retryAsync(async () => {
        const res = await apiFetch(`${API_BASE}/members?id=${id}`)
        return res.json()
      })
    } catch (error) {
      if (USE_MOCK_DATA) return getMemberById(id)
      throw error
    }
  },

  async create(member: any) {
    try {
      const res = await apiFetch(`${API_BASE}/members`, { method: 'POST', body: JSON.stringify(member) })
      invalidateCache('members')
      return res.json()
    } catch (error) {
      if (USE_MOCK_DATA) return createMockMember(member)
      throw error
    }
  },

  async update(member: any) {
    try {
      const res = await apiFetch(`${API_BASE}/members`, { method: 'PUT', body: JSON.stringify(member) })
      invalidateCache('members')
      return res.json()
    } catch (error) {
      if (USE_MOCK_DATA) return updateMockMember(member.id, member)
      throw error
    }
  },

  async delete(id: string) {
    try {
      await apiFetch(`${API_BASE}/members?id=${id}`, { method: 'DELETE' })
      invalidateCache('members')
    } catch (error) {
      if (USE_MOCK_DATA) { deleteMockMember(id); return }
      throw error
    }
  },

  async resendInvite(member: { email: string; name: string; role?: string }) {
    const token = await getAuthToken()
    if (!token) throw new AppError('Not authenticated', 'AUTH_ERROR', 401)
    const res = await apiFetch(`${API_BASE}/supabase-auth-admin`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ action: 'resend', email: member.email, name: member.name, role: member.role || 'official' })
    })
    invalidateCache('members')
    return res.json()
  },

  async sendPasswordReset(email: string) {
    const token = await getAuthToken()
    if (!token) throw new AppError('Not authenticated', 'AUTH_ERROR', 401)
    const res = await apiFetch(`${API_BASE}/supabase-auth-admin`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ action: 'reset_password', email })
    })
    return res.json()
  },

  async resendPendingInvites() {
    const token = await getAuthToken()
    if (!token) throw new AppError('Not authenticated', 'AUTH_ERROR', 401)
    const res = await apiFetch(`${API_BASE}/supabase-auth-admin`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ action: 'resend_pending' })
    })
    invalidateCache('members')
    return res.json()
  }
}

export const memberActivitiesAPI = {
  async getAll(memberId?: string, options?: { forceRefresh?: boolean }) {
    const cacheKey = memberId ? `memberActivities_${memberId}` : 'memberActivities'
    if (!options?.forceRefresh && isBrowser()) {
      const cached = getFromCache(cacheKey)
      if (cached) return cached
    }
    try {
      const data = await retryAsync(async () => {
        const url = memberId ? `${API_BASE}/member-activities?member_id=${memberId}` : `${API_BASE}/member-activities`
        const res = await apiFetch(url)
        return res.json()
      })
      if (isBrowser()) saveToCache(cacheKey, data, CACHE_TTL.memberActivities)
      return data
    } catch (error) {
      if (USE_MOCK_DATA) return memberId ? getActivitiesByMemberId(memberId) : mockActivities
      throw error
    }
  },

  async create(activity: any) {
    try {
      const res = await apiFetch(`${API_BASE}/member-activities`, { method: 'POST', body: JSON.stringify(activity) })
      invalidateCache('memberActivities')
      if (activity.member_id) invalidateCache(`memberActivities_${activity.member_id}`)
      return res.json()
    } catch (error) {
      if (USE_MOCK_DATA) {
        const newActivity = { id: `mock-activity-${Date.now()}`, ...activity, created_at: new Date().toISOString() }
        mockActivities.push(newActivity)
        return newActivity
      }
      throw error
    }
  },

  async update(activity: any) {
    const res = await apiFetch(`${API_BASE}/member-activities`, { method: 'PUT', body: JSON.stringify(activity) })
    invalidateCache('memberActivities')
    if (activity.member_id) invalidateCache(`memberActivities_${activity.member_id}`)
    return res.json()
  },

  async delete(id: string, memberId?: string) {
    await apiFetch(`${API_BASE}/member-activities?id=${id}`, { method: 'DELETE' })
    invalidateCache('memberActivities')
    if (memberId) invalidateCache(`memberActivities_${memberId}`)
  }
}
