import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'

export interface InvokeOptions {
  method?: string
  path?: string
  body?: unknown
  headers?: Record<string, string>
  /** Set true if the body should be sent as a string instead of JSON-encoded. */
  rawBody?: boolean
  /** Optional bearer token; tests use this for authenticated portal calls. */
  bearerToken?: string
  /** Optional client IP; used by handlers that rate-limit per IP. */
  clientIp?: string
  /** Query string parameters; handlers read these via `event.queryStringParameters`. */
  query?: Record<string, string>
}

export interface InvokeResult<T = any> {
  statusCode: number
  body: T
  rawBody: string
  headers: Record<string, string>
}

/**
 * Invokes a Netlify function handler the same way Netlify would, building
 * a synthetic HandlerEvent from the options. We don't run a real HTTP
 * server — we call the exported handler directly. That's what we want for
 * tests: deterministic, no port juggling.
 */
export async function invokeFunction<T = any>(
  handler: Handler,
  opts: InvokeOptions = {}
): Promise<InvokeResult<T>> {
  const method = opts.method ?? 'POST'
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(opts.headers ?? {}),
  }
  if (opts.bearerToken) {
    headers['authorization'] = `Bearer ${opts.bearerToken}`
  }
  if (opts.clientIp) {
    headers['x-forwarded-for'] = opts.clientIp
  }

  const body =
    opts.body === undefined
      ? null
      : opts.rawBody
        ? String(opts.body)
        : JSON.stringify(opts.body)

  const queryParams = opts.query ?? null
  const rawQuery = queryParams
    ? new URLSearchParams(queryParams).toString()
    : ''

  const event: HandlerEvent = {
    httpMethod: method,
    path: opts.path ?? '/',
    headers,
    multiValueHeaders: {},
    queryStringParameters: queryParams,
    multiValueQueryStringParameters: null,
    body,
    isBase64Encoded: false,
    rawUrl: `http://localhost${opts.path ?? '/'}${rawQuery ? `?${rawQuery}` : ''}`,
    rawQuery,
  }

  // Minimal HandlerContext — handlers in this repo don't read context fields.
  const context = {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'test',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:test',
    memoryLimitInMB: '1024',
    awsRequestId: 'test',
    logGroupName: 'test',
    logStreamName: 'test',
    getRemainingTimeInMillis: () => 30_000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  } as unknown as HandlerContext

  const result = await handler(event, context, () => {})
  if (!result || typeof result === 'undefined') {
    throw new Error('Handler returned undefined')
  }

  const rawBody = typeof result.body === 'string' ? result.body : ''
  let parsed: any = undefined
  if (rawBody) {
    try {
      parsed = JSON.parse(rawBody)
    } catch {
      parsed = rawBody
    }
  }

  return {
    statusCode: result.statusCode ?? 200,
    body: parsed as T,
    rawBody,
    headers: (result.headers as Record<string, string>) ?? {},
  }
}
