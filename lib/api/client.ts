/**
 * Shared API client utilities — auth headers, fetch wrapper, config.
 */
import { retryAsync, parseAPIError, AppError } from '../errorHandling'
import { toFriendlyMessage, type ServerErrorBody } from '../userFacingError'
import { createBrowserClient } from '@supabase/ssr'

export { AppError }

// API base URL — proxied to /.netlify/functions via netlify.toml
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api'

// Flag to enable mock data when functions aren't available
export const USE_MOCK_DATA = process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true' || process.env.NODE_ENV === 'development'

export const isBrowser = () => typeof window !== 'undefined'

/**
 * Singleton browser-side Supabase client. Every client component
 * that needs Supabase should import this — instantiating multiple
 * createBrowserClient() calls causes "Multiple GoTrueClient
 * instances detected" warnings and real auth-state desync (one
 * client updates a password while a second client's listener never
 * fires because it owns a different in-memory session).
 */
let _browserClient: ReturnType<typeof createBrowserClient> | null = null

/**
 * Stand-in returned when Supabase env vars are absent. Constructing it never
 * throws — only touching a property on it does, with a message that says
 * exactly what's missing. That keeps the failure at request time, when a
 * real caller is already trying to make a real Supabase call, instead of at
 * import time, where merely loading a module that references this factory
 * (e.g. a context provider evaluated while a page is prerendered) would
 * otherwise crash the build for adopters who haven't configured Supabase
 * yet.
 */
function createUnconfiguredClientStub(): ReturnType<typeof createBrowserClient> {
  const fail = (): never => {
    throw new Error(
      'Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and ' +
      'NEXT_PUBLIC_SUPABASE_ANON_KEY. This client was constructed without ' +
      'them, so it cannot make requests.'
    )
  }
  return new Proxy(
    {},
    {
      get: fail,
      apply: fail,
    }
  ) as ReturnType<typeof createBrowserClient>
}

export function getSupabaseBrowserClient(): ReturnType<typeof createBrowserClient> {
  if (!_browserClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    _browserClient = url && anonKey
      ? createBrowserClient(url, anonKey)
      : createUnconfiguredClientStub()
  }
  return _browserClient
}

// Get Supabase auth token for authenticated API calls
async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!isBrowser()) return {}
  const client = getSupabaseBrowserClient()
  try {
    const { data: { session } } = await client.auth.getSession()
    if (session?.access_token) {
      return { Authorization: `Bearer ${session.access_token}` }
    }
  } catch {
    // Not logged in
  }
  return {}
}

/** Enhanced fetch with auth token injection and error handling */
export async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  try {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...options?.headers
      }
    })

    if (!response.ok) {
      let body: ServerErrorBody | null = null
      try {
        body = await response.json()
      } catch {
        // Non-JSON body — fall through to status-based default.
      }
      const friendly = toFriendlyMessage(response, body)
      throw new AppError(friendly.message, body?.error || 'API_ERROR', response.status, {
        fields: friendly.fields,
        code: body?.error,
      })
    }

    return response
  } catch (error: any) {
    if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
      throw new AppError(
        'We couldn’t reach the server. Please check your internet connection and try again.',
        'NETWORK_ERROR',
      )
    }
    if (error instanceof AppError) throw error
    throw new AppError(parseAPIError(error), 'UNKNOWN_ERROR')
  }
}

/** Re-export retryAsync for use in API modules */
export { retryAsync }

/** Get the current user's JWT token from Supabase session */
export async function getAuthToken(): Promise<string | null> {
  if (!isBrowser()) return null
  const client = getSupabaseBrowserClient()
  try {
    const { data: { session } } = await client.auth.getSession()
    return session?.access_token || null
  } catch {
    return null
  }
}
