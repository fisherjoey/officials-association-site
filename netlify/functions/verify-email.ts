import { Handler } from '@netlify/functions'
import { getCorsHeaders, errorResponse } from './_shared/handler'
import { checkRateLimit, getClientIp } from './_shared/rateLimit'
import { createHmac } from 'crypto'
import { generateEmailTemplate } from '../../lib/emailTemplate'
import { sendEmail } from '../../lib/email'
import { validateEmail } from '../../lib/emailValidation'
import { EMAIL_NO_REPLY, ORG_NAME } from '../../lib/siteConfig'

const VERIFICATION_TTL_MS = 10 * 60 * 1000 // 10 minutes

function getHmacSecret(): string {
  // Prefer the dedicated secret; fall back to the MS client secret.
  // Refuse to run with an empty key — otherwise any attacker can
  // mint a valid token by computing hmac('', payload).
  const secret = process.env.EMAIL_VERIFY_SECRET || process.env.MICROSOFT_CLIENT_SECRET
  if (!secret) {
    throw new Error('EMAIL_VERIFY_SECRET (or MICROSOFT_CLIENT_SECRET fallback) must be set')
  }
  return secret
}

/**
 * Generate HMAC token containing email + code + expiry
 * This is stateless — no database needed
 */
function generateVerificationToken(email: string, code: string): string {
  const expiry = Date.now() + VERIFICATION_TTL_MS
  const payload = `${email.toLowerCase()}:${code}:${expiry}`
  const hmac = createHmac('sha256', getHmacSecret()).update(payload).digest('hex')
  // Encode as base64: payload + hmac
  return Buffer.from(`${payload}:${hmac}`).toString('base64')
}

/**
 * Verify HMAC token and code
 */
export function verifyEmailToken(token: string, email: string, code: string): { valid: boolean; reason?: string } {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8')
    const parts = decoded.split(':')
    if (parts.length !== 4) return { valid: false, reason: 'Invalid verification token' }

    const [tokenEmail, tokenCode, expiryStr, tokenHmac] = parts
    const expiry = parseInt(expiryStr, 10)

    // Check expiry
    if (Date.now() > expiry) {
      return { valid: false, reason: 'Verification code has expired. Please request a new one.' }
    }

    // Check email matches
    if (tokenEmail !== email.toLowerCase()) {
      return { valid: false, reason: 'Email address does not match the verified email.' }
    }

    // Check code matches
    if (tokenCode !== code) {
      return { valid: false, reason: 'Incorrect verification code.' }
    }

    // Verify HMAC
    const payload = `${tokenEmail}:${tokenCode}:${expiryStr}`
    const expectedHmac = createHmac('sha256', getHmacSecret()).update(payload).digest('hex')
    if (tokenHmac !== expectedHmac) {
      return { valid: false, reason: 'Invalid verification token.' }
    }

    return { valid: true }
  } catch {
    return { valid: false, reason: 'Invalid verification token.' }
  }
}

export const handler: Handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin
  const headers = {
    ...getCorsHeaders(origin, ['POST']),
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  // Rate limit: 5 verification requests per minute per IP
  const clientIp = getClientIp(event.headers)
  if (checkRateLimit(clientIp, { maxRequests: 5, windowMs: 60_000, prefix: 'verify-email' })) {
    return errorResponse({ code: 'rate_limited', headers })
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse({ code: 'method_not_allowed', headers })
  }

  try {
    const { email, code: providedCode, token: providedToken } = JSON.parse(event.body || '{}')

    if (!email) {
      return errorResponse({
        code: 'invalid_input',
        headers,
        message: 'Please enter your email address.',
        fields: { email: 'Email is required' },
      })
    }

    // Verification mode: caller has a token and a 6-digit code, wants
    // to know if they match. Used by the ContactForm to confirm the
    // code server-side before showing a "verified" UI state.
    if (providedCode && providedToken) {
      const result = verifyEmailToken(providedToken, email, providedCode)
      if (result.valid) {
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, valid: true }) }
      }
      return errorResponse({
        code: 'verification_failed',
        headers,
        message: result.reason || 'That code didn’t match. Please check the email and try again.',
        extra: { success: false, valid: false },
      })
    }

    // Validate the email first (MX check, disposable blocking)
    const emailValidation = await validateEmail(email)
    if (!emailValidation.valid) {
      return errorResponse({
        code: 'email_unavailable',
        headers,
        message: emailValidation.suggestion
          ? `That email address looks invalid. Did you mean ${emailValidation.suggestion}?`
          : 'That email address looks invalid. Please double-check and try again.',
        fields: { email: emailValidation.reason || 'Invalid email address' },
        extra: emailValidation.suggestion ? { suggestion: emailValidation.suggestion } : undefined,
      })
    }

    // Generate 6-digit code
    const code = String(Math.floor(100000 + Math.random() * 900000))
    const token = generateVerificationToken(email, code)

    // Build verification email
    const emailContent = `
      <h1>Your Verification Code</h1>
      <p>You requested a verification code to submit a message through the ${ORG_NAME} contact form.</p>
      <div style="text-align: center; margin: 30px 0;">
        <div style="display: inline-block; background-color: #f3f4f6; border: 2px solid #d1d5db; border-radius: 12px; padding: 20px 40px;">
          <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #111827; font-family: monospace;">${code}</span>
        </div>
      </div>
      <p style="color: #6b7280; font-size: 14px;">This code expires in 10 minutes. If you did not request this code, you can safely ignore this email.</p>
    `

    const emailHtml = generateEmailTemplate({
      subject: 'Your Verification Code',
      content: emailContent,
      previewText: `Your verification code is ${code}`,
      external: true,
    })

    await sendEmail({
      from: EMAIL_NO_REPLY,
      to: email,
      subject: `${ORG_NAME} - Verification Code`,
      html: emailHtml,
      // Keep one-time codes out of the shared no-reply mailbox's Sent Items.
      providerOptions: { graph: { saveToSentItems: false } },
    })

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, token }),
    }
  } catch (error) {
    console.error('[VerifyEmail] Error:', error)
    return errorResponse({
      code: 'service_unavailable',
      headers,
      message: 'We couldn’t send a verification email right now. Please try again in a few minutes.',
    })
  }
}
