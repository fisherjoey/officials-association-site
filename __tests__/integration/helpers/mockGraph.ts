/**
 * Mocks the Microsoft Graph endpoints (`/oauth2/v2.0/token` for tokens and
 * `/v1.0/users/.../sendMail` for sends) by intercepting global.fetch.
 *
 * Tests don't have real Graph credentials in every environment — and we
 * don't want a flaky third-party dependency in CI anyway. Mocking lets us
 * still assert the *routing* logic: that the outbound call carries the
 * dead-inbox address the test set in env, with the expected subject/body
 * shape. That's what would silently break if someone wired up the wrong
 * env var.
 */

export interface CapturedSend {
  url: string
  toRecipients: string[]
  ccRecipients: string[]
  subject: string
  bodyHtml: string
  attachmentCount: number
}

export interface MockGraphHandle {
  /** Every sendMail call captured during the test. */
  sends: CapturedSend[]
  restore: () => void
}

export function mockMicrosoftGraph(): MockGraphHandle {
  const originalFetch = global.fetch
  const sends: CapturedSend[] = []

  global.fetch = (async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input?.url ?? String(input)

    // OAuth token endpoint
    if (url.includes('/oauth2/v2.0/token')) {
      return new Response(
        JSON.stringify({ access_token: 'mock-token', token_type: 'Bearer', expires_in: 3600 }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    }

    // sendMail endpoint
    if (url.includes('/sendMail')) {
      const body = init?.body ? JSON.parse(init.body as string) : {}
      const msg = body?.message ?? {}
      sends.push({
        url,
        toRecipients: (msg.toRecipients ?? []).map((r: any) => r?.emailAddress?.address),
        ccRecipients: (msg.ccRecipients ?? []).map((r: any) => r?.emailAddress?.address),
        subject: msg.subject ?? '',
        bodyHtml: msg.body?.content ?? '',
        attachmentCount: (msg.attachments ?? []).length,
      })
      return new Response('', { status: 202 })
    }

    // Anything else passes through to the real fetch (Supabase, etc.)
    return originalFetch(input, init)
  }) as typeof fetch

  return {
    sends,
    restore: () => {
      global.fetch = originalFetch
    },
  }
}
