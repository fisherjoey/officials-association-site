/**
 * Public content APIs — news, training, resources, pages, officials, executive team.
 */
import { apiFetch, retryAsync, isBrowser, API_BASE } from './client'
import { getFromCache, saveToCache, invalidateCache } from '../cache'
import type {
  PublicNewsItem, PublicTrainingEvent, PublicResource, PublicPage,
  Official, ExecutiveMember
} from '@/types/publicContent'

export const publicNewsAPI = {
  async getAll(options?: { forceRefresh?: boolean }): Promise<PublicNewsItem[]> {
    const cacheKey = 'publicNews'
    if (!options?.forceRefresh && isBrowser()) {
      const cached = getFromCache<PublicNewsItem[]>(cacheKey)
      if (cached) return cached
    }
    const data = await retryAsync(async () => { const res = await apiFetch(`${API_BASE}/public-news`); return res.json() })
    if (isBrowser()) saveToCache(cacheKey, data)
    return data
  },
  async getActive(): Promise<PublicNewsItem[]> { return (await this.getAll()).filter(item => item.active) },
  async getBySlug(slug: string): Promise<PublicNewsItem> { return retryAsync(async () => { const res = await apiFetch(`${API_BASE}/public-news?slug=${slug}`); return res.json() }) },
  async create(item: Partial<PublicNewsItem>): Promise<PublicNewsItem> { const res = await apiFetch(`${API_BASE}/public-news`, { method: 'POST', body: JSON.stringify(item) }); invalidateCache('publicNews'); return res.json() },
  async update(item: Partial<PublicNewsItem>): Promise<PublicNewsItem> { const res = await apiFetch(`${API_BASE}/public-news`, { method: 'PUT', body: JSON.stringify(item) }); invalidateCache('publicNews'); return res.json() },
  async delete(id: string): Promise<void> { await apiFetch(`${API_BASE}/public-news?id=${id}`, { method: 'DELETE' }); invalidateCache('publicNews') }
}

export const publicTrainingAPI = {
  async getAll(options?: { forceRefresh?: boolean }): Promise<PublicTrainingEvent[]> {
    const cacheKey = 'publicTraining'
    if (!options?.forceRefresh && isBrowser()) {
      const cached = getFromCache<PublicTrainingEvent[]>(cacheKey)
      if (cached) return cached
    }
    const data = await retryAsync(async () => { const res = await apiFetch(`${API_BASE}/public-training`); return res.json() })
    if (isBrowser()) saveToCache(cacheKey, data)
    return data
  },
  async getActive(): Promise<PublicTrainingEvent[]> { return (await this.getAll()).filter(item => item.active) },
  async getUpcoming(): Promise<PublicTrainingEvent[]> { const active = await this.getActive(); const now = new Date(); return active.filter(item => new Date(item.event_date) >= now) },
  async getBySlug(slug: string): Promise<PublicTrainingEvent> { return retryAsync(async () => { const res = await apiFetch(`${API_BASE}/public-training?slug=${slug}`); return res.json() }) },
  async create(item: Partial<PublicTrainingEvent>): Promise<PublicTrainingEvent> { const res = await apiFetch(`${API_BASE}/public-training`, { method: 'POST', body: JSON.stringify(item) }); invalidateCache('publicTraining'); return res.json() },
  async update(item: Partial<PublicTrainingEvent>): Promise<PublicTrainingEvent> { const res = await apiFetch(`${API_BASE}/public-training`, { method: 'PUT', body: JSON.stringify(item) }); invalidateCache('publicTraining'); return res.json() },
  async delete(id: string): Promise<void> { await apiFetch(`${API_BASE}/public-training?id=${id}`, { method: 'DELETE' }); invalidateCache('publicTraining') }
}

export const publicResourcesAPI = {
  async getAll(options?: { forceRefresh?: boolean }): Promise<PublicResource[]> {
    const cacheKey = 'publicResources'
    if (!options?.forceRefresh && isBrowser()) {
      const cached = getFromCache<PublicResource[]>(cacheKey)
      if (cached) return cached
    }
    const data = await retryAsync(async () => { const res = await apiFetch(`${API_BASE}/public-resources`); return res.json() })
    if (isBrowser()) saveToCache(cacheKey, data)
    return data
  },
  async getActive(): Promise<PublicResource[]> { return (await this.getAll()).filter(item => item.active) },
  async getByCategory(category: string): Promise<PublicResource[]> { return retryAsync(async () => { const res = await apiFetch(`${API_BASE}/public-resources?category=${category}`); return res.json() }) },
  async getBySlug(slug: string): Promise<PublicResource> { return retryAsync(async () => { const res = await apiFetch(`${API_BASE}/public-resources?slug=${slug}`); return res.json() }) },
  async create(item: Partial<PublicResource>): Promise<PublicResource> { const res = await apiFetch(`${API_BASE}/public-resources`, { method: 'POST', body: JSON.stringify(item) }); invalidateCache('publicResources'); return res.json() },
  async update(item: Partial<PublicResource>): Promise<PublicResource> { const res = await apiFetch(`${API_BASE}/public-resources`, { method: 'PUT', body: JSON.stringify(item) }); invalidateCache('publicResources'); return res.json() },
  async delete(id: string): Promise<void> { await apiFetch(`${API_BASE}/public-resources?id=${id}`, { method: 'DELETE' }); invalidateCache('publicResources') }
}

export const publicPagesAPI = {
  async getAll(options?: { forceRefresh?: boolean }): Promise<PublicPage[]> {
    const cacheKey = 'publicPages'
    if (!options?.forceRefresh && isBrowser()) {
      const cached = getFromCache<PublicPage[]>(cacheKey)
      if (cached) return cached
    }
    const data = await retryAsync(async () => { const res = await apiFetch(`${API_BASE}/public-pages`); return res.json() })
    if (isBrowser()) saveToCache(cacheKey, data)
    return data
  },
  async getByName(pageName: string): Promise<PublicPage> { return retryAsync(async () => { const res = await apiFetch(`${API_BASE}/public-pages?page_name=${pageName}`); return res.json() }) },
  async update(page: Partial<PublicPage>): Promise<PublicPage> { const res = await apiFetch(`${API_BASE}/public-pages`, { method: 'PUT', body: JSON.stringify(page) }); invalidateCache('publicPages'); return res.json() }
}

export const officialsAPI = {
  async getAll(options?: { forceRefresh?: boolean }): Promise<Official[]> {
    const cacheKey = 'officials'
    if (!options?.forceRefresh && isBrowser()) {
      const cached = getFromCache<Official[]>(cacheKey)
      if (cached) return cached
    }
    const data = await retryAsync(async () => { const res = await apiFetch(`${API_BASE}/officials`); return res.json() })
    if (isBrowser()) saveToCache(cacheKey, data)
    return data
  },
  async getActive(): Promise<Official[]> { return (await this.getAll()).filter(item => item.active) },
  async getByLevel(level: number): Promise<Official[]> { return retryAsync(async () => { const res = await apiFetch(`${API_BASE}/officials?level=${level}`); return res.json() }) },
  async create(item: Partial<Official>): Promise<Official> { const res = await apiFetch(`${API_BASE}/officials`, { method: 'POST', body: JSON.stringify(item) }); invalidateCache('officials'); return res.json() },
  async update(item: Partial<Official>): Promise<Official> { const res = await apiFetch(`${API_BASE}/officials`, { method: 'PUT', body: JSON.stringify(item) }); invalidateCache('officials'); return res.json() },
  async delete(id: string): Promise<void> { await apiFetch(`${API_BASE}/officials?id=${id}`, { method: 'DELETE' }); invalidateCache('officials') }
}

export const executiveTeamAPI = {
  async getAll(options?: { forceRefresh?: boolean; includeInactive?: boolean }): Promise<ExecutiveMember[]> {
    const cacheKey = 'executiveTeam'
    if (!options?.forceRefresh && isBrowser()) {
      const cached = getFromCache<ExecutiveMember[]>(cacheKey)
      if (cached) return cached
    }
    const params = options?.includeInactive ? '?active=false' : ''
    const data = await retryAsync(async () => { const res = await apiFetch(`${API_BASE}/executive-team${params}`); return res.json() })
    if (isBrowser()) saveToCache(cacheKey, data)
    return data
  },
  async getActive(): Promise<ExecutiveMember[]> { return (await this.getAll()).filter(item => item.active) },
  async create(item: Partial<ExecutiveMember>): Promise<ExecutiveMember> { const res = await apiFetch(`${API_BASE}/executive-team`, { method: 'POST', body: JSON.stringify(item) }); invalidateCache('executiveTeam'); return res.json() },
  async update(item: Partial<ExecutiveMember>): Promise<ExecutiveMember> { const res = await apiFetch(`${API_BASE}/executive-team`, { method: 'PUT', body: JSON.stringify(item) }); invalidateCache('executiveTeam'); return res.json() },
  async delete(id: string): Promise<void> { await apiFetch(`${API_BASE}/executive-team?id=${id}`, { method: 'DELETE' }); invalidateCache('executiveTeam') }
}
