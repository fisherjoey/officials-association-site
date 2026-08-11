/**
 * Server-side Logger for Netlify Functions
 *
 * Usage:
 *   import { Logger } from '../../lib/logger'
 *
 *   const logger = Logger.fromEvent('function-name', event)
 *   logger.info('crud', 'create_member', 'Created new member', { userEmail: 'test@example.com' })
 *   logger.error('api', 'request_failed', 'Database error', error)
 *   await logger.audit('CREATE', 'member', memberId, { actorId, actorEmail, newValues })
 */

export type LogLevel = 'ERROR' | 'WARN' | 'INFO'

export type LogCategory =
  | 'auth'
  | 'email'
  | 'crud'
  | 'api'
  | 'file'
  | 'system'
  | 'admin'
  | 'osa'
  | 'invite'

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'LOGIN'
  | 'LOGOUT'
  | 'INVITE'
  | 'PASSWORD_RESET'
  | 'EMAIL_SENT'
  | 'ROLE_CHANGE'
  | 'OSA_SUBMITTED'

export type AuditEntityType =
  | 'member'
  | 'user'
  | 'auth_user'
  | 'calendar_event'
  | 'announcement'
  | 'newsletter'
  | 'resource'
  | 'rule_modification'
  | 'evaluation'
  | 'official'
  | 'public_news'
  | 'public_page'
  | 'public_resource'
  | 'public_training'
  | 'member_activity'
  | 'email'
  | 'file'
  | 'osa'
  | 'executive_team'
  | 'scheduler_update'
  | 'news'
  | 'page'
  | 'training_event'
  | 'stat_import'
  | 'stat_mapping'

export interface LogOptions {
  userId?: string
  userEmail?: string
  metadata?: Record<string, unknown>
  error?: Error
}

export interface AuditOptions {
  actorId: string
  actorEmail: string
  actorRole?: string
  actorIp?: string
  targetUserId?: string
  targetUserEmail?: string
  oldValues?: Record<string, unknown>
  newValues?: Record<string, unknown>
  description?: string
}

interface NetlifyEvent {
  headers?: Record<string, string | undefined>
}

class Logger {
  private functionName: string
  private ipAddress?: string
  private userAgent?: string

  constructor(functionName: string) {
    this.functionName = functionName
  }

  /**
   * Create a logger instance from a Netlify function event
   */
  static fromEvent(functionName: string, event: NetlifyEvent): Logger {
    const logger = new Logger(functionName)
    logger.ipAddress = event.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
    logger.userAgent = event.headers?.['user-agent']
    return logger
  }

  /**
   * Set IP address manually (for cases where event is not available)
   */
  setIpAddress(ip: string): this {
    this.ipAddress = ip
    return this
  }

  /**
   * Set user agent manually
   */
  setUserAgent(userAgent: string): this {
    this.userAgent = userAgent
    return this
  }

  /**
   * Internal method to write logs to Supabase
   */
  private async writeLog(
    level: LogLevel,
    category: LogCategory,
    action: string,
    message: string,
    options?: LogOptions
  ): Promise<void> {
    // Always log to console for Netlify's built-in log viewer
    const consoleMsg = `[${level}] [${this.functionName}/${action}] ${message}`
    const consoleData = options?.metadata ? options.metadata : undefined

    if (level === 'ERROR') {
      console.error(consoleMsg, consoleData, options?.error)
    } else if (level === 'WARN') {
      console.warn(consoleMsg, consoleData)
    } else {
      console.log(consoleMsg, consoleData)
    }

    // Write to Supabase (fire-and-forget, don't block the request)
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY

      if (!url || !key) {
        console.warn('[Logger] Supabase credentials not configured, skipping database log')
        return
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3000)

      await fetch(`${url}/rest/v1/app_logs`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          level,
          source: 'server',
          category,
          function_name: this.functionName,
          action,
          message,
          user_id: options?.userId || null,
          user_email: options?.userEmail || null,
          metadata: options?.metadata || {},
          error_name: options?.error?.name || null,
          error_message: options?.error?.message || null,
          error_stack: options?.error?.stack || null,
          ip_address: this.ipAddress || null,
          user_agent: this.userAgent || null,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
    } catch (err) {
      // Silently fail - logging should never break the application
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('[Logger] Failed to write log to database:', err.message)
      }
    }
  }

  /**
   * Log an INFO level message
   */
  info(
    category: LogCategory,
    action: string,
    message: string,
    options?: LogOptions
  ): void {
    this.writeLog('INFO', category, action, message, options)
  }

  /**
   * Log a WARN level message
   */
  warn(
    category: LogCategory,
    action: string,
    message: string,
    options?: LogOptions
  ): void {
    this.writeLog('WARN', category, action, message, options)
  }

  /**
   * Log an ERROR level message
   */
  error(
    category: LogCategory,
    action: string,
    message: string,
    error?: Error,
    options?: LogOptions
  ): void {
    this.writeLog('ERROR', category, action, message, { ...options, error })
  }

  /**
   * Write an audit log entry for tracking user actions
   */
  async audit(
    action: AuditAction,
    entityType: AuditEntityType,
    entityId: string | null,
    options: AuditOptions
  ): Promise<void> {
    // Always log to console
    console.log(
      `[AUDIT] [${action}] ${entityType}${entityId ? `:${entityId}` : ''} by ${options.actorEmail}`,
      options.description || ''
    )

    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY

      if (!url || !key) {
        console.warn('[Logger] Supabase credentials not configured, skipping audit log')
        return
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3000)

      await fetch(`${url}/rest/v1/audit_logs`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          action,
          entity_type: entityType,
          entity_id: entityId,
          actor_id: options.actorId,
          actor_email: options.actorEmail,
          actor_role: options.actorRole || null,
          actor_ip: options.actorIp || this.ipAddress || null,
          target_user_id: options.targetUserId || null,
          target_user_email: options.targetUserEmail || null,
          old_values: options.oldValues || null,
          new_values: options.newValues || null,
          description: options.description || null,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('[Logger] Failed to write audit log:', err.message)
      }
    }
  }
}

export { Logger }
