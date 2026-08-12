import { Handler } from '@netlify/functions'
import { supabase as supabaseAdmin, getCorsHeaders, errorResponse } from './_shared/handler'
import { Logger } from '../../lib/logger'
import { ORG_SHORT_NAME, getAuthCallbackUrl } from '../../lib/siteConfig'
import { DEFAULT_STRUCTURAL_ROLE } from '../../lib/roles'

/**
 * Accept Invite - Proxy for Supabase magic links
 *
 * This endpoint receives a never-expiring token, validates it,
 * generates a fresh Supabase magic link, and redirects the user.
 *
 * Flow:
 * 1. User clicks <site>/accept-invite?token=xxx
 * 2. Page calls this function to validate and get redirect URL
 * 3. Function generates fresh Supabase invite link
 * 4. User is redirected to complete signup
 *
 * Design notes:
 * - Tokens are intentionally never-expiring. The original docstring
 *   mentioned a 30d default, but the table has no `expires_at` column
 *   and the handler does not enforce a TTL. Adding one requires a
 *   schema migration plus a cron sweep, so it is deliberately deferred.
 * - "Token not found" and "token valid but member row missing" return
 *   an identical 404 body to avoid leaking which case occurred. A
 *   caller holding a list of candidate tokens must not be able to
 *   distinguish "token exists" from "token does not exist".
 */
const INVALID_INVITE_RESPONSE_BODY = {
  error: 'Invalid or already-used invite token',
  message: 'This invite link is not valid. Please request a new invite from our website.',
}
export const handler: Handler = async (event) => {
  const logger = Logger.fromEvent('accept-invite', event)

  const origin = event.headers.origin || event.headers.Origin
  const headers = getCorsHeaders(origin, ['GET', 'POST'])

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  // Support both GET (for simple redirects) and POST (for AJAX)
  const token = event.queryStringParameters?.token ||
    (event.body ? JSON.parse(event.body).token : null)

  if (!token) {
    logger.warn('invite', 'missing_token', 'Accept invite called without token')
    return errorResponse({
      code: 'invalid_input',
      headers,
      message: 'No invite token provided. Please use the link from your email.',
    })
  }

  try {
    // Look up the token
    const { data: inviteToken, error: tokenError } = await supabaseAdmin
      .from('invite_tokens')
      .select('*')
      .eq('token', token)
      .single()

    if (tokenError || !inviteToken) {
      logger.warn('invite', 'invalid_token', `Invalid invite token: ${token.substring(0, 8)}...`)
      // Same generic body as the "member missing" branch below to avoid
      // leaking which case occurred (existence oracle).
      return errorResponse({
        code: 'not_found',
        headers,
        message: INVALID_INVITE_RESPONSE_BODY.message,
      })
    }

    // TTL check — invite_tokens.expires_at lands via the new migration.
    // Treat expired tokens identically to invalid ones, same generic body
    // and 404, to keep the existence-oracle protection above.
    if (inviteToken.expires_at && new Date(inviteToken.expires_at).getTime() < Date.now()) {
      logger.info('invite', 'token_expired', `Token expired for ${inviteToken.email}`)
      return errorResponse({
        code: 'not_found',
        headers,
        message: INVALID_INVITE_RESPONSE_BODY.message,
      })
    }

    // Atomically claim the token. If used_at was already set, no row is
    // returned and a concurrent request has already claimed it. Without
    // this, two parallel POSTs both passed the JS-side check and both
    // ran the delete-then-recreate-then-link sequence below.
    const { data: claimedToken, error: claimError } = await supabaseAdmin
      .from('invite_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', inviteToken.id)
      .is('used_at', null)
      .select()
      .single()

    if (claimError || !claimedToken) {
      logger.info('invite', 'token_already_used', `Token already used for ${inviteToken.email}`)
      return errorResponse({
        code: 'invalid_input',
        headers,
        message: 'This invite has already been used. If you need to reset your password, use the login page.',
        extra: { alreadyUsed: true },
      })
    }

    // Verify the member still exists and is active
    const { data: member, error: memberError } = await supabaseAdmin
      .from('members')
      .select('id, name, email, role, status, user_id')
      .eq('email', inviteToken.email.toLowerCase())
      .single()

    if (memberError || !member) {
      logger.warn('invite', 'member_not_found', `Member not found for token: ${inviteToken.email}`)
      // Same generic body as the "token not found" branch above. Leaking
      // that a token exists (but its member row is gone) would let a
      // caller probe the invite_tokens table.
      return errorResponse({
        code: 'not_found',
        headers,
        message: INVALID_INVITE_RESPONSE_BODY.message,
      })
    }

    if (member.status !== 'active') {
      logger.warn('invite', 'member_inactive', `Inactive member tried to accept invite: ${inviteToken.email}`)
      return errorResponse({
        code: 'forbidden',
        headers,
        message: `Your membership is not currently active. Please contact ${ORG_SHORT_NAME} for assistance.`,
      })
    }

    // Check if user already exists in auth (by email, not just member.user_id)
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
    const authUser = allUsers.find(u => u.email?.toLowerCase() === inviteToken.email.toLowerCase())

    logger.info('invite', 'auth_user_check', `Checking auth user for ${inviteToken.email}`, {
      metadata: {
        found: !!authUser,
        lastSignIn: authUser?.last_sign_in_at || 'never',
        userId: authUser?.id
      }
    })

    if (authUser?.last_sign_in_at) {
      logger.info('invite', 'already_active_account', `User already has active account: ${inviteToken.email}`)
      return errorResponse({
        code: 'invalid_input',
        headers,
        message: 'Your account is already set up. Please use "Forgot Password" on the login page if you need to reset your password.',
        extra: { alreadyActive: true },
      })
    }

    // User exists but never signed in - delete to recreate with fresh invite
    if (authUser) {
      logger.info('invite', 'deleting_pending_user', `Deleting pending auth user ${authUser.id} for ${inviteToken.email}`)
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(authUser.id)
      if (deleteError) {
        logger.error('invite', 'delete_user_failed', `Failed to delete user ${authUser.id}`, new Error(deleteError.message))
      } else {
        logger.info('invite', 'deleted_pending_user', `Successfully deleted pending auth user for ${inviteToken.email}`)
      }
    }

    // Generate a fresh Supabase magic link
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'invite',
      email: inviteToken.email,
      options: {
        data: {
          full_name: member.name || inviteToken.name,
          name: member.name || inviteToken.name,
          role: member.role || inviteToken.role || DEFAULT_STRUCTURAL_ROLE
        },
        redirectTo: getAuthCallbackUrl()
      }
    })

    if (linkError) {
      logger.error('invite', 'link_generation_failed', `Failed to generate link for ${inviteToken.email}`, new Error(linkError.message))
      return errorResponse({
        code: 'service_unavailable',
        headers,
        message: 'We couldn’t process your invite. Please try again or request a new invite.',
      })
    }

    // Update member's user_id
    if (linkData.user?.id) {
      await supabaseAdmin
        .from('members')
        .update({ user_id: linkData.user.id })
        .eq('id', member.id)
    }

    // Token was already marked used during the atomic claim above.

    const redirectUrl = linkData.properties?.action_link || ''

    logger.info('invite', 'token_redeemed', `Invite token redeemed for ${inviteToken.email}`)

    // Return redirect URL (the page will handle the redirect)
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        redirectUrl,
        message: 'Redirecting to complete your account setup...'
      })
    }

  } catch (error) {
    logger.error('invite', 'accept_invite_error', 'Error processing invite', error instanceof Error ? error : new Error(String(error)))
    return errorResponse({
      code: 'server_error',
      headers,
      message: 'Something went wrong processing your invite. Please try again, or contact us if the problem persists.',
    })
  }
}
