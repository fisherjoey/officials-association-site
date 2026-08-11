/**
 * Client-side Logger for the React application
 *
 * Features:
 * - Batches logs and sends every 5 seconds (or immediately for errors)
 * - Uses sendBeacon on page unload to ensure logs are delivered
 * - Global error handler for uncaught exceptions
 * - User context tracking (set after login)
 *
 * Usage:
 *   import { clientLogger } from '@/lib/clientLogger'
 *
 *   // Set user after login
 *   clientLogger.setUser(user.id, user.email)
 *
 *   // Log events
 *   clientLogger.info('auth', 'login_success', 'User logged in')
 *   clientLogger.error('api', 'fetch_failed', 'Failed to load data', error)
 *
 *   // Clear user on logout
 *   clientLogger.clearUser()
 */

type LogLevel = 'ERROR' | 'WARN' | 'INFO'

type LogCategory =
  | 'auth'
  | 'navigation'
  | 'api'
  | 'ui'
  | 'form'

interface ClientLogEntry {
  level: LogLevel
  category: LogCategory
  action: string
  message: string
  metadata?: Record<string, unknown>
  errorStack?: string
  userId?: string
  userEmail?: string
  url?: string
  timestamp?: string
}

// Module-level state
let logQueue: ClientLogEntry[] = []
let flushTimeout: ReturnType<typeof setTimeout> | null = null
let userContext: { id?: string; email?: string } = {}
let isInitialized = false

/**
 * Best-effort access-token lookup. Imported lazily to avoid pulling
 * the Supabase client into modules that only need logging.
 */
async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const { getAuthToken } = await import('./api/client')
    const token = await getAuthToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

/**
 * Flush logs to the server
 */
async function flushLogs(): Promise<void> {
  if (logQueue.length === 0) return

  const logs = [...logQueue]
  logQueue = []

  try {
    const authHeaders = await getAuthHeaders()
    await fetch('/.netlify/functions/client-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ logs }),
    })
  } catch (err) {
    // Silently fail - don't break the UI
    console.error('[ClientLogger] Failed to send logs:', err)
  }
}

/**
 * Queue a log entry for sending
 */
function queueLog(entry: Omit<ClientLogEntry, 'userId' | 'userEmail' | 'url' | 'timestamp'>): void {
  const fullEntry: ClientLogEntry = {
    ...entry,
    userId: userContext.id,
    userEmail: userContext.email,
    url: typeof window !== 'undefined' ? window.location.href : undefined,
    timestamp: new Date().toISOString(),
  }

  logQueue.push(fullEntry)

  // Flush immediately for errors, otherwise batch
  if (entry.level === 'ERROR') {
    if (flushTimeout) {
      clearTimeout(flushTimeout)
      flushTimeout = null
    }
    flushLogs()
  } else if (!flushTimeout) {
    flushTimeout = setTimeout(() => {
      flushTimeout = null
      flushLogs()
    }, 5000)
  }
}

/**
 * Initialize global error handlers (called once)
 */
function initializeErrorHandlers(): void {
  if (isInitialized || typeof window === 'undefined') return
  isInitialized = true

  // Handle uncaught errors
  window.addEventListener('error', (event: ErrorEvent) => {
    clientLogger.error('ui', 'uncaught_error', event.message || 'Unknown error', undefined, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    })
  })

  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason))
    clientLogger.error('ui', 'unhandled_rejection', error.message, error)
  })

  // Flush logs on page unload
  window.addEventListener('beforeunload', () => {
    if (logQueue.length > 0) {
      // Use sendBeacon for reliable delivery on page close
      const data = JSON.stringify({ logs: logQueue })
      navigator.sendBeacon('/.netlify/functions/client-logs', data)
      logQueue = []
    }
  })

  // Also flush on visibility change (tab hidden)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && logQueue.length > 0) {
      const data = JSON.stringify({ logs: logQueue })
      navigator.sendBeacon('/.netlify/functions/client-logs', data)
      logQueue = []
    }
  })
}

/**
 * Client logger singleton
 */
export const clientLogger = {
  /**
   * Set user context (call after login)
   */
  setUser(id: string, email: string): void {
    userContext = { id, email }
  },

  /**
   * Clear user context (call on logout)
   */
  clearUser(): void {
    userContext = {}
  },

  /**
   * Log an INFO level message
   */
  info(
    category: LogCategory,
    action: string,
    message: string,
    metadata?: Record<string, unknown>
  ): void {
    console.log(`[INFO] [${category}/${action}] ${message}`, metadata || '')
    queueLog({ level: 'INFO', category, action, message, metadata })
  },

  /**
   * Log a WARN level message
   */
  warn(
    category: LogCategory,
    action: string,
    message: string,
    metadata?: Record<string, unknown>
  ): void {
    console.warn(`[WARN] [${category}/${action}] ${message}`, metadata || '')
    queueLog({ level: 'WARN', category, action, message, metadata })
  },

  /**
   * Log an ERROR level message
   */
  error(
    category: LogCategory,
    action: string,
    message: string,
    error?: Error,
    metadata?: Record<string, unknown>
  ): void {
    console.error(`[ERROR] [${category}/${action}] ${message}`, error || '', metadata || '')
    queueLog({
      level: 'ERROR',
      category,
      action,
      message,
      metadata,
      errorStack: error?.stack,
    })
  },

  /**
   * Force flush all pending logs
   */
  flush(): Promise<void> {
    if (flushTimeout) {
      clearTimeout(flushTimeout)
      flushTimeout = null
    }
    return flushLogs()
  },

  /**
   * Initialize the logger (call once in app root)
   */
  init(): void {
    initializeErrorHandlers()
  },
}

// Auto-initialize when module loads (client-side only)
if (typeof window !== 'undefined') {
  initializeErrorHandlers()
}
