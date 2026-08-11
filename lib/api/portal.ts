/**
 * Portal content APIs — calendar, announcements, rule modifications, newsletters.
 */
import { apiFetch, retryAsync, isBrowser, API_BASE } from './client'
import { getFromCache, saveToCache, invalidateCache } from '../cache'

export const calendarAPI = {
  async getAll(options?: { forceRefresh?: boolean }) {
    const cacheKey = 'calendarEvents'

    if (!options?.forceRefresh && isBrowser()) {
      const cached = getFromCache(cacheKey)
      if (cached) return cached
    }

    const data = await retryAsync(async () => {
      const res = await apiFetch(`${API_BASE}/calendar-events`)
      return res.json()
    })

    if (isBrowser()) saveToCache(cacheKey, data)
    return data
  },

  async create(event: any) {
    const res = await apiFetch(`${API_BASE}/calendar-events`, { method: 'POST', body: JSON.stringify(event) })
    invalidateCache('calendarEvents')
    return res.json()
  },

  async update(event: any) {
    const res = await apiFetch(`${API_BASE}/calendar-events`, { method: 'PUT', body: JSON.stringify(event) })
    invalidateCache('calendarEvents')
    return res.json()
  },

  async delete(id: string) {
    await apiFetch(`${API_BASE}/calendar-events?id=${id}`, { method: 'DELETE' })
    invalidateCache('calendarEvents')
  }
}

export const announcementsAPI = {
  async getAll(options?: { forceRefresh?: boolean }) {
    const cacheKey = 'announcements'

    if (!options?.forceRefresh && isBrowser()) {
      const cached = getFromCache(cacheKey)
      if (cached) return cached
    }

    const data = await retryAsync(async () => {
      const res = await apiFetch(`${API_BASE}/announcements`)
      return res.json()
    })

    if (isBrowser()) saveToCache(cacheKey, data)
    return data
  },

  async create(announcement: any) {
    const res = await apiFetch(`${API_BASE}/announcements`, { method: 'POST', body: JSON.stringify(announcement) })
    invalidateCache('announcements')
    return res.json()
  },

  async update(announcement: any) {
    const res = await apiFetch(`${API_BASE}/announcements`, { method: 'PUT', body: JSON.stringify(announcement) })
    invalidateCache('announcements')
    return res.json()
  },

  async delete(id: string) {
    await apiFetch(`${API_BASE}/announcements?id=${id}`, { method: 'DELETE' })
    invalidateCache('announcements')
  }
}

export const ruleModificationsAPI = {
  async getAll(options?: { forceRefresh?: boolean }) {
    const cacheKey = 'ruleModifications'

    if (!options?.forceRefresh && isBrowser()) {
      const cached = getFromCache(cacheKey)
      if (cached) return cached
    }

    const data = await retryAsync(async () => {
      const res = await apiFetch(`${API_BASE}/rule-modifications`)
      return res.json()
    })

    if (isBrowser()) saveToCache(cacheKey, data)
    return data
  },

  async create(modification: any) {
    const res = await apiFetch(`${API_BASE}/rule-modifications`, { method: 'POST', body: JSON.stringify(modification) })
    invalidateCache('ruleModifications')
    return res.json()
  },

  async update(modification: any) {
    const res = await apiFetch(`${API_BASE}/rule-modifications`, { method: 'PUT', body: JSON.stringify(modification) })
    invalidateCache('ruleModifications')
    return res.json()
  },

  async delete(id: string) {
    await apiFetch(`${API_BASE}/rule-modifications?id=${id}`, { method: 'DELETE' })
    invalidateCache('ruleModifications')
  }
}

export const schedulerUpdatesAPI = {
  async getAll(options?: { forceRefresh?: boolean }) {
    const cacheKey = 'schedulerUpdates'

    if (!options?.forceRefresh && isBrowser()) {
      const cached = getFromCache(cacheKey)
      if (cached) return cached
    }

    const data = await retryAsync(async () => {
      const res = await apiFetch(`${API_BASE}/scheduler-updates`)
      return res.json()
    })

    if (isBrowser()) saveToCache(cacheKey, data)
    return data
  },

  async create(update: any) {
    const res = await apiFetch(`${API_BASE}/scheduler-updates`, { method: 'POST', body: JSON.stringify(update) })
    invalidateCache('schedulerUpdates')
    return res.json()
  },

  async update(update: any) {
    const res = await apiFetch(`${API_BASE}/scheduler-updates`, { method: 'PUT', body: JSON.stringify(update) })
    invalidateCache('schedulerUpdates')
    return res.json()
  },

  async delete(id: string) {
    await apiFetch(`${API_BASE}/scheduler-updates?id=${id}`, { method: 'DELETE' })
    invalidateCache('schedulerUpdates')
  }
}

export const newslettersAPI = {
  async getAll(options?: { forceRefresh?: boolean }) {
    const cacheKey = 'newsletters'

    if (!options?.forceRefresh && isBrowser()) {
      const cached = getFromCache(cacheKey)
      if (cached) return cached
    }

    const data = await retryAsync(async () => {
      const res = await apiFetch(`${API_BASE}/newsletters`)
      return res.json()
    })

    if (isBrowser()) saveToCache(cacheKey, data)
    return data
  },

  async create(newsletter: any) {
    const res = await apiFetch(`${API_BASE}/newsletters`, { method: 'POST', body: JSON.stringify(newsletter) })
    invalidateCache('newsletters')
    return res.json()
  },

  async update(newsletter: any) {
    const res = await apiFetch(`${API_BASE}/newsletters`, { method: 'PUT', body: JSON.stringify(newsletter) })
    invalidateCache('newsletters')
    return res.json()
  },

  async delete(id: string) {
    await apiFetch(`${API_BASE}/newsletters?id=${id}`, { method: 'DELETE' })
    invalidateCache('newsletters')
  }
}
