import { Handler } from '@netlify/functions'
import { supabase as supabaseAdmin, getCorsHeaders, getPrincipal, listAllAuthUsers, findAuthUserByEmail, errorResponse } from './_shared/handler'
import { checkRateLimit, getClientIp } from './_shared/rateLimit'
import { DEFAULT_STRUCTURAL_ROLE, hasRole, principalFromMemberRow } from '../../lib/roles'
import { randomBytes } from 'crypto'
import { Logger } from '../../lib/logger'
import { recordInviteEmail, recordPasswordResetEmail } from '../../lib/emailHistory'
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
  PORTAL_FEATURES,
} from '../../lib/siteConfig'

const siteUrl = SITE_URL

// ============================================================================
// Invite Token Helpers (Proxy system - tokens never expire)
// ============================================================================

function generateSecureToken(): string {
  return randomBytes(32).toString('hex') // 64 character hex string
}

async function createInviteToken(
  email: string,
  name?: string,
  role?: string,
  createdBy?: string
): Promise<string> {
  const token = generateSecureToken()

  // Delete any existing unused tokens for this email
  await supabaseAdmin
    .from('invite_tokens')
    .delete()
    .eq('email', email.toLowerCase())
    .is('used_at', null)

  // Create new token
  const { error } = await supabaseAdmin
    .from('invite_tokens')
    .insert({
      token,
      email: email.toLowerCase(),
      name,
      role: role || DEFAULT_STRUCTURAL_ROLE,
      created_by: createdBy
    })

  if (error) {
    throw new Error(`Failed to create invite token: ${error.message}`)
  }

  return token
}

function getInviteUrl(token: string): string {
  return `${siteUrl}/accept-invite?token=${token}`
}

export interface AuthUser {
  id: string
  email: string
  name?: string
  confirmed: boolean
  confirmed_at?: string
  invited_at?: string
  created_at?: string
  /**
   * Rung from the roster row, absent when the account has no row. This used to
   * be `app_metadata.role || user_metadata.role`; both are now ignored by the
   * gate, so reporting either would describe a privilege nobody has.
   */
  role?: string
  capabilities?: string[]
}

/**
 * Roster rungs for a batch of auth users, in one query. `user_id` is unique on
 * `members`, so the map is one row per id at most and an absent id means the
 * account has never been put on the roster.
 */
async function readRoster(
  userIds: string[]
): Promise<Map<string, { role: string | null; capabilities: string[] }>> {
  const out = new Map<string, { role: string | null; capabilities: string[] }>()
  if (userIds.length === 0) return out

  const { data, error } = await supabaseAdmin
    .from('members')
    .select('user_id, role, capabilities')
    .in('user_id', userIds)

  if (error) throw new Error(`Failed to read roster roles: ${error.message}`)

  for (const row of data ?? []) {
    const principal = principalFromMemberRow(row)
    out.set(row.user_id, {
      role: principal.role,
      capabilities: [...principal.capabilities],
    })
  }
  return out
}

// ============================================================================
// Microsoft Graph Email Integration
// ============================================================================

function generateInviteEmailHtml(inviteUrl: string, name?: string): string {
  // Note: We no longer show expiration since proxy tokens don't expire
  return `
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <tr>
    <td style="padding: 20px 10px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; width: 100%; margin: 0 auto; background-color: #ffffff;" align="center">
        <!-- Header -->
        <tr>
          <td style="background-color: #1f2937; padding: 24px 20px; border-bottom: 3px solid #F97316; text-align: center;">
            <img src="${ORG_LOGO_URL}" alt="Logo" style="max-width: 70px; height: auto; display: inline-block; margin-bottom: 12px;">
            <h1 style="color: #ffffff; margin: 0 0 4px 0; font-size: 18px; font-weight: 700; letter-spacing: -0.5px; line-height: 1.3;">${ORG_NAME}</h1>
            <p style="color: #ffffff; margin: 0; font-size: 14px; font-weight: 500; opacity: 0.95;">${ORG_TAGLINE}</p>
          </td>
        </tr>
        <!-- Main Content -->
        <tr>
          <td style="padding: 30px 20px; color: #333333; font-size: 16px; line-height: 1.6;">
            <h1 style="color: #003DA5; font-size: 24px; margin-top: 0; margin-bottom: 16px; font-weight: 700; line-height: 1.3;">${EMAIL_SUBJECTS.invite.replace('!', '')}!</h1>
            <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.6;">${name ? `Hi ${name},` : 'Hello,'}</p>
            <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.6;">You have been invited to create an account on the <strong style="color: #003DA5; font-weight: 600;">${ORG_NAME}</strong> member portal.</p>
            <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.6;">As a member, you'll have access to:</p>
            <ul style="margin: 0 0 16px 0; padding-left: 20px;">
              <li style="margin-bottom: 8px; font-size: 16px; line-height: 1.5;"><strong style="color: #003DA5;">${PORTAL_FEATURES.resources}</strong> - ${PORTAL_FEATURES.resourcesDescription}</li>
              <li style="margin-bottom: 8px; font-size: 16px; line-height: 1.5;"><strong style="color: #003DA5;">${PORTAL_FEATURES.newsletter}</strong> - ${PORTAL_FEATURES.newsletterDescription}</li>
              <li style="margin-bottom: 8px; font-size: 16px; line-height: 1.5;"><strong style="color: #003DA5;">${PORTAL_FEATURES.calendar}</strong> - ${PORTAL_FEATURES.calendarDescription}</li>
              <li style="margin-bottom: 8px; font-size: 16px; line-height: 1.5;"><strong style="color: #003DA5;">${PORTAL_FEATURES.ruleModifications}</strong> - ${PORTAL_FEATURES.ruleModificationsDescription}</li>
            </ul>
            <p style="text-align: center; margin: 24px 0;">
              <a href="${inviteUrl}" style="display: inline-block; padding: 14px 28px; min-height: 44px; background-color: #F97316; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Accept Invitation</a>
            </p>
            <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.6;">If you have any questions about your membership, please don't hesitate to <a href="${getContactUrl('membership')}" style="color: #F97316;">contact us</a>.</p>
            <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.6;">We look forward to having you on our team!</p>
            <p style="margin: 0; font-size: 16px; line-height: 1.6;">Best regards,<br><strong style="color: #003DA5; font-weight: 600;">${ORG_SHORT_NAME} Executive Board</strong></p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background-color: #1F2937; color: #D1D5DB; padding: 30px 20px; text-align: center; font-size: 14px; line-height: 1.7; border-top: 3px solid #F97316;">
            <p style="margin: 0 0 10px 0; font-weight: 600; color: #ffffff;">${ORG_NAME}</p>
            <p style="margin: 0 0 15px 0;">${ORG_LOCATION}</p>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 20px auto;">
              <tr>
                <td style="padding: 0 8px;"><a href="${siteUrl}" style="color: #F97316; text-decoration: none; font-size: 14px;">Website</a></td>
                <td style="padding: 0 8px;"><a href="${getPortalUrl()}" style="color: #F97316; text-decoration: none; font-size: 14px;">Member Portal</a></td>
                <td style="padding: 0 8px;"><a href="${getContactUrl('membership')}" style="color: #F97316; text-decoration: none; font-size: 14px;">Contact Us</a></td>
              </tr>
            </table>
            <p style="margin: 20px 0 0 0; font-size: 13px; color: #9ca3af;">&copy; ${getCopyrightYear()} ${ORG_NAME}. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
  `.trim()
}

function generatePasswordResetEmailHtml(resetUrl: string, email: string): string {
  return `
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <tr>
    <td style="padding: 20px 10px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; width: 100%; margin: 0 auto; background-color: #ffffff;" align="center">
        <!-- Header -->
        <tr>
          <td style="background-color: #1f2937; padding: 24px 20px; border-bottom: 3px solid #F97316; text-align: center;">
            <img src="${ORG_LOGO_URL}" alt="Logo" style="max-width: 70px; height: auto; display: inline-block; margin-bottom: 12px;">
            <h1 style="color: #ffffff; margin: 0 0 4px 0; font-size: 18px; font-weight: 700; letter-spacing: -0.5px; line-height: 1.3;">${ORG_NAME}</h1>
            <p style="color: #ffffff; margin: 0; font-size: 14px; font-weight: 500; opacity: 0.95;">${ORG_TAGLINE}</p>
          </td>
        </tr>
        <!-- Main Content -->
        <tr>
          <td style="padding: 30px 20px; color: #333333; font-size: 16px; line-height: 1.6;">
            <h1 style="color: #003DA5; font-size: 24px; margin-top: 0; margin-bottom: 16px; font-weight: 700; line-height: 1.3;">Reset Your Password</h1>
            <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.6;">We received a request to reset the password for your <strong style="color: #003DA5; font-weight: 600;">${ORG_SHORT_NAME} Member Portal</strong> account associated with <strong style="color: #003DA5;">${email}</strong>.</p>
            <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.6;">Click the button below to set a new password:</p>
            <p style="text-align: center; margin: 24px 0;">
              <a href="${resetUrl}" style="display: inline-block; padding: 14px 28px; min-height: 44px; background-color: #F97316; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Reset Password</a>
            </p>
            <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.6;">This link will expire in 24 hours for security purposes.</p>
            <div style="background-color: #FEF3C7; border-left: 4px solid #F59E0B; padding: 12px 16px; margin: 16px 0;">
              <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #92400E;"><strong>Security Notice:</strong> If you didn't request a password reset, please ignore this email. Your password will remain unchanged.</p>
            </div>
            <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.6;">If you're having trouble with the button above, copy and paste this link into your browser:</p>
            <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; word-break: break-all; color: #6b7280;">${resetUrl}</p>
            <p style="margin: 0; font-size: 16px; line-height: 1.6;">Best regards,<br><strong style="color: #003DA5; font-weight: 600;">${ORG_SHORT_NAME} Executive Board</strong></p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background-color: #1F2937; color: #D1D5DB; padding: 30px 20px; text-align: center; font-size: 14px; line-height: 1.7; border-top: 3px solid #F97316;">
            <p style="margin: 0 0 10px 0; font-weight: 600; color: #ffffff;">${ORG_NAME}</p>
            <p style="margin: 0 0 15px 0;">${ORG_LOCATION}</p>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 20px auto;">
              <tr>
                <td style="padding: 0 8px;"><a href="${siteUrl}" style="color: #F97316; text-decoration: none; font-size: 14px;">Website</a></td>
                <td style="padding: 0 8px;"><a href="${getPortalUrl()}" style="color: #F97316; text-decoration: none; font-size: 14px;">Member Portal</a></td>
                <td style="padding: 0 8px;"><a href="${getContactUrl('membership')}" style="color: #F97316; text-decoration: none; font-size: 14px;">Contact Us</a></td>
              </tr>
            </table>
            <p style="margin: 20px 0 0 0; font-size: 13px; color: #9ca3af;">&copy; ${getCopyrightYear()} ${ORG_NAME}. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
  `.trim()
}

// ============================================================================
// Main Handler
// ============================================================================

export const handler: Handler = async (event) => {
  const logger = Logger.fromEvent('supabase-auth-admin', event)

  const origin = event.headers.origin || event.headers.Origin
  const headers = getCorsHeaders(origin, ['GET', 'POST', 'PUT', 'DELETE'])

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  // PUBLIC ENDPOINT: Self-service invite request (no auth required)
  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}')
      if (body.action === 'request_invite') {
        const { email } = body

        if (!email) {
          return errorResponse({
            code: 'invalid_input',
            headers,
            message: 'Please enter your email address.',
            fields: { email: 'Email is required' },
          })
        }

        // Rate limit: 3 requests per minute per IP. Without this the
        // endpoint can be used to email-bomb members and burn through
        // Microsoft Graph quota.
        const clientIp = getClientIp(event.headers)
        if (checkRateLimit(clientIp, { maxRequests: 3, windowMs: 60_000, prefix: 'request-invite' })) {
          return errorResponse({ code: 'rate_limited', headers })
        }

        const normalizedEmail = email.toLowerCase().trim()

        // Check if email exists in members table
        const { data: member, error: memberError } = await supabaseAdmin
          .from('members')
          .select('id, name, email, role, user_id, status')
          .eq('email', normalizedEmail)
          .single()

        if (memberError || !member) {
          // Don't reveal if email exists or not for security
          logger.info('auth', 'request_invite_not_found', `Invite request for non-member: ${normalizedEmail}`)
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              message: 'If your email is registered as a member, you will receive an invite shortly.'
            })
          }
        }

        if (member.status !== 'active') {
          logger.info('auth', 'request_invite_inactive', `Invite request for inactive member: ${normalizedEmail}`)
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              message: 'If your email is registered as a member, you will receive an invite shortly.'
            })
          }
        }

        // Check if user has already signed in
        if (member.user_id) {
          const { data: { user: authUser } } = await supabaseAdmin.auth.admin.getUserById(member.user_id)

          if (authUser?.last_sign_in_at) {
            logger.info('auth', 'request_invite_already_active', `Invite request for already active user: ${normalizedEmail}`)
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({
                success: false,
                alreadyActive: true,
                message: 'Your account is already set up. Please use "Forgot Password" on the login page if you need to reset your password.'
              })
            }
          }

          // Note: We do NOT delete existing auth user here.
          // If they have an old Supabase magic link, it should still work.
          // The accept-invite function will handle cleanup when the proxy token is redeemed.
        }

        // Check the transactional email provider is configured
        const inviteEmailConfig = checkEmailConfiguration()
        if (!inviteEmailConfig.configured) {
          logger.error('auth', 'request_invite_config_error', inviteEmailConfig.error)
          return errorResponse({ code: 'service_unavailable', headers })
        }

        // Create a proxy invite token (never expires)
        const inviteToken = await createInviteToken(
          normalizedEmail,
          member.name,
          member.role || DEFAULT_STRUCTURAL_ROLE
        )
        const inviteUrl = getInviteUrl(inviteToken)

        // Send email with proxy link
        const emailHtml = generateInviteEmailHtml(inviteUrl, member.name)
        await sendEmail({
          from: EMAIL_NO_REPLY,
          to: normalizedEmail,
          subject: EMAIL_SUBJECTS.invite,
          html: emailHtml,
        })

        // Record to email history
        await recordInviteEmail({
          recipientEmail: normalizedEmail,
          recipientName: member.name,
          htmlContent: emailHtml,
          sentByEmail: 'self-service',
          status: 'sent',
        })

        logger.info('auth', 'request_invite_success', `Self-service invite sent to ${normalizedEmail} (proxy token)`)

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: 'Invite sent! Check your email for a link to set up your account.'
          })
        }
      }
    } catch (err: any) {
      // If JSON parsing fails or other error, continue to auth check
      if (err.message?.includes('JSON')) {
        // Continue to normal auth flow
      } else {
        logger.error('auth', 'request_invite_error', 'Error processing invite request', err)
        return errorResponse({ code: 'server_error', headers })
      }
    }
  }

  // Verify authorization - require a valid JWT token
  const authHeader = event.headers.authorization || event.headers.Authorization
  if (!authHeader?.startsWith('Bearer ')) {
    logger.warn('auth', 'unauthorized_request', 'Request without token')
    return errorResponse({ code: 'unauthorized', headers })
  }

  const token = authHeader.split(' ')[1]

  try {
    // Verify the token and get the user
    const { data: { user: callerUser }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !callerUser) {
      logger.warn('auth', 'invalid_token', 'Invalid or expired token')
      return errorResponse({ code: 'unauthorized', headers })
    }

    // Check if caller has admin role. Resolved from the roster row, not from
    // the token: this check used to read `app_metadata.role ||
    // user_metadata.role` inline, which is the same escalation getPrincipal()
    // carried and the most dangerous copy of it — this endpoint invites users,
    // deletes them and changes their rung.
    const callerPrincipal = await getPrincipal(callerUser)
    // Undefined rather than null so it drops out of audit payloads instead of
    // recording a rung of "null". Past the guard below it is always 'admin'.
    const callerRole = callerPrincipal.role ?? undefined
    if (!hasRole(callerPrincipal, 'admin')) {
      logger.warn('auth', 'forbidden_access', 'Non-admin attempted admin operation', {
        userEmail: callerUser.email,
        metadata: { role: callerRole }
      })
      return errorResponse({ code: 'forbidden', headers })
    }

    // Set caller context for subsequent logs
    logger.info('auth', 'admin_request', `Admin request: ${event.httpMethod}`, {
      userEmail: callerUser.email,
      userId: callerUser.id
    })

    switch (event.httpMethod) {
      case 'GET': {
        const { action, email } = event.queryStringParameters || {}

        // List all users
        if (action === 'list') {
          const users = await listAllAuthUsers(supabaseAdmin)

          // Roles come off the roster, in one query rather than one per user.
          // Reporting `app_metadata.role` here would print a field nothing
          // authorises on any more — a screen that disagrees with the gate.
          const roster = await readRoster(users.map(u => u.id))

          const mappedUsers: AuthUser[] = users.map(user => ({
            id: user.id,
            email: user.email!,
            name: user.user_metadata?.full_name || user.user_metadata?.name,
            confirmed: !!user.email_confirmed_at,
            confirmed_at: user.email_confirmed_at || undefined,
            invited_at: user.invited_at || undefined,
            created_at: user.created_at,
            role: roster.get(user.id)?.role ?? undefined,
            capabilities: roster.get(user.id)?.capabilities ?? []
          }))

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ users: mappedUsers })
          }
        }

        // Get status for a specific email
        if (email) {
          const user = await findAuthUserByEmail(email, supabaseAdmin)

          if (!user) {
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({ exists: false })
            }
          }

          const principal = await getPrincipal(user)

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              exists: true,
              id: user.id,
              email: user.email,
              name: user.user_metadata?.full_name || user.user_metadata?.name,
              confirmed: !!user.email_confirmed_at,
              confirmed_at: user.email_confirmed_at,
              invited_at: user.invited_at,
              created_at: user.created_at,
              role: principal.role ?? undefined,
              capabilities: principal.capabilities
            })
          }
        }

        return errorResponse({
          code: 'invalid_input',
          headers,
          message: 'Missing action or email parameter.',
        })
      }

      case 'POST': {
        const body = JSON.parse(event.body || '{}')
        const { email, name, role, action: postAction } = body

        // Bulk resend invites to all members who haven't signed in yet
        if (postAction === 'resend_pending') {
          logger.info('auth', 'resend_pending_start', 'Starting bulk resend of pending invites', {
            userEmail: callerUser.email
          })

          // Check the transactional email provider is configured
          const resendPendingEmailConfig = checkEmailConfiguration()
          if (!resendPendingEmailConfig.configured) {
            logger.error('auth', 'resend_pending_config_error', resendPendingEmailConfig.error)
            return errorResponse({ code: 'service_unavailable', headers })
          }

          // Get all members who haven't signed in yet
          const { data: pendingMembers, error: queryError } = await supabaseAdmin
            .from('members')
            .select('id, name, email, role, user_id')
            .eq('status', 'active')
            .not('user_id', 'is', null)

          if (queryError) {
            logger.error('auth', 'resend_pending_query_failed', 'Failed to query pending members', new Error(queryError.message))
            return errorResponse({ code: 'server_error', headers })
          }

          // Get all auth users to check who hasn't signed in
          const authUsers = await listAllAuthUsers(supabaseAdmin)

          // Filter to members whose auth user has never signed in
          const pendingInvites = pendingMembers?.filter(member => {
            const authUser = authUsers.find(u => u.id === member.user_id)
            return authUser && !authUser.last_sign_in_at
          }) || []

          if (pendingInvites.length === 0) {
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({
                success: true,
                message: 'No pending invites to resend',
                results: []
              })
            }
          }

          const results: Array<{ email: string; success: boolean; message: string }> = []

          for (const member of pendingInvites) {
            try {
              // Find and delete existing auth user
              const existingUser = authUsers.find(u => u.email?.toLowerCase() === member.email.toLowerCase())
              if (existingUser) {
                await supabaseAdmin.auth.admin.deleteUser(existingUser.id)
              }

              // Clear member's user_id since we deleted the auth user
              await supabaseAdmin
                .from('members')
                .update({ user_id: null })
                .eq('id', member.id)

              // Create a proxy invite token (never expires)
              const inviteToken = await createInviteToken(
                member.email,
                member.name,
                member.role || DEFAULT_STRUCTURAL_ROLE,
                callerUser.id
              )
              const inviteUrl = getInviteUrl(inviteToken)

              // Send email with proxy link
              const emailHtml = generateInviteEmailHtml(inviteUrl, member.name)
              await sendEmail({
                from: EMAIL_NO_REPLY,
                to: member.email,
                subject: EMAIL_SUBJECTS.invite,
                html: emailHtml,
              })

              // Record to email history
              await recordInviteEmail({
                recipientEmail: member.email,
                recipientName: member.name,
                htmlContent: emailHtml,
                sentById: callerUser.id,
                sentByEmail: callerUser.email!,
                status: 'sent',
              })

              results.push({ email: member.email, success: true, message: 'Invite resent (proxy token)' })
            } catch (err: any) {
              results.push({ email: member.email, success: false, message: err.message || 'Unknown error' })
            }
          }

          // Audit log
          const successCount = results.filter(r => r.success).length
          await logger.audit('INVITE', 'auth_user', null, {
            actorId: callerUser.id,
            actorEmail: callerUser.email!,
            actorRole: callerRole,
            description: `Bulk resent ${successCount}/${results.length} pending invites`
          })

          logger.info('auth', 'resend_pending_complete', `Bulk resend complete: ${successCount}/${results.length} successful`, {
            userEmail: callerUser.email,
            metadata: { total: results.length, successful: successCount }
          })

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              message: `Resent ${successCount} of ${results.length} invites`,
              results
            })
          }
        }

        if (!email) {
          return errorResponse({
            code: 'invalid_input',
            headers,
            message: 'Email is required.',
            fields: { email: 'Email is required' },
          })
        }

        // Check the transactional email provider is configured
        const postInviteEmailConfig = checkEmailConfiguration()
        if (!postInviteEmailConfig.configured) {
          logger.error('auth', 'invite_config_error', postInviteEmailConfig.error)
          return errorResponse({ code: 'service_unavailable', headers })
        }

        // Resend invite - delete existing user and re-invite with proxy token
        if (postAction === 'resend') {
          logger.info('auth', 'resend_invite_start', `Resending invite to ${email}`, {
            userEmail: callerUser.email,
            metadata: { targetEmail: email, name }
          })

          // Find and delete existing user
          const existingUser = await findAuthUserByEmail(email, supabaseAdmin)

          if (existingUser) {
            await supabaseAdmin.auth.admin.deleteUser(existingUser.id)
          }

          // Clear member's user_id since we deleted the auth user
          await supabaseAdmin
            .from('members')
            .update({ user_id: null })
            .eq('email', email.toLowerCase())

          // Create a proxy invite token (never expires)
          const inviteToken = await createInviteToken(
            email,
            name,
            role || DEFAULT_STRUCTURAL_ROLE,
            callerUser.id
          )
          const inviteUrl = getInviteUrl(inviteToken)

          // Send the invite with the proxy link
          const emailHtml = generateInviteEmailHtml(inviteUrl, name)

          await sendEmail({
            from: EMAIL_NO_REPLY,
            to: email,
            subject: EMAIL_SUBJECTS.invite,
            html: emailHtml,
          })

          // Record to email history
          await recordInviteEmail({
            recipientEmail: email,
            recipientName: name,
            htmlContent: emailHtml,
            sentById: callerUser.id,
            sentByEmail: callerUser.email!,
            status: 'sent',
          })

          // Audit log
          await logger.audit('INVITE', 'auth_user', null, {
            actorId: callerUser.id,
            actorEmail: callerUser.email!,
            actorRole: callerRole,
            targetUserEmail: email,
            newValues: { email, name, role: role || DEFAULT_STRUCTURAL_ROLE },
            description: `Resent invite to ${email} (proxy token)`
          })

          logger.info('auth', 'resend_invite_success', `Invite resent to ${email} (proxy token)`, {
            userEmail: callerUser.email,
            metadata: { targetEmail: email }
          })

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              message: `Invite resent to ${email}`
            })
          }
        }

        // Send new invite with proxy token
        logger.info('auth', 'invite_user_start', `Inviting new user ${email}`, {
          userEmail: callerUser.email,
          metadata: { targetEmail: email, name, role: role || DEFAULT_STRUCTURAL_ROLE }
        })

        // First check if user already exists in auth
        const existingUser = await findAuthUserByEmail(email, supabaseAdmin)

        if (existingUser) {
          logger.warn('auth', 'invite_user_exists', `User already exists: ${email}`, {
            userEmail: callerUser.email,
            metadata: { targetEmail: email }
          })
          return errorResponse({
            code: 'invalid_input',
            headers,
            message: 'A user with that email already exists.',
            extra: { success: false },
          })
        }

        // Create a proxy invite token (never expires)
        const inviteToken = await createInviteToken(
          email,
          name,
          role || DEFAULT_STRUCTURAL_ROLE,
          callerUser.id
        )
        const inviteUrl = getInviteUrl(inviteToken)

        // Send the invite with the proxy link
        const emailHtml = generateInviteEmailHtml(inviteUrl, name)

        await sendEmail({
          from: EMAIL_NO_REPLY,
          to: email,
          subject: EMAIL_SUBJECTS.invite,
          html: emailHtml,
        })

        // Record to email history
        await recordInviteEmail({
          recipientEmail: email,
          recipientName: name,
          htmlContent: emailHtml,
          sentById: callerUser.id,
          sentByEmail: callerUser.email!,
          status: 'sent',
        })

        // Audit log
        await logger.audit('INVITE', 'auth_user', null, {
          actorId: callerUser.id,
          actorEmail: callerUser.email!,
          actorRole: callerRole,
          targetUserEmail: email,
          newValues: { email, name, role: role || DEFAULT_STRUCTURAL_ROLE },
          description: `Invited new user ${email} (proxy token)`
        })

        logger.info('auth', 'invite_user_success', `Invite sent to ${email} (proxy token)`, {
          userEmail: callerUser.email,
          metadata: { targetEmail: email }
        })

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: `Invite sent to ${email}`
          })
        }
      }

      case 'PUT': {
        const body = JSON.parse(event.body || '{}')
        const { userId, role, name, action: putAction, email } = body

        // Handle password reset request
        if (putAction === 'reset_password' && email) {
          logger.info('auth', 'password_reset_start', `Initiating password reset for ${email}`, {
            userEmail: callerUser.email,
            metadata: { targetEmail: email }
          })

          // Check the transactional email provider is configured
          const resetEmailConfig = checkEmailConfiguration()
          if (!resetEmailConfig.configured) {
            logger.error('auth', 'password_reset_config_error', resetEmailConfig.error)
            return errorResponse({ code: 'service_unavailable', headers })
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
            logger.error('auth', 'password_reset_failed', `Failed to generate reset link for ${email}`, new Error(linkError.message))
            return errorResponse({
              code: 'service_unavailable',
              headers,
              message: 'We couldn’t send a password reset email right now. Please try again in a few minutes.',
              extra: { success: false },
            })
          }

          // Send via the configured transactional email provider
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
            sentById: callerUser.id,
            sentByEmail: callerUser.email!,
            status: 'sent',
          })

          // Audit log
          await logger.audit('PASSWORD_RESET', 'auth_user', linkData.user?.id || null, {
            actorId: callerUser.id,
            actorEmail: callerUser.email!,
            actorRole: callerRole,
            targetUserEmail: email,
            description: `Password reset email sent to ${email}`
          })

          logger.info('auth', 'password_reset_success', `Password reset email sent to ${email}`, {
            userEmail: callerUser.email,
            metadata: { targetEmail: email }
          })

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              message: `Password reset email sent to ${email}`
            })
          }
        }

        // Update user metadata
        if (!userId) {
          return errorResponse({
            code: 'invalid_input',
            headers,
            message: 'A user must be selected.',
          })
        }

        logger.info('auth', 'update_user_start', `Updating user ${userId}`, {
          userEmail: callerUser.email,
          metadata: { targetUserId: userId, role, name }
        })

        // A rung is a roster column now, so this writes `members.role` rather
        // than `app_metadata.role`. Writing the metadata would have kept
        // returning 200 while conferring nothing, which is the worst possible
        // shape for a privilege change: an admin who thinks the promotion
        // landed and a user who never got it.
        if (role) {
          const { data: updatedRows, error: roleError } = await supabaseAdmin
            .from('members')
            .update({ role })
            .eq('user_id', userId)
            .select('id')

          if (roleError) {
            logger.error('auth', 'update_role_failed', `Failed to set role for ${userId}`, new Error(roleError.message))
            return errorResponse({
              code: 'server_error',
              headers,
              message: 'We couldn’t update that user. Please try again.',
              extra: { success: false },
            })
          }

          if (!updatedRows || updatedRows.length === 0) {
            logger.warn('auth', 'update_role_no_member', `No roster row for auth user ${userId}`, {
              userEmail: callerUser.email,
              metadata: { targetUserId: userId, role }
            })
            return errorResponse({
              code: 'invalid_input',
              headers,
              statusCode: 404,
              message: 'That account is not on the member roster yet, so it has no role to change.',
              extra: { success: false },
            })
          }
        }

        const updates: any = {}

        if (name) {
          updates.user_metadata = { full_name: name, name }
        }

        const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, updates)

        if (error) {
          logger.error('auth', 'update_user_failed', `Failed to update user ${userId}`, new Error(error.message))
          return errorResponse({
            code: 'server_error',
            headers,
            message: 'We couldn’t update that user. Please try again.',
            extra: { success: false },
          })
        }

        // Audit log for role change
        if (role) {
          await logger.audit('ROLE_CHANGE', 'auth_user', userId, {
            actorId: callerUser.id,
            actorEmail: callerUser.email!,
            actorRole: callerRole,
            targetUserId: userId,
            targetUserEmail: data.user?.email,
            newValues: { role },
            description: `Changed role to ${role} for user ${data.user?.email || userId}`
          })
        }

        // Audit log for name update
        if (name) {
          await logger.audit('UPDATE', 'auth_user', userId, {
            actorId: callerUser.id,
            actorEmail: callerUser.email!,
            actorRole: callerRole,
            targetUserId: userId,
            targetUserEmail: data.user?.email,
            newValues: { name },
            description: `Updated name to ${name} for user ${data.user?.email || userId}`
          })
        }

        logger.info('auth', 'update_user_success', `User ${userId} updated`, {
          userEmail: callerUser.email,
          metadata: { targetUserId: userId, targetEmail: data.user?.email }
        })

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: 'User updated successfully',
            user: data.user
          })
        }
      }

      case 'DELETE': {
        const { email } = event.queryStringParameters || {}

        if (!email) {
          return errorResponse({
            code: 'invalid_input',
            headers,
            message: 'Email is required.',
          })
        }

        logger.info('auth', 'delete_user_start', `Deleting user ${email}`, {
          userEmail: callerUser.email,
          metadata: { targetEmail: email }
        })

        // Find user by email
        const user = await findAuthUserByEmail(email, supabaseAdmin)

        if (!user) {
          logger.warn('auth', 'delete_user_not_found', `User not found: ${email}`, {
            userEmail: callerUser.email,
            metadata: { targetEmail: email }
          })
          return errorResponse({
            code: 'not_found',
            headers,
            message: 'No user found with that email.',
            extra: { success: false },
          })
        }

        const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id)

        if (error) {
          logger.error('auth', 'delete_user_failed', `Failed to delete user ${email}`, new Error(error.message))
          return errorResponse({
            code: 'server_error',
            headers,
            message: 'We couldn’t delete that user. Please try again.',
            extra: { success: false },
          })
        }

        // Audit log
        await logger.audit('DELETE', 'auth_user', user.id, {
          actorId: callerUser.id,
          actorEmail: callerUser.email!,
          actorRole: callerRole,
          targetUserId: user.id,
          targetUserEmail: email,
          oldValues: { email, name: user.user_metadata?.name, role: user.app_metadata?.role },
          description: `Deleted user ${email}`
        })

        logger.info('auth', 'delete_user_success', `User ${email} deleted`, {
          userEmail: callerUser.email,
          metadata: { targetEmail: email, targetUserId: user.id }
        })

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: `User ${email} deleted successfully`
          })
        }
      }

      default:
        return errorResponse({ code: 'method_not_allowed', headers })
    }
  } catch (error) {
    logger.error('auth', 'api_error', 'Supabase Auth Admin API error', error instanceof Error ? error : new Error(String(error)))
    return errorResponse({ code: 'server_error', headers })
  }
}
