/**
 * Standardized error responses for Netlify functions.
 *
 * The body shape is { error: ErrorCode, message?: string, fields?: Record<string,string> }
 * where `error` is a stable machine-readable code and `message` is a calm,
 * user-safe message. Internal details (stack traces, env-var names, supabase
 * internals) MUST NOT be put in `message` — log them via Logger.error instead.
 *
 * Match this on the client with lib/userFacingError.ts to render friendly copy.
 */

export type ErrorCode =
  | 'bad_request'
  | 'invalid_input'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'method_not_allowed'
  | 'rate_limited'
  | 'email_unavailable'
  | 'verification_required'
  | 'verification_failed'
  | 'service_unavailable'
  | 'server_error'

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  invalid_input: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  method_not_allowed: 405,
  rate_limited: 429,
  email_unavailable: 400,
  verification_required: 400,
  verification_failed: 400,
  service_unavailable: 503,
  server_error: 500,
}

/** Calm, user-safe defaults for each code. */
const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
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
  server_error: 'Something went wrong on our end — please try again, or contact us if the problem persists.',
}

export interface ErrorResponseInit {
  code: ErrorCode
  /** Override the default user-safe message. Keep it calm and actionable. */
  message?: string
  /** Field-level validation errors, keyed by field name. */
  fields?: Record<string, string>
  /** Headers to attach to the response. */
  headers?: Record<string, string>
  /** Override the default HTTP status for this code. */
  statusCode?: number
  /** Extra body keys (e.g. `suggestion` for typo correction). */
  extra?: Record<string, unknown>
}

export interface NetlifyHandlerResponse {
  statusCode: number
  body: string
  headers: Record<string, string>
}

export function errorResponse(init: ErrorResponseInit): NetlifyHandlerResponse {
  const body: Record<string, unknown> = {
    error: init.code,
    message: init.message ?? DEFAULT_MESSAGE[init.code],
  }
  if (init.fields) body.fields = init.fields
  if (init.extra) {
    for (const [k, v] of Object.entries(init.extra)) {
      if (k !== 'error' && k !== 'message' && k !== 'fields') body[k] = v
    }
  }
  return {
    statusCode: init.statusCode ?? STATUS[init.code],
    headers: init.headers ?? {},
    body: JSON.stringify(body),
  }
}
