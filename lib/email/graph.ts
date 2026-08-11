/**
 * Microsoft Graph adapter.
 *
 * This is the transport this codebase used exclusively before PLAT-25: an
 * Azure app registration, a client-credentials token from
 * `login.microsoftonline.com`, and `POST /users/{sender}/sendMail`. It is
 * preserved verbatim as one adapter among three so an existing Microsoft 365
 * deployment keeps working, while a new adopter is no longer forced to stand
 * up a tenant before password reset functions at all.
 *
 * The sender mailbox is taken from the message's `from` address, exactly as
 * each call site used to compute it for itself. The Azure app registration
 * must hold `Mail.Send` application permission for that mailbox.
 */

import {
  allRecipients,
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

export const GRAPH_DEFAULT_LOGIN_URL = 'https://login.microsoftonline.com'
export const GRAPH_DEFAULT_API_URL = 'https://graph.microsoft.com/v1.0'

export interface GraphProviderConfig {
  tenantId: string
  clientId: string
  clientSecret: string
  /** Overrides exist for tests; production should leave them unset. */
  loginUrl?: string
  apiUrl?: string
  fetchImpl?: typeof fetch
  now?: () => number
}

function graphRecipient(addr: EmailAddress) {
  return {
    emailAddress: addr.name
      ? { name: addr.name, address: addr.address }
      : { address: addr.address },
  }
}

export function graphConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): GraphProviderConfig {
  const tenantId = env.MICROSOFT_TENANT_ID?.trim()
  const clientId = env.MICROSOFT_CLIENT_ID?.trim()
  const clientSecret = env.MICROSOFT_CLIENT_SECRET?.trim()

  const missing = [
    ['MICROSOFT_TENANT_ID', tenantId],
    ['MICROSOFT_CLIENT_ID', clientId],
    ['MICROSOFT_CLIENT_SECRET', clientSecret],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name)

  if (missing.length > 0) {
    throw new EmailConfigurationError(
      `EMAIL_PROVIDER is "graph" but ${missing.join(', ')} ` +
        `${missing.length === 1 ? 'is' : 'are'} not set. ` +
        'Register an application in Microsoft Entra ID, grant it the Mail.Send ' +
        'application permission, and set MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID ' +
        'and MICROSOFT_CLIENT_SECRET in the deploy environment.'
    )
  }

  return {
    tenantId: tenantId as string,
    clientId: clientId as string,
    clientSecret: clientSecret as string,
  }
}

/**
 * Build the Graph `sendMail` request body. Exported so a test can assert the
 * wire shape — in particular that bulk recipients stay in `bccRecipients`.
 */
export function buildGraphPayload(message: EmailMessage): Record<string, unknown> {
  const from = toAddress(message.from)

  const body: Record<string, unknown> = {
    subject: message.subject,
    body: { contentType: 'HTML', content: message.html },
    from: graphRecipient(from),
    toRecipients: toAddressList(message.to).map(graphRecipient),
  }

  const cc = toAddressList(message.cc)
  if (cc.length > 0) body.ccRecipients = cc.map(graphRecipient)

  const bcc = toAddressList(message.bcc)
  if (bcc.length > 0) body.bccRecipients = bcc.map(graphRecipient)

  const replyTo = toAddressList(message.replyTo)
  if (replyTo.length > 0) body.replyTo = replyTo.map(graphRecipient)

  if (message.attachments && message.attachments.length > 0) {
    body.attachments = message.attachments.map((att) => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: att.filename,
      contentType: att.contentType,
      contentBytes: att.content,
    }))
  }

  return {
    message: body,
    saveToSentItems: message.providerOptions?.graph?.saveToSentItems ?? true,
  }
}

export function createGraphProvider(config: GraphProviderConfig): EmailProvider {
  const loginUrl = (config.loginUrl || GRAPH_DEFAULT_LOGIN_URL).replace(/\/+$/, '')
  const apiUrl = (config.apiUrl || GRAPH_DEFAULT_API_URL).replace(/\/+$/, '')
  const doFetch = config.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const now = config.now ?? (() => Date.now())

  // Cached only for the lifetime of this provider instance. A Netlify
  // function container that sends four messages in one invocation (osa-webhook
  // does) previously fetched one token and reused it; without this the
  // refactor would have quadrupled the token calls.
  let cachedToken: { value: string; expiresAt: number } | null = null

  async function getAccessToken(): Promise<string> {
    if (cachedToken && cachedToken.expiresAt > now()) {
      return cachedToken.value
    }

    const tokenEndpoint = `${loginUrl}/${config.tenantId}/oauth2/v2.0/token`
    const params = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    })

    const response = await doFetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new EmailSendError(
        'graph',
        `Failed to get Microsoft access token (HTTP ${response.status})${detail ? `: ${detail}` : ''}`,
        response.status
      )
    }

    const data = (await response.json()) as { access_token?: string; expires_in?: number }
    if (!data?.access_token) {
      throw new EmailSendError('graph', 'Microsoft token endpoint returned no access_token.')
    }

    // Retire the token a minute early so an in-flight send never races expiry.
    const ttlSeconds = typeof data.expires_in === 'number' ? data.expires_in : 3600
    cachedToken = {
      value: data.access_token,
      expiresAt: now() + Math.max(ttlSeconds - 60, 0) * 1000,
    }
    return cachedToken.value
  }

  return {
    name: 'graph',
    async send(message: EmailMessage): Promise<EmailSendResult> {
      assertSendable(message)

      const sender = toAddress(message.from).address
      const accessToken = await getAccessToken()

      const response = await doFetch(
        `${apiUrl}/users/${encodeURIComponent(sender)}/sendMail`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(buildGraphPayload(message)),
        }
      )

      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        const to = allRecipients(message)
          .map((a) => a.address)
          .slice(0, 3)
          .join(', ')
        throw new EmailSendError(
          'graph',
          `Microsoft Graph rejected the send to ${to} (HTTP ${response.status})${detail ? `: ${detail}` : ''}`,
          response.status
        )
      }

      // Graph returns 202 Accepted with an empty body and no message id.
      return { provider: 'graph' }
    },
  }
}
