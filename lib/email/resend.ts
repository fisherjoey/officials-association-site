/**
 * Resend adapter — the default transport.
 *
 * Chosen as the default because it is the shortest path from "cloned this
 * template" to "password reset works": sign up, verify a domain, paste one
 * API key. No dependency is needed — Resend's send endpoint is plain JSON
 * over HTTPS, so `fetch` covers it.
 *
 * API reference: POST https://api.resend.com/emails
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

export const RESEND_DEFAULT_API_URL = 'https://api.resend.com'

export interface ResendProviderConfig {
  apiKey: string
  /** Override for tests and self-hosted proxies. */
  apiUrl?: string
  /** Injected in tests so no unit test can reach the network. */
  fetchImpl?: typeof fetch
}

/** RFC 5322 `Display Name <mailbox>` form, which Resend parses. */
function formatAddress(addr: EmailAddress): string {
  if (!addr.name) return addr.address
  // Quote the display name and escape embedded quotes/backslashes. CR/LF were
  // already rejected by toAddress().
  const escaped = addr.name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `"${escaped}" <${addr.address}>`
}

function formatList(addrs: EmailAddress[]): string[] {
  return addrs.map(formatAddress)
}

export function resendConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): ResendProviderConfig {
  const apiKey = env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    throw new EmailConfigurationError(
      'EMAIL_PROVIDER is "resend" but RESEND_API_KEY is not set. ' +
        'Create an API key at https://resend.com/api-keys, verify the sending domain, ' +
        'and set RESEND_API_KEY in the deploy environment.'
    )
  }
  const apiUrl = env.RESEND_API_URL?.trim() || RESEND_DEFAULT_API_URL
  return { apiKey, apiUrl }
}

/**
 * Build the JSON body Resend expects. Exported so a test can assert the wire
 * shape (notably that `bcc` stays `bcc`) without stubbing `fetch`.
 */
export function buildResendPayload(message: EmailMessage): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    from: formatAddress(toAddress(message.from)),
    to: formatList(toAddressList(message.to)),
    subject: message.subject,
    html: message.html,
  }

  const cc = formatList(toAddressList(message.cc))
  if (cc.length > 0) payload.cc = cc

  const bcc = formatList(toAddressList(message.bcc))
  if (bcc.length > 0) payload.bcc = bcc

  const replyTo = formatList(toAddressList(message.replyTo))
  if (replyTo.length > 0) {
    // Resend's REST field is snake_case; the newer SDK accepts both.
    payload.reply_to = replyTo
  }

  if (message.attachments && message.attachments.length > 0) {
    payload.attachments = message.attachments.map((att) => ({
      filename: att.filename,
      content: att.content,
      content_type: att.contentType,
    }))
  }

  return payload
}

export function createResendProvider(config: ResendProviderConfig): EmailProvider {
  const apiUrl = (config.apiUrl || RESEND_DEFAULT_API_URL).replace(/\/+$/, '')
  const doFetch = config.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args))

  return {
    name: 'resend',
    async send(message: EmailMessage): Promise<EmailSendResult> {
      assertSendable(message)

      const response = await doFetch(`${apiUrl}/emails`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildResendPayload(message)),
      })

      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new EmailSendError(
          'resend',
          `Resend rejected the send (HTTP ${response.status})${detail ? `: ${detail}` : ''}`,
          response.status
        )
      }

      const body = (await response.json().catch(() => null)) as { id?: string } | null
      return { provider: 'resend', id: body?.id }
    },
  }
}
