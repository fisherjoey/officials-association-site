/**
 * Cache utility for API data
 * Uses localStorage with TTL (time-to-live) support
 */

import { STORAGE_PREFIX } from './siteConfig'

// Cache configuration - TTL values in milliseconds
export const CACHE_TTL = {
  // Frequently changing data - shorter cache
  announcements: 5 * 60 * 1000,      // 5 minutes
  calendarEvents: 10 * 60 * 1000,    // 10 minutes

  // Moderately changing data
  members: 15 * 60 * 1000,           // 15 minutes
  memberActivities: 10 * 60 * 1000,  // 10 minutes

  // Rarely changing data - longer cache
  ruleModifications: 30 * 60 * 1000, // 30 minutes
  resources: 30 * 60 * 1000,         // 30 minutes
  newsletters: 60 * 60 * 1000,       // 1 hour

  // Public content
  publicNews: 10 * 60 * 1000,        // 10 minutes
  publicTraining: 15 * 60 * 1000,    // 15 minutes
  publicResources: 30 * 60 * 1000,   // 30 minutes
  publicPages: 30 * 60 * 1000,       // 30 minutes
  officials: 30 * 60 * 1000,         // 30 minutes
  executiveTeam: 30 * 60 * 1000,     // 30 minutes
} as const

export type CacheKey = keyof typeof CACHE_TTL

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
}

const CACHE_PREFIX = `${STORAGE_PREFIX}cache_`

/**
 * Check if we're in a browser environment
 */
function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined'
}

/**
 * Get the full cache key with prefix
 */
function getCacheKey(key: string): string {
  return `${CACHE_PREFIX}${key}`
}

/**
 * Get data from cache
 * Returns null if cache miss or expired
 */
export function getFromCache<T>(key: CacheKey | string): T | null {
  if (!isBrowser()) return null

  try {
    const cacheKey = getCacheKey(key)
    const cached = localStorage.getItem(cacheKey)

    if (!cached) return null

    const entry: CacheEntry<T> = JSON.parse(cached)
    const now = Date.now()

    // Check if cache has expired
    if (now - entry.timestamp > entry.ttl) {
      localStorage.removeItem(cacheKey)
      return null
    }

    return entry.data
  } catch (error) {
    console.warn(`Cache read error for ${key}:`, error)
    return null
  }
}

/**
 * Save data to cache with TTL
 */
export function saveToCache<T>(key: CacheKey | string, data: T, ttl?: number): void {
  if (!isBrowser()) return

  try {
    const cacheKey = getCacheKey(key)
    const effectiveTtl = ttl ?? (CACHE_TTL[key as CacheKey] || 5 * 60 * 1000)

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: effectiveTtl
    }

    localStorage.setItem(cacheKey, JSON.stringify(entry))
  } catch (error) {
    // Handle quota exceeded or other storage errors
    console.warn(`Cache write error for ${key}:`, error)

    // Try to clear old cache entries if storage is full
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      clearExpiredCache()
    }
  }
}

/**
 * Invalidate (remove) a specific cache entry
 */
export function invalidateCache(key: CacheKey | string): void {
  if (!isBrowser()) return

  try {
    const cacheKey = getCacheKey(key)
    localStorage.removeItem(cacheKey)
  } catch (error) {
    console.warn(`Cache invalidation error for ${key}:`, error)
  }
}

/**
 * Invalidate multiple cache entries by prefix
 */
export function invalidateCacheByPrefix(prefix: string): void {
  if (!isBrowser()) return

  try {
    const fullPrefix = getCacheKey(prefix)
    const keysToRemove: string[] = []

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(fullPrefix)) {
        keysToRemove.push(key)
      }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key))
  } catch (error) {
    console.warn(`Cache prefix invalidation error:`, error)
  }
}

/**
 * Clear all expired cache entries
 */
export function clearExpiredCache(): void {
  if (!isBrowser()) return

  try {
    const now = Date.now()
    const keysToRemove: string[] = []

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(CACHE_PREFIX)) {
        try {
          const cached = localStorage.getItem(key)
          if (cached) {
            const entry: CacheEntry<unknown> = JSON.parse(cached)
            if (now - entry.timestamp > entry.ttl) {
              keysToRemove.push(key)
            }
          }
        } catch {
          // Invalid cache entry, remove it
          keysToRemove.push(key)
        }
      }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key))
  } catch (error) {
    console.warn('Cache cleanup error:', error)
  }
}

/**
 * Clear all cache entries
 */
export function clearAllCache(): void {
  if (!isBrowser()) return

  try {
    const keysToRemove: string[] = []

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(CACHE_PREFIX)) {
        keysToRemove.push(key)
      }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key))
  } catch (error) {
    console.warn('Cache clear error:', error)
  }
}

/**
 * Get cache statistics (for debugging)
 */
export function getCacheStats(): { entries: number; totalSize: number; keys: string[] } {
  if (!isBrowser()) return { entries: 0, totalSize: 0, keys: [] }

  const keys: string[] = []
  let totalSize = 0

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(CACHE_PREFIX)) {
      keys.push(key.replace(CACHE_PREFIX, ''))
      const value = localStorage.getItem(key)
      if (value) {
        totalSize += value.length * 2 // UTF-16 encoding
      }
    }
  }

  return {
    entries: keys.length,
    totalSize,
    keys
  }
}

/**
 * Create a cached version of an async fetch function
 */
export function withCache<T>(
  key: CacheKey | string,
  fetchFn: () => Promise<T>,
  options?: {
    ttl?: number
    forceRefresh?: boolean
  }
): Promise<T> {
  return new Promise(async (resolve, reject) => {
    // Check cache first (unless forced refresh)
    if (!options?.forceRefresh) {
      const cached = getFromCache<T>(key)
      if (cached !== null) {
        resolve(cached)
        return
      }
    }

    try {
      // Fetch fresh data
      const data = await fetchFn()

      // Save to cache
      saveToCache(key, data, options?.ttl)

      resolve(data)
    } catch (error) {
      reject(error)
    }
  })
}

// Clean up expired cache entries on module load (browser only)
if (isBrowser()) {
  // Delay cleanup to not block initial page load
  setTimeout(clearExpiredCache, 5000)
}
