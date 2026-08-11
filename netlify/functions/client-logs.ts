import { Handler } from '@netlify/functions'
import { getCorsHeaders, supabase, errorResponse } from './_shared/handler'
import { checkRateLimit, getClientIp } from './_shared/rateLimit'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const MAX_FIELD_LEN = 4000

interface ClientLogEntry {
  level: 'ERROR' | 'WARN' | 'INFO'
  category: string
  action: string
  message: string
  metadata?: Record<string, unknown>
  errorStack?: string
  url?: string
  timestamp?: string
}

function clip(s: string | undefined | null, max = MAX_FIELD_LEN): string | null {
  if (!s) return null
  return s.length > max ? s.slice(0, max) : s
}

export const handler: Handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin
  const headers = {
    ...getCorsHeaders(origin, ['POST']),
    'Content-Type': 'application/json',
  }

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  // Only accept POST requests
  if (event.httpMethod !== 'POST') {
    return errorResponse({ code: 'method_not_allowed', headers })
  }

  // Rate limit per IP. Without this, the public endpoint can be used to
  // flood app_logs (cost + storage) and inject fake admin identities.
  const clientIp = getClientIp(event.headers)
  if (checkRateLimit(clientIp, { maxRequests: 30, windowMs: 60_000, prefix: 'client-logs' })) {
    return errorResponse({ code: 'rate_limited', headers })
  }

  // Resolve identity from a verified bearer token if present. user_id /
  // user_email in the request body are ignored — they were attacker-
  // controlled and could impersonate admins in the triage dashboard.
  let verifiedUserId: string | null = null
  let verifiedUserEmail: string | null = null
  const authHeader = event.headers.authorization || event.headers.Authorization
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
      if (user) {
        verifiedUserId = user.id
        verifiedUserEmail = user.email || null
      }
    } catch {
      // Unverified — drop the identity, keep the log.
    }
  }

  try {
    // Parse the request body
    const body = JSON.parse(event.body || '{}')
    const logs: ClientLogEntry[] = body.logs

    // Validate input
    if (!Array.isArray(logs) || logs.length === 0) {
      return errorResponse({
        code: 'invalid_input',
        headers,
        message: 'No logs provided.',
      })
    }

    // Limit batch size to prevent abuse
    if (logs.length > 100) {
      return errorResponse({
        code: 'invalid_input',
        headers,
        message: 'Too many logs in batch (max 100).',
      })
    }

    // Extract request context
    const ipAddress = event.headers['x-forwarded-for']?.split(',')[0]?.trim()
    const userAgent = event.headers['user-agent']

    // Transform logs for database insertion
    const rows = logs.map((log) => ({
      level: log.level,
      source: 'client',
      category: clip(log.category, 100),
      function_name: null,
      action: clip(log.action, 100),
      message: clip(log.message),
      user_id: verifiedUserId,
      user_email: verifiedUserEmail,
      metadata: {
        ...(log.metadata || {}),
        url: clip(log.url, 500),
        client_timestamp: log.timestamp,
      },
      error_name: log.errorStack ? 'ClientError' : null,
      error_message: log.level === 'ERROR' ? clip(log.message) : null,
      error_stack: clip(log.errorStack),
      ip_address: ipAddress || null,
      user_agent: clip(userAgent, 500),
    }))

    // Insert logs into Supabase
    const response = await fetch(`${supabaseUrl}/rest/v1/app_logs`, {
      method: 'POST',
      headers: {
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(rows),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Failed to insert client logs:', errorText)
      return errorResponse({ code: 'server_error', headers })
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ received: logs.length }),
    }
  } catch (error) {
    console.error('Client logs error:', error)
    return errorResponse({ code: 'server_error', headers })
  }
}
