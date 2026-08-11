'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getFromCache,
  saveToCache,
  invalidateCache,
  CacheKey,
  CACHE_TTL
} from '@/lib/cache'

interface UseCacheOptions<T> {
  /** Cache key for storage */
  cacheKey: CacheKey | string
  /** Function to fetch data when cache misses */
  fetchFn: () => Promise<T>
  /** Custom TTL in milliseconds (overrides default) */
  ttl?: number
  /** Whether to fetch immediately on mount */
  fetchOnMount?: boolean
  /** Callback when data is loaded (from cache or fetch) */
  onSuccess?: (data: T) => void
  /** Callback when fetch fails */
  onError?: (error: Error) => void
}

interface UseCacheReturn<T> {
  /** The cached/fetched data */
  data: T | null
  /** Whether data is currently being fetched */
  isLoading: boolean
  /** Any error that occurred during fetch */
  error: Error | null
  /** Whether data came from cache */
  isFromCache: boolean
  /** Manually trigger a refresh (bypasses cache) */
  refresh: () => Promise<void>
  /** Invalidate the cache for this key */
  invalidate: () => void
  /** Update local state and cache */
  setData: (data: T | ((prev: T | null) => T)) => void
}

/**
 * React hook for cached data fetching
 * Provides automatic caching with localStorage and TTL support
 */
export function useCache<T>({
  cacheKey,
  fetchFn,
  ttl,
  fetchOnMount = true,
  onSuccess,
  onError
}: UseCacheOptions<T>): UseCacheReturn<T> {
  const [data, setDataState] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [isFromCache, setIsFromCache] = useState(false)

  // Track if component is mounted to prevent state updates after unmount
  const isMounted = useRef(true)

  // Track if initial load has happened
  const hasInitialLoad = useRef(false)

  // Fetch data (either from cache or API)
  const fetchData = useCallback(async (forceRefresh = false) => {
    // Check cache first (unless forcing refresh)
    if (!forceRefresh) {
      const cached = getFromCache<T>(cacheKey)
      if (cached !== null) {
        if (isMounted.current) {
          setDataState(cached)
          setIsFromCache(true)
          setError(null)
          onSuccess?.(cached)
        }
        return
      }
    }

    // Fetch from API
    if (isMounted.current) {
      setIsLoading(true)
      setError(null)
    }

    try {
      const result = await fetchFn()

      if (isMounted.current) {
        setDataState(result)
        setIsFromCache(false)
        setError(null)

        // Save to cache
        saveToCache(cacheKey, result, ttl)

        onSuccess?.(result)
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))

      if (isMounted.current) {
        setError(error)
        onError?.(error)
      }
    } finally {
      if (isMounted.current) {
        setIsLoading(false)
      }
    }
  }, [cacheKey, fetchFn, ttl, onSuccess, onError])

  // Force refresh (bypass cache)
  const refresh = useCallback(async () => {
    await fetchData(true)
  }, [fetchData])

  // Invalidate cache
  const invalidate = useCallback(() => {
    invalidateCache(cacheKey)
  }, [cacheKey])

  // Update data and cache
  const setData = useCallback((newData: T | ((prev: T | null) => T)) => {
    setDataState(prev => {
      const updated = typeof newData === 'function'
        ? (newData as (prev: T | null) => T)(prev)
        : newData

      // Update cache
      saveToCache(cacheKey, updated, ttl)

      return updated
    })
  }, [cacheKey, ttl])

  // Initial fetch on mount
  useEffect(() => {
    isMounted.current = true

    if (fetchOnMount && !hasInitialLoad.current) {
      hasInitialLoad.current = true
      fetchData()
    }

    return () => {
      isMounted.current = false
    }
  }, [fetchOnMount, fetchData])

  return {
    data,
    isLoading,
    error,
    isFromCache,
    refresh,
    invalidate,
    setData
  }
}

/**
 * Hook for cached list data with CRUD operations
 * Automatically invalidates cache on mutations
 */
interface UseCachedListOptions<T> {
  cacheKey: CacheKey | string
  fetchFn: () => Promise<T[]>
  createFn?: (item: Partial<T>) => Promise<T>
  updateFn?: (item: Partial<T> & { id: string }) => Promise<T>
  deleteFn?: (id: string) => Promise<void>
  ttl?: number
  onSuccess?: (data: T[]) => void
  onError?: (error: Error, operation: string) => void
}

interface UseCachedListReturn<T> extends Omit<UseCacheReturn<T[]>, 'setData'> {
  /** Create a new item */
  create: (item: Partial<T>) => Promise<T | null>
  /** Update an existing item */
  update: (item: Partial<T> & { id: string }) => Promise<T | null>
  /** Delete an item */
  remove: (id: string) => Promise<boolean>
  /** Update local state */
  setData: (data: T[] | ((prev: T[] | null) => T[])) => void
}

export function useCachedList<T extends { id: string }>({
  cacheKey,
  fetchFn,
  createFn,
  updateFn,
  deleteFn,
  ttl,
  onSuccess,
  onError
}: UseCachedListOptions<T>): UseCachedListReturn<T> {
  const {
    data,
    isLoading,
    error,
    isFromCache,
    refresh,
    invalidate,
    setData
  } = useCache<T[]>({
    cacheKey,
    fetchFn,
    ttl,
    onSuccess,
    onError: (err) => onError?.(err, 'fetch')
  })

  // Create item
  const create = useCallback(async (item: Partial<T>): Promise<T | null> => {
    if (!createFn) {
      console.warn('Create function not provided')
      return null
    }

    try {
      const created = await createFn(item)

      // Update local state and cache
      setData(prev => prev ? [created, ...prev] : [created])

      return created
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      onError?.(error, 'create')
      return null
    }
  }, [createFn, setData, onError])

  // Update item
  const update = useCallback(async (item: Partial<T> & { id: string }): Promise<T | null> => {
    if (!updateFn) {
      console.warn('Update function not provided')
      return null
    }

    try {
      const updated = await updateFn(item)

      // Update local state and cache
      setData(prev =>
        prev ? prev.map(i => i.id === item.id ? updated : i) : [updated]
      )

      return updated
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      onError?.(error, 'update')
      return null
    }
  }, [updateFn, setData, onError])

  // Delete item
  const remove = useCallback(async (id: string): Promise<boolean> => {
    if (!deleteFn) {
      console.warn('Delete function not provided')
      return false
    }

    try {
      await deleteFn(id)

      // Update local state and cache
      setData(prev => prev ? prev.filter(i => i.id !== id) : [])

      return true
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      onError?.(error, 'delete')
      return false
    }
  }, [deleteFn, setData, onError])

  return {
    data,
    isLoading,
    error,
    isFromCache,
    refresh,
    invalidate,
    setData,
    create,
    update,
    remove
  }
}

export default useCache
