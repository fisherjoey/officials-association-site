/**
 * Shared Netlify Function handler
 *
 * Provides: Supabase admin client, CORS, Supabase Auth verification,
 * role-based access control, structured error handling, and logging.
 *
 * Usage:
 *   import { createHandler, supabase } from './_shared/handler'
 *
 *   export const handler = createHandler({
 *     name: 'announcements',
 *     auth: { GET: 'public', POST: 'admin', PUT: 'admin', DELETE: 'admin' },
 *     handler: async ({ event, supabase, logger, user }) => {
 *       // ... your logic, return { statusCode, body }
 *     }
 *   })
 */

import { Handler, HandlerEvent, HandlerContext as NetlifyContext } from '@netlify/functions'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Logger } from '../../../lib/logger'
import { SITE_URL } from '../../../lib/siteConfig'
import {
  can,
  hasRole,
  toPrincipal,
  DEFAULT_STRUCTURAL_ROLE,
  type Capability,
  type Principal,
  type StructuralRole,
} from '../../../lib/roles'
import { errorResponse } from './errorResponse'
export { errorResponse } from './errorResponse'
export type { ErrorCode } from './errorResponse'

// ---------------------------------------------------------------------------
// Shared Supabase admin client (service role — used by all functions)
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// ---------------------------------------------------------------------------
// Auth user helpers — Supabase's listUsers() defaults to 50/page; without
// pagination, lookups silently miss anyone past the first page.
// ---------------------------------------------------------------------------

const AUTH_USERS_PER_PAGE = 1000

export async function listAllAuthUsers(client: SupabaseClient = supabase): Promise<any[]> {
  const all: any[] = []
  let page = 1
  while (true) {
    const { data: { users }, error } = await client.auth.admin.listUsers({
      page,
      perPage: AUTH_USERS_PER_PAGE
    })
    if (error) throw error
    if (!users || users.length === 0) break
    all.push(...users)
    if (users.length < AUTH_USERS_PER_PAGE) break
    page++
  }
  return all
}

export async function findAuthUserByEmail(
  email: string,
  client: SupabaseClient = supabase
): Promise<any | null> {
  const target = email.toLowerCase()
  let page = 1
  while (true) {
    const { data: { users }, error } = await client.auth.admin.listUsers({
      page,
      perPage: AUTH_USERS_PER_PAGE
    })
    if (error) throw error
    if (!users || users.length === 0) return null
    const found = users.find(u => u.email?.toLowerCase() === target)
    if (found) return found
    if (users.length < AUTH_USERS_PER_PAGE) return null
    page++
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Auth levels:
 *  - 'public'                — no auth required
 *  - 'authenticated'         — any logged-in user
 *  - 'admin'                 — admin only
 *  - 'admin_or_executive'    — admin or executive
 *  - StructuralRole[]        — any of the listed rungs, exactly
 *  - { capability: '…' }     — holds the named capability grant, at any rung
 *
 * The capability form is the one to reach for when the rule is "whoever does
 * this job", not "whoever is senior enough". They are different questions and
 * the old single scale could only ask the second one.
 */
export type AuthLevel =
  | 'public'
  | 'authenticated'
  | 'admin'
  | 'admin_or_executive'
  | StructuralRole[]
  | { capability: Capability }

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface AuthUser {
  id: string
  email: string
  /** Rung on the org ladder. */
  role: StructuralRole
  /** Capability grants, orthogonal to `role`. */
  capabilities: readonly Capability[]
  /** The two together, for passing to `hasRole()` / `can()` from `lib/roles`. */
  principal: Principal
  raw: Record<string, any>
}

export interface RequestContext {
  event: HandlerEvent
  supabase: SupabaseClient
  logger: Logger
  user: AuthUser | null
}

export interface HandlerResponse {
  statusCode: number
  body: string
  headers?: Record<string, string>
}

export interface CreateHandlerOptions {
  /** Function name — used for logging */
  name: string

  /**
   * Auth requirement. Can be a single level for all methods,
   * or per-method: { GET: 'public', POST: 'admin', ... }
   * Defaults to 'admin' if omitted.
   */
  auth?: AuthLevel | Partial<Record<HttpMethod, AuthLevel>>

  /** Allowed HTTP methods. Defaults to ['GET','POST','PUT','DELETE'] */
  methods?: HttpMethod[]

  /** The actual function logic */
  handler: (ctx: RequestContext) => Promise<HandlerResponse>
}

// ---------------------------------------------------------------------------
// Role helpers (exported so functions can do fine-grained checks)
// ---------------------------------------------------------------------------

/**
 * Resolve a Supabase auth user to a structural role plus capability grants.
 *
 * Mirrors `getPrincipal()` in `contexts/AuthContext.tsx`, and has to keep
 * mirroring it: the browser decides which controls to render and this decides
 * whether to answer, so a disagreement is a button that 403s. Both defer to
 * `toPrincipal()` in `lib/roles.ts` so the precedence rules exist once.
 *
 * The `user_metadata` fallback is the known hole in the README (PLAT-33).
 * `user_metadata` is writable by the account itself with a plain authenticated
 * call, so any user without a server-set `app_metadata.role` can name its own.
 * It is preserved here rather than quietly fixed: the fix has to land in both
 * resolvers at once and is tracked separately, and removing it in one place
 * only would desynchronise the layers while looking like progress.
 *
 * Capabilities are read from `app_metadata` and nowhere else. They are new, so
 * no existing account depends on the looser path, and reading them from the
 * user-writable bag would let any signed-up account hand itself the evaluator
 * grant — widening PLAT-33 instead of holding it still.
 */
export function getPrincipal(user: Record<string, any> | null | undefined): Principal {
  return toPrincipal({
    role: user?.app_metadata?.role || user?.user_metadata?.role,
    roles: [
      ...(user?.app_metadata?.roles ?? []),
      ...(user?.user_metadata?.roles ?? []),
    ],
    capabilities: user?.app_metadata?.capabilities,
  })
}

/** Check whether a principal satisfies a given auth level */
export function isAuthorized(principal: Principal, level: AuthLevel): boolean {
  if (level === 'public') return true
  if (level === 'authenticated') return true
  if (level === 'admin') return hasRole(principal, 'admin')
  if (level === 'admin_or_executive') return hasRole(principal, 'executive')
  if (Array.isArray(level)) return principal.role !== null && level.includes(principal.role)
  if (level && typeof level === 'object' && 'capability' in level) {
    return can(principal, level.capability)
  }
  return false
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

const ALLOWED_ORIGINS: string[] = [
  SITE_URL,
  'http://localhost:3000',
  'http://localhost:8888',
  'http://localhost:9000',
].filter(Boolean) as string[]

/** Build CORS headers for a given request origin. Exported for functions that don't use createHandler. */
export function getCorsHeaders(requestOrigin: string | undefined, methods: string[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': [...methods, 'OPTIONS'].join(', '),
    'Vary': 'Origin',
  }

  if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) {
    headers['Access-Control-Allow-Origin'] = requestOrigin
  }

  return headers
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getAuthLevel(
  auth: CreateHandlerOptions['auth'],
  method: string
): AuthLevel {
  if (!auth) return 'admin'
  if (typeof auth === 'string' || Array.isArray(auth)) return auth
  return (auth as Record<string, AuthLevel>)[method] ?? 'admin'
}

// ---------------------------------------------------------------------------
// Postgres / PostgREST error → HTTP status mapping
// ---------------------------------------------------------------------------

/**
 * Loose shape of a Supabase PostgrestError. We don't import the type to keep
 * this helper agnostic — anything that looks like it has a `code` and a
 * `message` is treated as a candidate.
 */
interface PgErrorShape {
  code?: string
  message?: string
  details?: string | null
  hint?: string | null
  column?: string
  constraint?: string
}

/**
 * Returns true when `err` looks like a Postgres / PostgREST error we know how
 * to map. Used by the four standalone handlers to decide whether to call
 * `pgErrorResponse(err, headers)` from their outer `catch (error)` block.
 *
 * "Looks like" = is a non-null object with a string `code` field. That's
 * enough to match both `PostgrestError` (always sets `code`) and the raw
 * Postgres errors that surface for things like NOT NULL violations.
 */
export function isPgError(err: unknown): err is PgErrorShape {
  if (!err || typeof err !== 'object') return false
  const code = (err as { code?: unknown }).code
  return typeof code === 'string' && code.length > 0
}

/**
 * Map a thrown error (from a `catch (err)` block, hence `unknown`) to the
 * HTTP status + body the API should return.
 *
 * Recognized codes:
 *   23502 (not_null_violation)         → 400  "Missing required field"
 *   23505 (unique_violation)           → 409  "Conflict: duplicate value"
 *   23514 (check_violation)            → 400  "Invalid value"
 *   22P02 (invalid_text_representation)→ 400  "Invalid value format"
 *   PGRST116 (0/>1 rows from .single)  → 404  "Not found"
 *
 * Anything else falls through to `{ statusCode: 500, body: { error:
 * 'Internal server error' } }`. Callers that care about distinguishing
 * "we mapped it" vs "we didn't" can inspect `result.statusCode === 500`.
 */
export function mapPgError(err: unknown): { statusCode: number; body: Record<string, unknown> } {
  if (!isPgError(err)) {
    return { statusCode: 500, body: { error: 'Internal server error' } }
  }

  const code = err.code

  if (code === '23502') {
    // NOT NULL violation. `column` is on the raw PG error but PostgrestError
    // sometimes only puts it in `details` like `Failing row contains (...)`.
    if (err.column) {
      return { statusCode: 400, body: { error: 'Missing required field', column: err.column } }
    }
    return { statusCode: 400, body: { error: 'Missing required field(s)' } }
  }

  if (code === '23505') {
    if (err.constraint) {
      return { statusCode: 409, body: { error: 'Conflict: duplicate value', constraint: err.constraint } }
    }
    return { statusCode: 409, body: { error: 'Conflict: duplicate value' } }
  }

  if (code === '23514') {
    if (err.constraint) {
      return { statusCode: 400, body: { error: 'Invalid value', constraint: err.constraint } }
    }
    return { statusCode: 400, body: { error: 'Invalid value' } }
  }

  if (code === '22P02') {
    return { statusCode: 400, body: { error: 'Invalid value format' } }
  }

  if (code === 'PGRST116') {
    return { statusCode: 404, body: { error: 'Not found' } }
  }

  return { statusCode: 500, body: { error: 'Internal server error' } }
}

/**
 * Convenience wrapper: stringifies the body and merges in the caller's
 * headers, so a handler can do `return pgErrorResponse(err, corsHeaders)`
 * and get back exactly the shape Netlify expects.
 */
export function pgErrorResponse(
  err: unknown,
  headers: Record<string, string> = {}
): { statusCode: number; headers: Record<string, string>; body: string } {
  const { statusCode, body } = mapPgError(err)
  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  }
}

// ---------------------------------------------------------------------------
// createHandler
// ---------------------------------------------------------------------------

export function createHandler(options: CreateHandlerOptions): Handler {
  const { name, auth, handler: handlerFn } = options
  const allowedMethods: HttpMethod[] = options.methods || ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

  return async (event: HandlerEvent, _context: NetlifyContext) => {
    const logger = Logger.fromEvent(name, event)
    const origin = event.headers.origin || event.headers.Origin
    const corsHeaders = getCorsHeaders(origin, allowedMethods)

    // --- Preflight ---
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: corsHeaders, body: '' }
    }

    // --- Method check ---
    if (!allowedMethods.includes(event.httpMethod as HttpMethod)) {
      return errorResponse({ code: 'method_not_allowed', headers: corsHeaders })
    }

    // --- Auth ---
    const authLevel = getAuthLevel(auth, event.httpMethod)
    let user: AuthUser | null = null

    if (authLevel !== 'public') {
      const authHeader = event.headers.authorization || event.headers.Authorization
      if (!authHeader?.startsWith('Bearer ')) {
        return errorResponse({ code: 'unauthorized', headers: corsHeaders })
      }

      const token = authHeader.replace('Bearer ', '')
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token)

      if (authError || !authUser) {
        return errorResponse({ code: 'unauthorized', headers: corsHeaders })
      }

      const principal = getPrincipal(authUser)
      user = {
        id: authUser.id,
        email: authUser.email || 'unknown',
        role: principal.role ?? DEFAULT_STRUCTURAL_ROLE,
        capabilities: principal.capabilities,
        principal,
        raw: authUser as unknown as Record<string, any>,
      }

      if (!isAuthorized(principal, authLevel)) {
        return errorResponse({ code: 'forbidden', headers: corsHeaders })
      }
    }

    // --- Run handler ---
    try {
      const result = await handlerFn({ event, supabase, logger, user })

      return {
        ...result,
        headers: { ...corsHeaders, ...result.headers },
      }
    } catch (error) {
      // Map known Postgres / PostgREST errors to the right HTTP status.
      // If mapPgError doesn't recognize the code it returns 500, in which
      // case we fall through to the existing "unexpected error" path.
      const mapped = mapPgError(error)
      if (mapped.statusCode !== 500) {
        // Recognized DB error — log at info level so it shows up in app_logs
        // but doesn't get treated as a server-side bug.
        logger.info(
          'api',
          `${name}_pg_error`,
          `${name} mapped DB error to ${mapped.statusCode}`,
          { metadata: { statusCode: mapped.statusCode, body: mapped.body } }
        )
        return {
          statusCode: mapped.statusCode,
          headers: corsHeaders,
          body: JSON.stringify(mapped.body),
        }
      }

      logger.error(
        'api',
        `${name}_error`,
        `${name} API error`,
        error instanceof Error ? error : new Error(String(error))
      )
      return errorResponse({ code: 'server_error', headers: corsHeaders })
    }
  }
}
