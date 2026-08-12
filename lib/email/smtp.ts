/**
 * Generic SMTP adapter — zero runtime dependencies.
 *
 * Why hand-rolled rather than nodemailer: `node_modules` in this repo is a
 * shared install, this ships under a noncommercial licence where every new
 * dependency needs a licence check, and the subset of SMTP a transactional
 * sender needs (ESMTP + STARTTLS + AUTH PLAIN/LOGIN + one MIME body with
 * optional attachments) is small and stable. See the report for the trade-off.
 *
 * The socket layer sits behind `SmtpConnection` so the whole conversation is
 * exercised in unit tests against an in-memory fake — no test opens a socket.
 */

import {
  assertSendable,
  EmailConfigurationError,
  EmailMessage,
  EmailProvider,
  EmailSendError,
  EmailSendResult,
  toAddress,
  toAddressList,
  type EmailAddress,
} from './types'

const CRLF = '\r\n'

// ---------------------------------------------------------------------------
// Connection abstraction
// ---------------------------------------------------------------------------

export interface SmtpReply {
  code: number
  lines: string[]
}

export interface SmtpConnection {
  /** Write a command. The implementation appends CRLF for `writeLine`. */
  write(data: string): Promise<void>
  writeLine(line: string): Promise<void>
  /** Resolve once a complete (possibly multi-line) reply has arrived. */
  readReply(): Promise<SmtpReply>
  /** Renegotiate the existing socket as TLS after a 220 to STARTTLS. */
  startTls(): Promise<void>
  close(): Promise<void>
}

export interface SmtpConnectOptions {
  host: string
  port: number
  /** Implicit TLS from the first byte (port 465 style). */
  secure: boolean
  rejectUnauthorized: boolean
}

export type SmtpConnectionFactory = (
  options: SmtpConnectOptions
) => Promise<SmtpConnection>

// ---------------------------------------------------------------------------
// Reply parsing
// ---------------------------------------------------------------------------

/**
 * An SMTP reply is complete when a line reads `NNN<space>...`. Continuation
 * lines use `NNN-...`. Returns the reply plus whatever is left in the buffer.
 */
export function takeReply(
  buffer: string
): { reply: SmtpReply; rest: string } | null {
  const lines: string[] = []
  let consumed = 0

  while (true) {
    const idx = buffer.indexOf(CRLF, consumed)
    if (idx === -1) return null

    const line = buffer.slice(consumed, idx)
    consumed = idx + CRLF.length
    lines.push(line)

    const match = /^(\d{3})([ -])?(.*)$/.exec(line)
    if (!match) {
      throw new EmailSendError('smtp', `Malformed SMTP reply line: ${JSON.stringify(line)}`)
    }
    if (match[2] !== '-') {
      return {
        reply: {
          code: Number(match[1]),
          lines: lines.map((l) => l.slice(4)),
        },
        rest: buffer.slice(consumed),
      }
    }
  }
}

// ---------------------------------------------------------------------------
// MIME construction
// ---------------------------------------------------------------------------

function needsEncoding(value: string): boolean {
  return /[^\x20-\x7e]/.test(value)
}

/**
 * RFC 2047 encoded-word for header values that are not pure US-ASCII.
 * Values are already free of CR/LF (rejected in `toAddress`, stripped here for
 * subjects, which are caller-supplied).
 */
export function encodeHeaderValue(value: string): string {
  const flat = value.replace(/[\r\n]+/g, ' ')
  if (!needsEncoding(flat)) return flat
  return `=?UTF-8?B?${Buffer.from(flat, 'utf8').toString('base64')}?=`
}

export function formatHeaderAddress(addr: EmailAddress): string {
  if (!addr.name) return `<${addr.address}>`
  const name = encodeHeaderValue(addr.name)
  // An encoded-word must not be quoted; a plain display name must be.
  const rendered = name.startsWith('=?')
    ? name
    : `"${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  return `${rendered} <${addr.address}>`
}

/** Wrap base64 at 76 characters, as RFC 2045 requires. */
export function wrapBase64(value: string): string {
  const compact = value.replace(/[\r\n\s]/g, '')
  const chunks: string[] = []
  for (let i = 0; i < compact.length; i += 76) {
    chunks.push(compact.slice(i, i + 76))
  }
  return chunks.join(CRLF)
}

/**
 * RFC 5321 transparency: a line consisting of a single `.` terminates DATA,
 * so any body line starting with `.` gets an extra one. Base64 bodies cannot
 * produce such a line, but headers are caller-influenced, so do it anyway.
 */
export function dotStuff(data: string): string {
  return data.replace(/^\./gm, '..')
}

export interface MimeBuildOptions {
  messageId: string
  date: string
  boundary: string
}

export function buildMimeMessage(
  message: EmailMessage,
  options: MimeBuildOptions
): string {
  const from = toAddress(message.from)
  const to = toAddressList(message.to)
  const cc = toAddressList(message.cc)
  const replyTo = toAddressList(message.replyTo)

  const headers: string[] = [
    `From: ${formatHeaderAddress(from)}`,
    `To: ${to.map(formatHeaderAddress).join(', ')}`,
  ]
  if (cc.length > 0) headers.push(`Cc: ${cc.map(formatHeaderAddress).join(', ')}`)
  if (replyTo.length > 0) {
    headers.push(`Reply-To: ${replyTo.map(formatHeaderAddress).join(', ')}`)
  }
  // Bcc is deliberately absent: blind recipients travel in the envelope only.
  headers.push(`Subject: ${encodeHeaderValue(message.subject)}`)
  headers.push(`Date: ${options.date}`)
  headers.push(`Message-ID: <${options.messageId}>`)
  headers.push('MIME-Version: 1.0')

  const htmlPart =
    'Content-Type: text/html; charset=utf-8' +
    CRLF +
    'Content-Transfer-Encoding: base64' +
    CRLF +
    CRLF +
    wrapBase64(Buffer.from(message.html, 'utf8').toString('base64'))

  const attachments = message.attachments ?? []

  if (attachments.length === 0) {
    return headers.join(CRLF) + CRLF + htmlPart
  }

  const parts: string[] = [`--${options.boundary}${CRLF}${htmlPart}`]

  for (const att of attachments) {
    const filename = encodeHeaderValue(att.filename).replace(/"/g, '')
    parts.push(
      `--${options.boundary}` +
        CRLF +
        `Content-Type: ${att.contentType.replace(/[\r\n]+/g, '')}; name="${filename}"` +
        CRLF +
        'Content-Transfer-Encoding: base64' +
        CRLF +
        `Content-Disposition: attachment; filename="${filename}"` +
        CRLF +
        CRLF +
        wrapBase64(att.content)
    )
  }

  parts.push(`--${options.boundary}--`)

  headers.push(`Content-Type: multipart/mixed; boundary="${options.boundary}"`)

  return headers.join(CRLF) + CRLF + CRLF + parts.join(CRLF)
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export interface SmtpSessionParams {
  clientName: string
  user?: string
  password?: string
  /** Refuse to send in the clear when the server offers no STARTTLS. */
  requireTls: boolean
  /** True when the socket was already TLS from the first byte. */
  secure: boolean
  envelopeFrom: string
  envelopeTo: string[]
  data: string
}

function expect(reply: SmtpReply, codes: number[], step: string): SmtpReply {
  if (!codes.includes(reply.code)) {
    throw new EmailSendError(
      'smtp',
      `SMTP server refused ${step}: ${reply.code} ${reply.lines.join(' ')}`,
      reply.code
    )
  }
  return reply
}

function capabilities(reply: SmtpReply): string[] {
  // First line of an EHLO reply is the greeting, the rest are capabilities.
  return reply.lines.slice(1).map((l) => l.trim().toUpperCase())
}

function authMechanisms(caps: string[]): string[] {
  const line = caps.find((c) => c === 'AUTH' || c.startsWith('AUTH '))
  if (!line) return []
  return line.slice(4).trim().split(/\s+/).filter(Boolean)
}

/**
 * Drive one complete SMTP delivery over an already-open connection.
 * Pure protocol — no sockets, no env. Unit-tested against a fake connection.
 */
export async function runSmtpSession(
  conn: SmtpConnection,
  params: SmtpSessionParams
): Promise<void> {
  expect(await conn.readReply(), [220], 'the connection greeting')

  await conn.writeLine(`EHLO ${params.clientName}`)
  let ehlo = await conn.readReply()
  if (ehlo.code !== 250) {
    // Pre-ESMTP server. HELO gives no capabilities, so no STARTTLS and no AUTH.
    await conn.writeLine(`HELO ${params.clientName}`)
    expect(await conn.readReply(), [250], 'HELO')
    ehlo = { code: 250, lines: [''] }
  }

  let caps = capabilities(ehlo)
  let encrypted = params.secure

  if (!encrypted && caps.includes('STARTTLS')) {
    await conn.writeLine('STARTTLS')
    expect(await conn.readReply(), [220], 'STARTTLS')
    await conn.startTls()
    encrypted = true

    // RFC 3207: the client must re-issue EHLO over the new TLS session, and
    // must discard the capabilities learned in the clear.
    await conn.writeLine(`EHLO ${params.clientName}`)
    caps = capabilities(expect(await conn.readReply(), [250], 'EHLO after STARTTLS'))
  }

  if (!encrypted && params.requireTls) {
    throw new EmailConfigurationError(
      'The SMTP server did not offer STARTTLS and SMTP_SECURE is not enabled, so ' +
        'credentials and message bodies would cross the network in plaintext. ' +
        'Point SMTP_HOST at a TLS-capable server, or set SMTP_ALLOW_INSECURE=true ' +
        'if this is a local mail catcher.'
    )
  }

  if (params.user && params.password) {
    const mechs = authMechanisms(caps)
    if (mechs.includes('PLAIN') || mechs.length === 0) {
      const token = Buffer.from(`\0${params.user}\0${params.password}`, 'utf8').toString('base64')
      await conn.writeLine(`AUTH PLAIN ${token}`)
      expect(await conn.readReply(), [235], 'AUTH PLAIN')
    } else if (mechs.includes('LOGIN')) {
      await conn.writeLine('AUTH LOGIN')
      expect(await conn.readReply(), [334], 'AUTH LOGIN')
      await conn.writeLine(Buffer.from(params.user, 'utf8').toString('base64'))
      expect(await conn.readReply(), [334], 'the AUTH LOGIN username')
      await conn.writeLine(Buffer.from(params.password, 'utf8').toString('base64'))
      expect(await conn.readReply(), [235], 'the AUTH LOGIN password')
    } else {
      throw new EmailConfigurationError(
        `SMTP_USER is set but the server advertises no supported AUTH mechanism ` +
          `(offered: ${mechs.join(', ') || 'none'}; supported: PLAIN, LOGIN).`
      )
    }
  }

  await conn.writeLine(`MAIL FROM:<${params.envelopeFrom}>`)
  expect(await conn.readReply(), [250], `MAIL FROM:<${params.envelopeFrom}>`)

  for (const rcpt of params.envelopeTo) {
    await conn.writeLine(`RCPT TO:<${rcpt}>`)
    expect(await conn.readReply(), [250, 251], `RCPT TO:<${rcpt}>`)
  }

  await conn.writeLine('DATA')
  expect(await conn.readReply(), [354], 'DATA')

  await conn.write(dotStuff(params.data) + CRLF + '.' + CRLF)
  expect(await conn.readReply(), [250], 'the message body')

  await conn.writeLine('QUIT')
  // A server that drops the socket instead of answering QUIT has still
  // accepted the message at this point; do not turn that into a send failure.
  await conn.readReply().catch(() => undefined)
}

// ---------------------------------------------------------------------------
// Real socket implementation
// ---------------------------------------------------------------------------

/**
 * Open a real TCP/TLS connection. Loaded lazily so unit tests that inject a
 * fake connection never pull `node:net` or `node:tls` into the module graph.
 */
export const nodeSmtpConnectionFactory: SmtpConnectionFactory = async (options) => {
  const net = await import('node:net')
  const tls = await import('node:tls')

  let buffer = ''
  let fatal: Error | null = null
  let pending: {
    resolve: (reply: SmtpReply) => void
    reject: (err: Error) => void
  } | null = null

  const drain = () => {
    if (!pending) return
    if (fatal) {
      const waiter = pending
      pending = null
      waiter.reject(fatal)
      return
    }
    let taken: { reply: SmtpReply; rest: string } | null
    try {
      taken = takeReply(buffer)
    } catch (err) {
      const waiter = pending
      pending = null
      waiter.reject(err as Error)
      return
    }
    if (!taken) return
    buffer = taken.rest
    const waiter = pending
    pending = null
    waiter.resolve(taken.reply)
  }

  const fail = (err: Error) => {
    fatal = err
    drain()
  }

  type Socket = import('node:net').Socket

  const waitForConnect = (s: Socket, event: 'connect' | 'secureConnect') =>
    new Promise<Socket>((resolve, reject) => {
      const onError = (err: Error) => reject(err)
      s.once('error', onError)
      s.once(event, () => {
        s.removeListener('error', onError)
        resolve(s)
      })
    })

  let socket: Socket = options.secure
    ? await waitForConnect(
        tls.connect({
          host: options.host,
          port: options.port,
          servername: options.host,
          rejectUnauthorized: options.rejectUnauthorized,
        }),
        'secureConnect'
      )
    : await waitForConnect(
        net.connect({ host: options.host, port: options.port }),
        'connect'
      )

  const attach = (s: Socket) => {
    s.setEncoding('utf8')
    s.on('data', (chunk: string | Buffer) => {
      buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      drain()
    })
    s.on('error', (err: Error) => fail(err))
    s.on('close', () => fail(new EmailSendError('smtp', 'SMTP connection closed unexpectedly.')))
  }

  attach(socket)

  const write = (data: string) =>
    new Promise<void>((resolve, reject) => {
      socket.write(data, (err) => (err ? reject(err) : resolve()))
    })

  return {
    write,
    writeLine: (line: string) => write(line + CRLF),
    readReply() {
      return new Promise<SmtpReply>((resolve, reject) => {
        pending = { resolve, reject }
        drain()
      })
    },
    async startTls() {
      const plain = socket
      plain.removeAllListeners('data')
      plain.removeAllListeners('error')
      plain.removeAllListeners('close')
      fatal = null

      socket = await waitForConnect(
        tls.connect({
          socket: plain,
          servername: options.host,
          rejectUnauthorized: options.rejectUnauthorized,
        }),
        'secureConnect'
      )
      buffer = ''
      attach(socket)
    },
    async close() {
      socket.removeAllListeners('close')
      socket.destroy()
    },
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface SmtpProviderConfig {
  host: string
  port: number
  secure: boolean
  user?: string
  password?: string
  requireTls: boolean
  rejectUnauthorized?: boolean
  clientName?: string
  connect?: SmtpConnectionFactory
  now?: () => Date
  randomId?: () => string
}

function boolFromEnv(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback
  const value = raw.trim().toLowerCase()
  if (value === '') return fallback
  return value === '1' || value === 'true' || value === 'yes'
}

export function smtpConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): SmtpProviderConfig {
  const host = env.SMTP_HOST?.trim()
  if (!host) {
    throw new EmailConfigurationError(
      'EMAIL_PROVIDER is "smtp" but SMTP_HOST is not set. ' +
        'Set SMTP_HOST, and SMTP_PORT (default 587), SMTP_USER and SMTP_PASSWORD ' +
        'as your mail relay requires.'
    )
  }

  const rawPort = env.SMTP_PORT?.trim()
  const port = rawPort ? Number(rawPort) : 587
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new EmailConfigurationError(
      `SMTP_PORT must be a TCP port number; got ${JSON.stringify(rawPort)}.`
    )
  }

  const secure = boolFromEnv(env.SMTP_SECURE, port === 465)
  const user = env.SMTP_USER?.trim() || undefined
  const password = env.SMTP_PASSWORD || undefined

  if (user && !password) {
    throw new EmailConfigurationError('SMTP_USER is set but SMTP_PASSWORD is not.')
  }
  if (password && !user) {
    throw new EmailConfigurationError('SMTP_PASSWORD is set but SMTP_USER is not.')
  }

  return {
    host,
    port,
    secure,
    user,
    password,
    requireTls: !boolFromEnv(env.SMTP_ALLOW_INSECURE, false),
  }
}

export function createSmtpProvider(config: SmtpProviderConfig): EmailProvider {
  const connect = config.connect ?? nodeSmtpConnectionFactory
  const now = config.now ?? (() => new Date())
  const randomId =
    config.randomId ??
    (() => `${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 12)}`)

  return {
    name: 'smtp',
    async send(message: EmailMessage): Promise<EmailSendResult> {
      assertSendable(message)

      const from = toAddress(message.from)
      const envelopeTo = [
        ...toAddressList(message.to),
        ...toAddressList(message.cc),
        ...toAddressList(message.bcc),
      ].map((a) => a.address)

      const domain = from.address.split('@')[1] || config.host
      const messageId = `${randomId()}@${domain}`

      const data = buildMimeMessage(message, {
        messageId,
        date: now().toUTCString(),
        boundary: `----oas-${randomId()}`,
      })

      const conn = await connect({
        host: config.host,
        port: config.port,
        secure: config.secure,
        rejectUnauthorized: config.rejectUnauthorized ?? true,
      })

      try {
        await runSmtpSession(conn, {
          clientName: config.clientName || domain,
          user: config.user,
          password: config.password,
          requireTls: config.requireTls && !config.secure,
          secure: config.secure,
          envelopeFrom: from.address,
          envelopeTo,
          data,
        })
      } finally {
        await conn.close().catch(() => undefined)
      }

      return { provider: 'smtp', id: messageId }
    },
  }
}
