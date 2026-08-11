import { Handler } from '@netlify/functions'
import { supabase as supabaseAdmin, getCorsHeaders, errorResponse } from './_shared/handler'
import { checkRateLimit, getClientIp } from './_shared/rateLimit'
import { Logger } from '../../lib/logger'
import { recordPasswordResetEmail } from '../../lib/emailHistory'
import { checkEmailConfiguration, sendEmail } from '../../lib/email'
import {
  EMAIL_NO_REPLY,
  ORG_NAME,
  ORG_SHORT_NAME,
  ORG_TAGLINE,
  ORG_LOCATION,
  ORG_LOGO_URL,
  SITE_URL,
  getContactUrl,
  getPortalUrl,
  getCopyrightYear,
  getAuthCallbackUrl,
  EMAIL_SUBJECTS,
} from '../../lib/siteConfig'

const siteUrl = SITE_URL

// Generate password reset email HTML
function generatePasswordResetEmailHtml(resetUrl: string, email: string): string {
  return `
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <tr>
    <td style="padding: 20px 10px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; width: 100%; margin: 0 auto; background-color: #ffffff;" align="center">
        <tr>
          <td style="background-color: #1f2937; padding: 24px 20px; border-bottom: 3px solid #F97316; text-align: center;">
            <img src="${ORG_LOGO_URL}" alt="Logo" style="max-width: 70px; height: auto; display: inline-block; margin-bottom: 12px;">
            <h1 style="color: #ffffff; margin: 0 0 4px 0; font-size: 18px; font-weight: 700;">${ORG_NAME}</h1>
            <p style="color: #ffffff; margin: 0; font-size: 14px; opacity: 0.95;">${ORG_TAGLINE}</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 30px 20px; color: #333333; font-size: 16px; line-height: 1.6;">
            <h1 style="color: #003DA5; font-size: 24px; margin-top: 0; margin-bottom: 16px; font-weight: 700;">Reset Your Password</h1>
            <p style="margin: 0 0 16px 0;">We received a request to reset the password for your <strong style="color: #003DA5;">${ORG_SHORT_NAME} Member Portal</strong> account associated with <strong style="color: #003DA5;">${email}</strong>.</p>
            <p style="margin: 0 0 16px 0;">Click the button below to set a new password:</p>
            <p style="text-align: center; margin: 24px 0;">
              <a href="${resetUrl}" style="display: inline-block; padding: 14px 28px; background-color: #F97316; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Reset Password</a>
            </p>
            <p style="margin: 0 0 16px 0;">This link will expire in 24 hours for security purposes.</p>
            <div style="background-color: #FEF3C7; border-left: 4px solid #F59E0B; padding: 12px 16px; margin: 16px 0;">
              <p style="margin: 0; font-size: 14px; color: #92400E;"><strong>Security Notice:</strong> If you didn't request a password reset, please ignore this email.</p>
            </div>
            <p style="margin: 0 0 16px 0; font-size: 14px; color: #6b7280;">If the button doesn't work, copy this link: ${resetUrl}</p>
            <p style="margin: 0;">Best regards,<br><strong style="color: #003DA5;">${ORG_SHORT_NAME} Executive Board</strong></p>
          </td>
        </tr>
        <tr>
          <td style="background-color: #1F2937; color: #D1D5DB; padding: 30px 20px; text-align: center; font-size: 14px; border-top: 3px solid #F97316;">
            <p style="margin: 0 0 10px 0; font-weight: 600; color: #ffffff;">${ORG_NAME}</p>
            <p style="margin: 0 0 15px 0;">${ORG_LOCATION}</p>
            <p style="margin: 0; font-size: 13px; color: #9ca3af;">&copy; ${getCopyrightYear()} ${ORG_SHORT_NAME}. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
  `.trim()
}

export const handler: Handler = async (event) => {
  const logger = Logger.fromEvent('auth-password-reset', event)

  const origin = event.headers.origin || event.headers.Origin
  const headers = getCorsHeaders(origin, ['POST'])

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  // Rate limit: 3 reset requests per minute per IP
  const clientIp = getClientIp(event.headers)
  if (checkRateLimit(clientIp, { maxRequests: 3, windowMs: 60_000, prefix: 'pwd-reset' })) {
    return errorResponse({ code: 'rate_limited', headers })
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse({ code: 'method_not_allowed', headers })
  }

  try {
    const { email } = JSON.parse(event.body || '{}')
    logger.info('auth', 'password_reset_request', `Password reset requested for ${email}`, {
      metadata: { email }
    })

    if (!email) {
      return errorResponse({
        code: 'invalid_input',
        headers,
        message: 'Please enter your email address.',
        fields: { email: 'Email is required' },
      })
    }

    // Check the transactional email provider is configured before doing any
    // work. Without this a misconfigured deployment 500s after the reset link
    // has already been generated.
    const emailConfig = checkEmailConfiguration()
    if (!emailConfig.configured) {
      logger.error('auth', 'password_reset_config_error', emailConfig.error)
      return errorResponse({ code: 'service_unavailable', headers })
    }

    // Check if user exists
    // Need to paginate through all users since listUsers has a default limit
    let allUsers: any[] = []
    let page = 1
    const perPage = 1000
    while (true) {
      const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage
      })
      if (error || !users || users.length === 0) break
      allUsers = allUsers.concat(users)
      if (users.length < perPage) break
      page++
    }
    const user = allUsers.find(u => u.email?.toLowerCase() === email.toLowerCase())

    if (!user) {
      // Don't reveal if user exists or not - return success anyway
      logger.info('auth', 'password_reset_no_user', `Password reset request for non-existent user`, {
        metadata: { email }
      })
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'If an account exists, a reset email will be sent.' })
      }
    }

    // Generate password reset link
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: getAuthCallbackUrl()
      }
    })

    if (linkError) {
      logger.error('auth', 'password_reset_link_failed', `Failed to generate reset link for ${email}`, new Error(linkError.message))
      // The user has been confirmed to exist by this point, so the
      // user-existence enumeration concern is already handled above.
      // Surface the failure loudly so the UI can show a real error.
      return errorResponse({
        code: 'service_unavailable',
        headers,
        message: 'We couldn’t send a reset email right now. Please try again in a few minutes.',
      })
    }

    // Send via the configured transactional email provider.
    const resetUrl = linkData.properties?.action_link || ''
    const emailHtml = generatePasswordResetEmailHtml(resetUrl, email)

    await sendEmail({
      from: EMAIL_NO_REPLY,
      to: email,
      subject: EMAIL_SUBJECTS.passwordReset,
      html: emailHtml,
    })

    // Record to email history
    await recordPasswordResetEmail({
      recipientEmail: email,
      htmlContent: emailHtml,
      sentByEmail: 'self-service',
      status: 'sent',
    })

    // Audit log
    await logger.audit('PASSWORD_RESET', 'auth_user', user.id, {
      actorId: user.id,
      actorEmail: email,
      targetUserEmail: email,
      description: `Password reset email sent to ${email}`
    })

    logger.info('auth', 'password_reset_success', `Password reset email sent to ${email}`, {
      metadata: { email, userId: user.id }
    })

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: 'Password reset email sent.' })
    }

  } catch (error) {
    logger.error('auth', 'password_reset_error', 'Password reset error', error instanceof Error ? error : new Error(String(error)))
    return errorResponse({ code: 'server_error', headers })
  }
}
