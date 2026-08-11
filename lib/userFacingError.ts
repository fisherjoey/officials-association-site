/**
 * Map server / network errors to calm, user-safe copy.
 *
 * Every code path that surfaces an error to a user (toast, banner, inline)
 * should route through `toFriendlyMessage` or `readFriendlyError` so that
 * customers never see raw `Failed to fetch`, supabase internals, env-var
 * names, or stack traces.
 *
 * The server side (netlify/functions/_shared/errorResponse.ts) emits
 * `{ error: code, message?, fields? }`. This module decodes that shape.
 */

export interface FriendlyError {
  /** Calm, plain-language sentence to show the user. */
  message: string
  /** Field-level validation errors, keyed by field name. */
  fields?: Record<string, string>
  /** The original error code from the server, if any (machine-readable). */
  code?: string
}

export interface ServerErrorBody {
  error?: string
  message?: string
  fields?: Record<string, string>
  [key: string]: unknown
}

const GENERIC_MESSAGE =
  'Something went wrong on our end — please try again, or contact us if the problem persists.'

const STATUS_DEFAULTS: Record<number, string> = {
  400: 'That request didn’t look right. Please check your input and try again.',
  401: 'Please sign in to continue.',
  403: 'You don’t have permission to do that.',
  404: 'We couldn’t find what you were looking for.',
  405: 'That action is not allowed.',
  408: 'The request timed out. Please try again.',
  409: 'That doesn’t match the current state — please refresh and try again.',
  413: 'That file is too large to upload.',
  422: 'Please check the highlighted fields and try again.',
  429: 'You’re going a bit fast — please wait a minute and try again.',
  500: GENERIC_MESSAGE,
  502: 'We couldn’t reach a service we depend on. Please try again shortly.',
  503: 'We couldn’t reach a service we depend on. Please try again shortly.',
  504: 'We couldn’t reach a service we depend on. Please try again shortly.',
}

const CODE_DEFAULTS: Record<string, string> = {
  bad_request: 'That request didn’t look right. Please check your input and try again.',
  invalid_input: 'Please check the highlighted fields and try again.',
  unauthorized: 'Please sign in to continue.',
  forbidden: 'You don’t have permission to do that.',
  not_found: 'We couldn’t find what you were looking for.',
  method_not_allowed: 'That action is not allowed here.',
  rate_limited: 'You’re going a bit fast — please wait a minute and try again.',
  email_unavailable: 'That email address looks invalid. Please double-check and try again.',
  verification_required: 'Please verify your email address before submitting.',
  verification_failed: 'That verification code didn’t match. Please check the email and try again.',
  service_unavailable: 'We couldn’t reach a service we depend on. Please try again in a few minutes.',
  server_error: GENERIC_MESSAGE,
}

function isFriendlyText(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (trimmed.length === 0) return false
  // Reject codes (no spaces, all-lowercase or snake_case) — keep them as codes.
  if (/^[a-z][a-z0-9_]*$/.test(trimmed) && !trimmed.includes(' ')) return false
  return true
}

/**
 * Map a fetch Response + parsed JSON body to a friendly error.
 * Prefers (in order): server-provided `message`, code-based default,
 * status-based default, generic fallback.
 */
export function toFriendlyMessage(
  response: Response | { status: number } | null,
  body: ServerErrorBody | null | undefined,
): FriendlyError {
  const code = typeof body?.error === 'string' ? body.error : undefined
  const fields = body?.fields

  if (body && isFriendlyText(body.message)) {
    return { message: body.message!.trim(), fields, code }
  }

  if (code && CODE_DEFAULTS[code]) {
    return { message: CODE_DEFAULTS[code], fields, code }
  }

  // Some legacy endpoints still put a free-text sentence in `error`.
  // If it looks like a sentence (has spaces, isn't a snake_case code), use it.
  if (code && isFriendlyText(code)) {
    return { message: code, fields, code: undefined }
  }

  if (response && STATUS_DEFAULTS[response.status]) {
    return { message: STATUS_DEFAULTS[response.status], fields, code }
  }

  return { message: GENERIC_MESSAGE, fields, code }
}

/**
 * Read a fetch Response and produce a friendly error. Safe to call on
 * non-JSON bodies — falls back to the status-code default.
 */
export async function readFriendlyError(response: Response): Promise<FriendlyError> {
  let body: ServerErrorBody | null = null
  try {
    body = await response.json()
  } catch {
    // Body is empty or not JSON — fall through.
  }
  return toFriendlyMessage(response, body)
}

/**
 * Map a thrown error (typically from `fetch` itself or an AppError) to
 * a friendly message. Use this in catch blocks where the request never
 * produced a Response.
 */
export function friendlyErrorFromThrown(error: unknown): FriendlyError {
  if (error instanceof TypeError && /failed to fetch|network/i.test(error.message)) {
    return {
      message:
        'We couldn’t reach the server. Please check your internet connection and try again.',
    }
  }
  if (typeof error === 'object' && error !== null) {
    const e = error as { code?: string; statusCode?: number; message?: string; fields?: Record<string, string> }
    if (e.code && CODE_DEFAULTS[e.code]) {
      return { message: CODE_DEFAULTS[e.code], fields: e.fields, code: e.code }
    }
    if (typeof e.statusCode === 'number' && STATUS_DEFAULTS[e.statusCode]) {
      return { message: STATUS_DEFAULTS[e.statusCode], fields: e.fields, code: e.code }
    }
    if (isFriendlyText(e.message)) {
      return { message: e.message!.trim(), fields: e.fields, code: e.code }
    }
  }
  return { message: GENERIC_MESSAGE }
}
