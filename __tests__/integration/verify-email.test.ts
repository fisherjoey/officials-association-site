import { handler } from '@/netlify/functions/verify-email'
import { invokeFunction } from './helpers/invokeFunction'
import { mockMicrosoftGraph, type MockGraphHandle } from './helpers/mockGraph'

// example.org, like every other fixture address here: reserved by RFC 2606, and
// its RFC 7505 null MX both satisfies the handler's MX lookup and guarantees no
// mail can reach anyone. See the note in contact-form.test.ts.
const TEST_EMAIL = 'oas-e2e-test@example.org'

describe('verify-email', () => {
  let graph: MockGraphHandle

  beforeAll(() => {
    process.env.MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID || 'test-tenant'
    process.env.MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || 'test-client'
    process.env.MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET || 'test-secret'
    // Pin a deterministic HMAC secret so the issued token is verifiable in
    // the round-trip test even if env doesn't carry one.
    process.env.EMAIL_VERIFY_SECRET = process.env.EMAIL_VERIFY_SECRET || 'integration-test-secret'
  })

  beforeEach(() => {
    graph = mockMicrosoftGraph()
  })

  afterEach(() => {
    graph.restore()
  })

  it('rejects non-POST', async () => {
    const res = await invokeFunction(handler, { method: 'GET' })
    expect(res.statusCode).toBe(405)
  })

  it('rejects body without an email field', async () => {
    const res = await invokeFunction(handler, { method: 'POST', body: {} })
    expect(res.statusCode).toBe(400)
    expect(res.body.message ?? res.body.error).toMatch(/email/i)
  })

  it('issues a token, emails the code, and round-trips verification', async () => {
    // Step 1: request a code. The handler also generates the random
    // 6-digit code and sends it via Graph (mocked). We sniff it back out
    // of the email body to round-trip verify it without parsing the
    // opaque HMAC token.
    const issue = await invokeFunction(handler, {
      method: 'POST',
      body: { email: TEST_EMAIL },
      // Use a unique IP so we don't trip the cross-test rate limiter.
      clientIp: `10.0.${Date.now() % 250}.1`,
    })
    expect(issue.statusCode).toBe(200)
    expect(issue.body.success).toBe(true)
    expect(issue.body.token).toBeTruthy()

    // Pull the 6-digit code out of the captured email body. The template
    // wraps the code in a <span style="...font-family: monospace;">CODE</span>
    // — match on that container so we don't accidentally pick up a color hex.
    const send = graph.sends.find((s) => s.subject.includes('Verification Code'))
    expect(send).toBeTruthy()
    const codeMatch = send!.bodyHtml.match(/font-family:\s*monospace[^>]*>(\d{6})</)
    expect(codeMatch).toBeTruthy()
    const code = codeMatch![1]

    // Step 2: verify with the right code → success.
    const ok = await invokeFunction(handler, {
      method: 'POST',
      body: { email: TEST_EMAIL, code, token: issue.body.token },
      clientIp: `10.0.${Date.now() % 250}.2`,
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.body.success).toBe(true)
    expect(ok.body.valid).toBe(true)

    // Step 3: verify with a wrong code → 400 invalid.
    const bad = await invokeFunction(handler, {
      method: 'POST',
      body: { email: TEST_EMAIL, code: '000000', token: issue.body.token },
      clientIp: `10.0.${Date.now() % 250}.3`,
    })
    expect(bad.statusCode).toBe(400)
    expect(bad.body.valid).toBe(false)
  })

  it('rejects verification when the email does not match the token', async () => {
    const issue = await invokeFunction(handler, {
      method: 'POST',
      body: { email: TEST_EMAIL },
      clientIp: `10.0.${Date.now() % 250}.4`,
    })
    expect(issue.statusCode).toBe(200)
    const send = graph.sends.find((s) => s.subject.includes('Verification Code'))
    const code = send!.bodyHtml.match(/font-family:\s*monospace[^>]*>(\d{6})</)![1]

    const res = await invokeFunction(handler, {
      method: 'POST',
      body: { email: 'someone-else@example.org', code, token: issue.body.token },
      clientIp: `10.0.${Date.now() % 250}.5`,
    })
    expect(res.statusCode).toBe(400)
    expect(res.body.valid).toBe(false)
  })
})
