/**
 * Simple in-memory rate limiter for Netlify Functions.
 *
 * Tracks request counts per IP within a sliding window. State lives in the
 * warm function instance — cold starts reset counters, which is acceptable
 * as a first line of defense. For stricter limits, add database-backed
 * tracking.
 *
 * Usage:
 *   import { checkRateLimit } from './_shared/rateLimit'
 *
 *   const limited = checkRateLimit(clientIp, { maxRequests: 5, windowMs: 60_000 })
 *   if (limited) {
 *     return { statusCode: 429, headers, body: JSON.stringify({ error: 'Too many requests' }) }
 *   }
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

// Per-function-instance store (survives across warm invocations)
const store = new Map<string, RateLimitEntry>()

// Periodic cleanup to prevent memory growth
let lastCleanup = Date.now()
const CLEANUP_INTERVAL = 60_000 // 1 minute

function cleanup() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return
  lastCleanup = now
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key)
  }
}

export interface RateLimitOptions {
  /** Max requests allowed per window. Default: 10 */
  maxRequests?: number
  /** Time window in milliseconds. Default: 60000 (1 minute) */
  windowMs?: number
  /** Optional prefix to namespace different endpoints. Default: '' */
  prefix?: string
}

/**
 * Returns true if the request should be rate-limited (rejected).
 * Returns false if the request is allowed.
 */
export function checkRateLimit(
  clientIp: string | undefined,
  options: RateLimitOptions = {}
): boolean {
  if (!clientIp) return false // Can't rate-limit without an IP

  const { maxRequests = 10, windowMs = 60_000, prefix = '' } = options
  const key = `${prefix}:${clientIp}`
  const now = Date.now()

  cleanup()

  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    // First request in this window
    store.set(key, { count: 1, resetAt: now + windowMs })
    return false
  }

  entry.count++

  if (entry.count > maxRequests) {
    return true // Rate limited
  }

  return false
}

/** Extract client IP from Netlify function event headers */
export function getClientIp(headers: Record<string, string | undefined>): string | undefined {
  return headers['x-forwarded-for']?.split(',')[0]?.trim()
    || headers['x-nf-client-connection-ip']
    || headers['client-ip']
}
