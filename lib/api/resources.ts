/**
 * Portal resources API.
 */
import { apiFetch, retryAsync, isBrowser, API_BASE } from './client'
import { getFromCache, saveToCache, invalidateCache } from '../cache'

export const resourcesAPI = {
  async getAll(featured?: boolean, options?: { forceRefresh?: boolean }) {
    const cacheKey = featured ? 'resources_featured' : 'resources'
    if (!options?.forceRefresh && isBrowser()) {
      const cached = getFromCache(cacheKey)
      if (cached) return cached
    }
    const data = await retryAsync(async () => {
      const url = featured ? `${API_BASE}/resources?featured=true` : `${API_BASE}/resources`
      const res = await apiFetch(url)
      return res.json()
    })
    if (isBrowser()) saveToCache(cacheKey, data)
    return data
  },

  async create(resource: any) {
    const res = await apiFetch(`${API_BASE}/resources`, { method: 'POST', body: JSON.stringify(resource) })
    invalidateCache('resources')
    invalidateCache('resources_featured')
    return res.json()
  },

  async update(resource: any) {
    const res = await apiFetch(`${API_BASE}/resources`, { method: 'PUT', body: JSON.stringify(resource) })
    invalidateCache('resources')
    invalidateCache('resources_featured')
    return res.json()
  },

  async delete(id: string) {
    await apiFetch(`${API_BASE}/resources?id=${id}`, { method: 'DELETE' })
    invalidateCache('resources')
    invalidateCache('resources_featured')
  }
}
