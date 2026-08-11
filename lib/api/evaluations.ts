/**
 * Evaluations API.
 */
import { apiFetch, retryAsync, isBrowser, API_BASE } from './client'
import { getFromCache, saveToCache, invalidateCache } from '../cache'

export interface Evaluation {
  id: string
  member_id: string
  evaluator_id?: string
  evaluation_date: string
  file_url: string
  file_name: string
  title?: string
  notes?: string
  activity_id?: string
  created_at: string
  updated_at: string
  member?: { id: string; name: string; email: string }
  evaluator?: { id: string; name: string; email: string }
}

export const evaluationsAPI = {
  async getAll(token?: string, options?: { forceRefresh?: boolean }): Promise<Evaluation[]> {
    const cacheKey = 'evaluations'
    if (!options?.forceRefresh && isBrowser()) {
      const cached = getFromCache<Evaluation[]>(cacheKey)
      if (cached) return cached
    }
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    const data = await retryAsync(async () => { const res = await apiFetch(`${API_BASE}/evaluations`, { headers }); return res.json() })
    if (isBrowser()) saveToCache(cacheKey, data)
    return data
  },

  async getByMemberId(memberId: string, token?: string, options?: { forceRefresh?: boolean }): Promise<Evaluation[]> {
    const cacheKey = `evaluations_member_${memberId}`
    if (!options?.forceRefresh && isBrowser()) {
      const cached = getFromCache<Evaluation[]>(cacheKey)
      if (cached) return cached
    }
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    const data = await retryAsync(async () => { const res = await apiFetch(`${API_BASE}/evaluations?member_id=${memberId}`, { headers }); return res.json() })
    if (isBrowser()) saveToCache(cacheKey, data)
    return data
  },

  async getByEvaluatorId(evaluatorId: string, token?: string, options?: { forceRefresh?: boolean }): Promise<Evaluation[]> {
    const cacheKey = `evaluations_evaluator_${evaluatorId}`
    if (!options?.forceRefresh && isBrowser()) {
      const cached = getFromCache<Evaluation[]>(cacheKey)
      if (cached) return cached
    }
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    const data = await retryAsync(async () => { const res = await apiFetch(`${API_BASE}/evaluations?evaluator_id=${evaluatorId}`, { headers }); return res.json() })
    if (isBrowser()) saveToCache(cacheKey, data)
    return data
  },

  async getById(id: string, token?: string): Promise<Evaluation> {
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    return retryAsync(async () => { const res = await apiFetch(`${API_BASE}/evaluations?id=${id}`, { headers }); return res.json() })
  },

  async create(evaluation: Partial<Evaluation>, token?: string): Promise<Evaluation> {
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    const res = await apiFetch(`${API_BASE}/evaluations`, { method: 'POST', headers, body: JSON.stringify(evaluation) })
    invalidateCache('evaluations')
    if (evaluation.member_id) invalidateCache(`evaluations_member_${evaluation.member_id}`)
    if (evaluation.evaluator_id) invalidateCache(`evaluations_evaluator_${evaluation.evaluator_id}`)
    return res.json()
  },

  async update(evaluation: Partial<Evaluation>, token?: string): Promise<Evaluation> {
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    const res = await apiFetch(`${API_BASE}/evaluations`, { method: 'PUT', headers, body: JSON.stringify(evaluation) })
    invalidateCache('evaluations')
    if (evaluation.member_id) invalidateCache(`evaluations_member_${evaluation.member_id}`)
    if (evaluation.evaluator_id) invalidateCache(`evaluations_evaluator_${evaluation.evaluator_id}`)
    return res.json()
  },

  async delete(id: string, token?: string, memberId?: string, evaluatorId?: string): Promise<void> {
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    await apiFetch(`${API_BASE}/evaluations?id=${id}`, { method: 'DELETE', headers })
    invalidateCache('evaluations')
    if (memberId) invalidateCache(`evaluations_member_${memberId}`)
    if (evaluatorId) invalidateCache(`evaluations_evaluator_${evaluatorId}`)
  }
}
