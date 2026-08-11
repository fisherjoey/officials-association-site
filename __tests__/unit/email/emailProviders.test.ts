/**
 * Adapter conformance for lib/email.
 *
 * All three transports are driven through the same `EmailProvider` interface
 * and the same assertions. Nothing here opens a socket or calls fetch: the
 * Resend and Graph adapters take an injected `fetchImpl`, and the SMTP adapter
 * takes an injected connection factory.
 *
 * The load-bearing assertion is the blind-copy one. Bulk mail puts the whole
 * membership in `bcc`; an adapter that quietly promotes those addresses into
 * `to`, `cc` or a message header discloses every member's address to every
 * other member, and no test that only checks "the send succeeded" would notice.
 */

import {
  createGraphProvider,
  buildGraphPayload,
} from '@/lib/email/graph'
import { createResendProvider, buildResendPayload } from '@/lib/email/resend'
import {
  createSmtpProvider,
  buildMimeMessage,
  dotStuff,
  encodeHeaderValue,
  takeReply,
  wrapBase64,
  type SmtpConnection,
  type SmtpReply,
} from '@/lib/email/smtp'
import {
  EmailConfigurationError,
  EmailSendError,
  toAddress,
  type EmailMessage,
  type EmailProvider,
} from '@/lib/email/types'

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

interface CapturedHttpCall {
  url: string
  body: string
}

function fakeFetch(
  calls: CapturedHttpCall[],
  responder: (url: string) => { ok: boolean; status: number; body: unknown }
): typeof fetch {
  return (async (input: unknown, init?: { body?: unknown }) => {
    const url = String(input)
    calls.push({ url, body: typeof init?.body === 'string' ? init.body : String(init?.body) })
    const res = responder(url)
    return {
      ok: res.ok,
      status: res.status,
      json: async () => res.body,
      text: async () => (typeof res.body === 'string' ? res.body : JSON.stringify(res.body)),
    }
  }) as unknown as typeof fetch
}

interface FakeSmtpOptions {
  ehloCaps?: string[]
  /** Simulate a pre-ESMTP server that 500s on EHLO. */
  noEsmtp?: boolean
  /** Verb prefix -> reply, e.g. { 'RCPT TO': { code: 550, lines: ['no'] } }. */
  overrides?: Record<string, SmtpReply>
}

interface FakeSmtp extends SmtpConnection {
  commands: string[]
  data: string
  startTlsCalls: number
  closed: boolean
}

function createFakeSmtp(options: FakeSmtpOptions = {}): FakeSmtp {
  const caps = options.ehloCaps ?? ['STARTTLS', 'AUTH PLAIN LOGIN', 'SIZE 10240000']
  const overrides = options.overrides ?? {}
  const queue: SmtpReply[] = [{ code: 220, lines: ['fake.smtp.test ESMTP ready'] }]
  const commands: string[] = []
  let awaitingData = false
  let authLoginStep = 0
  let data = ''

  const override = (command: string): SmtpReply | undefined => {
    const key = Object.keys(overrides).find((k) => command.toUpperCase().startsWith(k.toUpperCase()))
    return key ? overrides[key] : undefined
  }

  function handle(command: string): SmtpReply {
    const forced = override(command)
    if (forced) return forced
    const verb = command.toUpperCase()

    if (authLoginStep === 1) {
      authLoginStep = 2
      return { code: 334, lines: ['UGFzc3dvcmQ6'] }
    }
    if (authLoginStep === 2) {
      authLoginStep = 0
      return { code: 235, lines: ['Authentication successful'] }
    }

    if (verb.startsWith('EHLO')) {
      if (options.noEsmtp) return { code: 500, lines: ['command not recognized'] }
      return { code: 250, lines: ['fake.smtp.test greets you', ...caps] }
    }
    if (verb.startsWith('HELO')) return { code: 250, lines: ['fake.smtp.test'] }
    if (verb === 'STARTTLS') return { code: 220, lines: ['ready to start TLS'] }
    if (verb.startsWith('AUTH PLAIN')) return { code: 235, lines: ['Authentication successful'] }
    if (verb === 'AUTH LOGIN') {
      authLoginStep = 1
      return { code: 334, lines: ['VXNlcm5hbWU6'] }
    }
    if (verb.startsWith('MAIL FROM')) return { code: 250, lines: ['sender ok'] }
    if (verb.startsWith('RCPT TO')) return { code: 250, lines: ['recipient ok'] }
    if (verb === 'DATA') {
      awaitingData = true
      return { code: 354, lines: ['end data with <CR><LF>.<CR><LF>'] }
    }
    if (verb === 'QUIT') return { code: 221, lines: ['bye'] }
    return { code: 500, lines: [`unrecognised command: ${command}`] }
  }

  const conn: FakeSmtp = {
    commands,
    get data() {
      return data
    },
    startTlsCalls: 0,
    closed: false,
    async write(chunk: string) {
      if (awaitingData) {
        awaitingData = false
        data = chunk
        queue.push({ code: 250, lines: ['Ok: queued as FAKE00001'] })
        return
      }
      const command = chunk.replace(/\r\n$/, '')
      commands.push(command)
      queue.push(handle(command))
    },
    async writeLine(line: string) {
      await conn.write(line + '\r\n')
    },
    async readReply() {
      const next = queue.shift()
      if (!next) throw new Error('fake SMTP: readReply() with nothing queued')
      return next
    },
    async startTls() {
      conn.startTlsCalls += 1
    },
    async close() {
      conn.closed = true
    },
  }

  return conn
}

// ---------------------------------------------------------------------------
// The message every adapter has to carry
// ---------------------------------------------------------------------------

const BLIND = ['blind-one@example.test', 'blind-two@example.test']

const MESSAGE: EmailMessage = {
  from: { address: 'no-reply@example.org', name: 'Example Org' },
  to: 'visible@example.test',
  cc: ['carbon@example.test'],
  bcc: BLIND,
  replyTo: { name: 'Reply Person', address: 'reply@example.test' },
  subject: 'Reset your password',
  html: '<p>Follow the link.</p>',
}

interface Harness {
  name: string
  build(): EmailProvider
  buildFailing(): EmailProvider
  /** Everything a recipient or relay could read off the message itself. */
  visible(): string
  /** Every address the transport was actually asked to deliver to. */
  envelope(): string[]
  lastPayload(): string
}

function resendHarness(): Harness {
  const calls: CapturedHttpCall[] = []
  return {
    name: 'resend',
    build: () =>
      createResendProvider({
        apiKey: 'test-key',
        fetchImpl: fakeFetch(calls, () => ({ ok: true, status: 200, body: { id: 'res_123' } })),
      }),
    buildFailing: () =>
      createResendProvider({
        apiKey: 'test-key',
        fetchImpl: fakeFetch(calls, () => ({ ok: false, status: 422, body: 'domain not verified' })),
      }),
    lastPayload: () => calls[calls.length - 1].body,
    visible: () => {
      const payload = JSON.parse(calls[calls.length - 1].body)
      delete payload.bcc
      return JSON.stringify(payload)
    },
    envelope: () => {
      const payload = JSON.parse(calls[calls.length - 1].body)
      return [...(payload.to ?? []), ...(payload.cc ?? []), ...(payload.bcc ?? [])]
    },
  }
}

function graphHarness(): Harness {
  const calls: CapturedHttpCall[] = []
  const responder = (ok: boolean) => (url: string) =>
    url.includes('/oauth2/v2.0/token')
      ? { ok: true, status: 200, body: { access_token: 'tok', expires_in: 3600 } }
      : { ok, status: ok ? 202 : 500, body: ok ? '' : 'graph exploded' }

  return {
    name: 'graph',
    build: () =>
      createGraphProvider({
        tenantId: 't',
        clientId: 'c',
        clientSecret: 's',
        fetchImpl: fakeFetch(calls, responder(true)),
      }),
    buildFailing: () =>
      createGraphProvider({
        tenantId: 't',
        clientId: 'c',
        clientSecret: 's',
        fetchImpl: fakeFetch(calls, responder(false)),
      }),
    lastPayload: () => calls[calls.length - 1].body,
    visible: () => {
      const payload = JSON.parse(calls[calls.length - 1].body)
      delete payload.message.bccRecipients
      return JSON.stringify(payload)
    },
    envelope: () => {
      const { message } = JSON.parse(calls[calls.length - 1].body)
      return [
        ...(message.toRecipients ?? []),
        ...(message.ccRecipients ?? []),
        ...(message.bccRecipients ?? []),
      ].map((r: { emailAddress: { address: string } }) => r.emailAddress.address)
    },
  }
}

function smtpHarness(): Harness {
  let conn: FakeSmtp
  const make = (overrides?: FakeSmtpOptions['overrides']) =>
    createSmtpProvider({
      host: 'smtp.example.test',
      port: 587,
      secure: false,
      user: 'mailer',
      password: 'hunter2',
      requireTls: true,
      randomId: () => 'fixed-id',
      now: () => new Date('2026-08-10T12:00:00Z'),
      connect: async () => {
        conn = createFakeSmtp({ overrides })
        return conn
      },
    })

  return {
    name: 'smtp',
    build: () => make(),
    buildFailing: () => make({ 'RCPT TO': { code: 550, lines: ['relay access denied'] } }),
    lastPayload: () => conn.data,
    // Blind recipients must not reach any header; the body is base64 so an
    // address could only leak through the header block.
    visible: () => conn.data,
    envelope: () =>
      conn.commands
        .filter((c) => c.toUpperCase().startsWith('RCPT TO'))
        .map((c) => c.replace(/^RCPT TO:</i, '').replace(/>$/, '')),
  }
}

const harnesses = [resendHarness, graphHarness, smtpHarness]

describe.each(harnesses.map((h) => [h().name, h] as const))(
  'EmailProvider contract — %s',
  (_name, makeHarness) => {
    it('reports its own name', async () => {
      const harness = makeHarness()
      expect(['resend', 'smtp', 'graph']).toContain(harness.build().name)
    })

    it('delivers to every recipient across to, cc and bcc', async () => {
      const harness = makeHarness()
      await harness.build().send(MESSAGE)
      expect(harness.envelope().join(' ')).toContain('visible@example.test')
      expect(harness.envelope().join(' ')).toContain('carbon@example.test')
      for (const blind of BLIND) {
        expect(harness.envelope().join(' ')).toContain(blind)
      }
    })

    it('never exposes a bcc recipient in the visible message', async () => {
      const harness = makeHarness()
      await harness.build().send(MESSAGE)
      for (const blind of BLIND) {
        expect(harness.visible()).not.toContain(blind)
      }
    })

    it('carries the subject and the html body', async () => {
      const harness = makeHarness()
      await harness.build().send(MESSAGE)
      const payload = harness.lastPayload()
      // SMTP base64-encodes both; decode before asserting.
      const decoded =
        harness.name === 'smtp'
          ? payload + Buffer.from(payload.split('\r\n\r\n').slice(1).join('\r\n\r\n'), 'base64').toString('utf8')
          : payload
      expect(decoded).toContain('Reset your password')
      expect(decoded).toContain('<p>Follow the link.</p>')
    })

    it('throws EmailSendError when the transport refuses the message', async () => {
      const harness = makeHarness()
      await expect(harness.buildFailing().send(MESSAGE)).rejects.toBeInstanceOf(EmailSendError)
    })

    it('rejects a message with no recipients before touching the transport', async () => {
      const harness = makeHarness()
      await expect(
        harness.build().send({ ...MESSAGE, to: [], cc: undefined, bcc: undefined })
      ).rejects.toBeInstanceOf(EmailConfigurationError)
    })

    it('rejects a message with no subject', async () => {
      const harness = makeHarness()
      await expect(harness.build().send({ ...MESSAGE, subject: '  ' })).rejects.toBeInstanceOf(
        EmailConfigurationError
      )
    })

    it('carries attachments', async () => {
      const harness = makeHarness()
      await harness.build().send({
        ...MESSAGE,
        attachments: [
          { filename: 'Fee-Schedule.pdf', content: 'JVBERi0xLjQK', contentType: 'application/pdf' },
        ],
      })
      expect(harness.lastPayload()).toContain('Fee-Schedule.pdf')
      expect(harness.lastPayload()).toContain('JVBERi0xLjQK')
    })
  }
)

// ---------------------------------------------------------------------------
// Address handling — shared by every adapter
// ---------------------------------------------------------------------------

describe('address normalisation', () => {
  it('accepts a bare string and an object form', () => {
    expect(toAddress('a@b.test')).toEqual({ address: 'a@b.test' })
    expect(toAddress({ address: ' a@b.test ', name: ' Someone ' })).toEqual({
      address: 'a@b.test',
      name: 'Someone',
    })
  })

  it.each([
    ['a newline in the address', 'a@b.test\r\nBcc: attacker@evil.test'],
    ['a bare LF in the address', 'a@b.test\nX-Header: x'],
    ['an angle-bracketed form', '<a@b.test>'],
    ['a non-address', 'not-an-address'],
    ['an empty address', '   '],
  ])('rejects %s', (_label, value) => {
    expect(() => toAddress(value)).toThrow(EmailConfigurationError)
  })

  it('rejects a newline in the display name', () => {
    expect(() =>
      toAddress({ address: 'a@b.test', name: 'Someone\r\nBcc: attacker@evil.test' })
    ).toThrow(EmailConfigurationError)
  })
})

// ---------------------------------------------------------------------------
// Resend specifics
// ---------------------------------------------------------------------------

describe('resend adapter', () => {
  it('maps replyTo onto Resend’s reply_to field and formats display names', () => {
    const payload = buildResendPayload(MESSAGE)
    expect(payload.from).toBe('"Example Org" <no-reply@example.org>')
    expect(payload.reply_to).toEqual(['"Reply Person" <reply@example.test>'])
    expect(payload.bcc).toEqual(BLIND)
  })

  it('returns the id Resend assigns', async () => {
    const calls: CapturedHttpCall[] = []
    const provider = createResendProvider({
      apiKey: 'k',
      fetchImpl: fakeFetch(calls, () => ({ ok: true, status: 200, body: { id: 'res_abc' } })),
    })
    await expect(provider.send(MESSAGE)).resolves.toEqual({ provider: 'resend', id: 'res_abc' })
    expect(calls[0].url).toBe('https://api.resend.com/emails')
  })
})

// ---------------------------------------------------------------------------
// Graph specifics
// ---------------------------------------------------------------------------

describe('graph adapter', () => {
  it('defaults saveToSentItems to true and honours an explicit false', () => {
    expect(buildGraphPayload(MESSAGE).saveToSentItems).toBe(true)
    expect(
      buildGraphPayload({
        ...MESSAGE,
        providerOptions: { graph: { saveToSentItems: false } },
      }).saveToSentItems
    ).toBe(false)
  })

  it('posts to the sending mailbox’s sendMail endpoint', async () => {
    const calls: CapturedHttpCall[] = []
    const provider = createGraphProvider({
      tenantId: 'tenant-1',
      clientId: 'c',
      clientSecret: 's',
      fetchImpl: fakeFetch(calls, (url) =>
        url.includes('token')
          ? { ok: true, status: 200, body: { access_token: 'tok', expires_in: 3600 } }
          : { ok: true, status: 202, body: '' }
      ),
    })
    await provider.send(MESSAGE)
    expect(calls[0].url).toBe('https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token')
    expect(calls[1].url).toContain('/users/no-reply%40example.org/sendMail')
  })

  it('reuses a cached access token across sends until it nears expiry', async () => {
    const calls: CapturedHttpCall[] = []
    let clock = 0
    const provider = createGraphProvider({
      tenantId: 't',
      clientId: 'c',
      clientSecret: 's',
      now: () => clock,
      fetchImpl: fakeFetch(calls, (url) =>
        url.includes('token')
          ? { ok: true, status: 200, body: { access_token: 'tok', expires_in: 3600 } }
          : { ok: true, status: 202, body: '' }
      ),
    })

    await provider.send(MESSAGE)
    await provider.send(MESSAGE)
    expect(calls.filter((c) => c.url.includes('token'))).toHaveLength(1)

    clock += 3600 * 1000
    await provider.send(MESSAGE)
    expect(calls.filter((c) => c.url.includes('token'))).toHaveLength(2)
  })

  it('surfaces a token-endpoint failure as EmailSendError', async () => {
    const calls: CapturedHttpCall[] = []
    const provider = createGraphProvider({
      tenantId: 't',
      clientId: 'c',
      clientSecret: 'wrong',
      fetchImpl: fakeFetch(calls, () => ({ ok: false, status: 401, body: 'invalid_client' })),
    })
    await expect(provider.send(MESSAGE)).rejects.toThrow(/Microsoft access token/)
  })
})

// ---------------------------------------------------------------------------
// SMTP specifics
// ---------------------------------------------------------------------------

describe('smtp adapter — protocol', () => {
  const build = (
    overrides: Partial<Parameters<typeof createSmtpProvider>[0]> = {},
    fakeOptions: FakeSmtpOptions = {}
  ) => {
    let conn!: FakeSmtp
    const provider = createSmtpProvider({
      host: 'smtp.example.test',
      port: 587,
      secure: false,
      requireTls: true,
      randomId: () => 'fixed',
      now: () => new Date('2026-08-10T12:00:00Z'),
      connect: async () => {
        conn = createFakeSmtp(fakeOptions)
        return conn
      },
      ...overrides,
    })
    return { provider, conn: () => conn }
  }

  it('upgrades with STARTTLS and re-issues EHLO over the encrypted channel', async () => {
    const { provider, conn } = build({ user: 'u', password: 'p' })
    await provider.send(MESSAGE)
    const commands = conn().commands
    expect(conn().startTlsCalls).toBe(1)
    expect(commands.filter((c) => c.startsWith('EHLO'))).toHaveLength(2)
    expect(commands.indexOf('STARTTLS')).toBeLessThan(
      commands.findIndex((c) => c.startsWith('AUTH'))
    )
  })

  it('refuses to send in the clear when the server offers no STARTTLS', async () => {
    const { provider } = build({}, { ehloCaps: ['SIZE 10240000'] })
    await expect(provider.send(MESSAGE)).rejects.toBeInstanceOf(EmailConfigurationError)
  })

  it('sends in the clear when SMTP_ALLOW_INSECURE lowered requireTls', async () => {
    const { provider, conn } = build({ requireTls: false }, { ehloCaps: ['SIZE 10240000'] })
    await provider.send(MESSAGE)
    expect(conn().commands).toContain('DATA')
  })

  it('uses AUTH PLAIN when offered', async () => {
    const { provider, conn } = build({ user: 'mailer', password: 'hunter2' })
    await provider.send(MESSAGE)
    const auth = conn().commands.find((c) => c.startsWith('AUTH'))
    expect(auth).toBe(`AUTH PLAIN ${Buffer.from('\0mailer\0hunter2').toString('base64')}`)
  })

  it('falls back to AUTH LOGIN when PLAIN is not offered', async () => {
    const { provider, conn } = build(
      { user: 'mailer', password: 'hunter2' },
      { ehloCaps: ['STARTTLS', 'AUTH LOGIN'] }
    )
    await provider.send(MESSAGE)
    expect(conn().commands).toContain('AUTH LOGIN')
    expect(conn().commands).toContain(Buffer.from('mailer').toString('base64'))
    expect(conn().commands).toContain(Buffer.from('hunter2').toString('base64'))
  })

  it('skips AUTH entirely when no credentials are configured', async () => {
    const { provider, conn } = build()
    await provider.send(MESSAGE)
    expect(conn().commands.some((c) => c.startsWith('AUTH'))).toBe(false)
  })

  it('falls back to HELO against a pre-ESMTP server', async () => {
    const { provider, conn } = build({ requireTls: false }, { noEsmtp: true })
    await provider.send(MESSAGE)
    expect(conn().commands).toContain('HELO example.org')
  })

  it('closes the connection even when the session fails', async () => {
    const { provider, conn } = build({}, { overrides: { 'MAIL FROM': { code: 451, lines: ['nope'] } } })
    await expect(provider.send(MESSAGE)).rejects.toBeInstanceOf(EmailSendError)
    expect(conn().closed).toBe(true)
  })

  it('terminates DATA with a lone dot', async () => {
    const { provider, conn } = build()
    await provider.send(MESSAGE)
    expect(conn().data.endsWith('\r\n.\r\n')).toBe(true)
  })
})

describe('smtp adapter — message construction', () => {
  const options = { messageId: 'id@example.org', date: 'Mon, 10 Aug 2026 12:00:00 GMT', boundary: 'BOUND' }

  it('omits Bcc from the header block', () => {
    const mime = buildMimeMessage(MESSAGE, options)
    expect(mime).toContain('To: <visible@example.test>')
    expect(mime).toContain('Cc: <carbon@example.test>')
    expect(mime).not.toMatch(/^Bcc:/m)
    for (const blind of BLIND) expect(mime).not.toContain(blind)
  })

  it('encodes a non-ASCII subject as an RFC 2047 word', () => {
    const mime = buildMimeMessage({ ...MESSAGE, subject: 'Réinitialisation' }, options)
    expect(mime).toContain(`Subject: =?UTF-8?B?${Buffer.from('Réinitialisation', 'utf8').toString('base64')}?=`)
  })

  it('flattens a newline smuggled into the subject instead of emitting a new header', () => {
    const mime = buildMimeMessage(
      { ...MESSAGE, subject: 'Hello\r\nBcc: attacker@evil.test' },
      options
    )
    expect(mime).toContain('Subject: Hello Bcc: attacker@evil.test')
    expect(mime).not.toMatch(/^Bcc: attacker@evil\.test/m)
  })

  it('builds a multipart/mixed body when attachments are present', () => {
    const mime = buildMimeMessage(
      {
        ...MESSAGE,
        attachments: [{ filename: 'a.pdf', content: 'AAAA', contentType: 'application/pdf' }],
      },
      options
    )
    expect(mime).toContain('Content-Type: multipart/mixed; boundary="BOUND"')
    expect(mime).toContain('Content-Disposition: attachment; filename="a.pdf"')
    expect(mime.trimEnd().endsWith('--BOUND--')).toBe(true)
  })

  it('base64-encodes the html body at 76 columns', () => {
    const html = '<p>' + 'x'.repeat(500) + '</p>'
    const mime = buildMimeMessage({ ...MESSAGE, html }, options)
    const body = mime.split('\r\n\r\n').slice(1).join('\r\n\r\n')
    expect(Buffer.from(body, 'base64').toString('utf8')).toBe(html)
    for (const line of body.split('\r\n')) expect(line.length).toBeLessThanOrEqual(76)
  })
})

describe('smtp helpers', () => {
  it('parses a multi-line reply and leaves the remainder in the buffer', () => {
    const taken = takeReply('250-greeting\r\n250-STARTTLS\r\n250 AUTH PLAIN\r\n220 next\r\n')
    expect(taken?.reply).toEqual({ code: 250, lines: ['greeting', 'STARTTLS', 'AUTH PLAIN'] })
    expect(taken?.rest).toBe('220 next\r\n')
  })

  it('returns null while a reply is still arriving', () => {
    // No terminator yet.
    expect(takeReply('250-greet')).toBeNull()
    // Continuation complete, final line still mid-flight.
    expect(takeReply('250-greet\r\n250 don')).toBeNull()
    // Final line lands.
    expect(takeReply('250-greet\r\n250 done\r\n')?.reply.code).toBe(250)
  })

  it('doubles a leading dot so a body line cannot end DATA early', () => {
    expect(dotStuff('.hidden\r\nnormal\r\n.\r\n')).toBe('..hidden\r\nnormal\r\n..\r\n')
  })

  it('leaves pure ASCII header values alone', () => {
    expect(encodeHeaderValue('Plain Subject')).toBe('Plain Subject')
  })

  it('wraps base64 at 76 characters', () => {
    const wrapped = wrapBase64('A'.repeat(200))
    expect(wrapped.split('\r\n').map((l) => l.length)).toEqual([76, 76, 48])
  })
})
