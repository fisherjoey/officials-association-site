/**
 * Supabase Auth Admin API — manage auth users, invites, syncing.
 */
import { apiFetch, getAuthToken, API_BASE, AppError } from './client'
import { invalidateCache } from '../cache'

export interface AuthUser {
  id: string
  email: string
  name?: string
  confirmed: boolean
  confirmed_at?: string
  invited_at?: string
  created_at?: string
  last_sign_in_at?: string
  has_logged_in?: boolean
  role?: string
  roles: string[]
}

export type IdentityUser = AuthUser

export interface AuthStatus {
  exists: boolean
  id?: string
  email?: string
  name?: string
  confirmed?: boolean
  confirmed_at?: string
  invited_at?: string
  created_at?: string
  last_sign_in_at?: string
  has_logged_in?: boolean
  role?: string
  roles?: string[]
}

export type IdentityStatus = AuthStatus

export const supabaseAuthAPI = {
  async listUsers(): Promise<AuthUser[]> {
    const token = await getAuthToken()
    if (!token) throw new AppError('Not authenticated', 'AUTH_ERROR', 401)
    const res = await apiFetch(`${API_BASE}/supabase-auth-admin?action=list`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const data = await res.json()
    return data.users || []
  },

  async getStatus(email: string): Promise<AuthStatus> {
    const token = await getAuthToken()
    if (!token) return { exists: false }
    try {
      const res = await apiFetch(`${API_BASE}/supabase-auth-admin?email=${encodeURIComponent(email)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      return await res.json()
    } catch {
      return { exists: false }
    }
  },

  async sendInvite(email: string, name?: string, role?: string): Promise<{ success: boolean; message?: string; error?: string }> {
    const token = await getAuthToken()
    if (!token) throw new AppError('Not authenticated', 'AUTH_ERROR', 401)
    const res = await apiFetch(`${API_BASE}/supabase-auth-admin`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ email, name, role })
    })
    return res.json()
  },

  async resendInvite(email: string, name?: string, role?: string): Promise<{ success: boolean; message?: string; error?: string }> {
    const token = await getAuthToken()
    if (!token) throw new AppError('Not authenticated', 'AUTH_ERROR', 401)
    const res = await apiFetch(`${API_BASE}/supabase-auth-admin`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ email, name, role, action: 'resend' })
    })
    return res.json()
  },

  async updateUser(userId: string, data: { role?: string; name?: string }): Promise<{ success: boolean; message?: string; error?: string }> {
    const token = await getAuthToken()
    if (!token) throw new AppError('Not authenticated', 'AUTH_ERROR', 401)
    const res = await apiFetch(`${API_BASE}/supabase-auth-admin`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ userId, ...data })
    })
    return res.json()
  },

  async deleteUser(email: string): Promise<{ success: boolean; message?: string; error?: string }> {
    const token = await getAuthToken()
    if (!token) throw new AppError('Not authenticated', 'AUTH_ERROR', 401)
    const res = await apiFetch(`${API_BASE}/supabase-auth-admin?email=${encodeURIComponent(email)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    })
    return res.json()
  },

  async syncMembersAuth(dryRun: boolean = false) {
    const token = await getAuthToken()
    if (!token) throw new AppError('Not authenticated', 'AUTH_ERROR', 401)
    const res = await apiFetch(`${API_BASE}/sync-members-auth`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ dryRun })
    })
    return res.json()
  }
}

export const identityAPI = supabaseAuthAPI
