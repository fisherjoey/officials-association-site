import { Handler } from '@netlify/functions'
import { supabase, getCorsHeaders, getPrincipal, errorResponse } from './_shared/handler'
import { sendEmail } from '../../lib/email'
import {
  EMAIL_ANNOUNCEMENTS,
  ORG_NAME,
  ORG_SHORT_NAME,
  ORG_TAGLINE,
  ORG_LOCATION,
  ORG_LOGO_URL,
  SITE_URL,
  getContactUrl,
  getPortalUrl,
  getCopyrightYear,
  EMAIL_SUBJECTS,
} from '../../lib/siteConfig'
import { DEFAULT_STRUCTURAL_ROLE, hasRole } from '../../lib/roles'

function generateInviteEmailHtml(inviteUrl: string, name?: string): string {
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
            <h1 style="color: #003DA5; font-size: 24px; margin-top: 0; margin-bottom: 16px;">${EMAIL_SUBJECTS.invite.replace('!', '')}!</h1>
            <p style="margin: 0 0 16px 0;">${name ? `Hi ${name.split(' ')[0]},` : 'Hello,'}</p>
            <p style="margin: 0 0 16px 0;">You have been invited to create an account on the <strong style="color: #003DA5;">${ORG_NAME}</strong> member portal.</p>
            <p style="text-align: center; margin: 24px 0;">
              <a href="${inviteUrl}" style="display: inline-block; padding: 14px 28px; background-color: #F97316; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600;">Accept Invitation</a>
            </p>
            <p style="margin: 0;">Best regards,<br><strong style="color: #003DA5;">${ORG_SHORT_NAME} Executive Board</strong></p>
          </td>
        </tr>
        <tr>
          <td style="background-color: #1F2937; color: #D1D5DB; padding: 20px; text-align: center; font-size: 14px; border-top: 3px solid #F97316;">
            <p style="margin: 0;">&copy; ${getCopyrightYear()} ${ORG_NAME}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
  `.trim()
}

export const handler: Handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin
  const headers = {
    ...getCorsHeaders(origin, ['POST']),
    'Content-Type': 'application/json'
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse({ code: 'method_not_allowed', headers })
  }

  // Verify authorization - require admin JWT
  const authHeader = event.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return errorResponse({ code: 'unauthorized', headers })
  }

  const token = authHeader.split(' ')[1]
  const { data: { user: callerUser }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !callerUser) {
    return errorResponse({ code: 'unauthorized', headers })
  }

  // Resolved from the roster row. This check used to read
  // `app_metadata.role || user_metadata.role` inline — its own copy of the
  // escalation that lived in getPrincipal(), and a worse one to leave behind,
  // since this endpoint rewrites the roster wholesale.
  let callerPrincipal
  try {
    callerPrincipal = await getPrincipal(callerUser)
  } catch {
    return errorResponse({ code: 'server_error', headers })
  }

  if (!hasRole(callerPrincipal, 'admin')) {
    return errorResponse({ code: 'forbidden', headers })
  }

  try {
    const body = JSON.parse(event.body || '{}')
    const { dryRun = false } = body

    const results = {
      authUsersImported: [] as string[],
      membersInvited: [] as string[],
      membersLinked: [] as string[],
      errors: [] as { email: string; error: string }[]
    }

    // Get all members
    const { data: members, error: membersError } = await supabase
      .from('members')
      .select('*')

    if (membersError) throw membersError

    // Get all auth users (with pagination)
    let allAuthUsers: any[] = []
    let page = 1
    const perPage = 1000

    while (true) {
      const { data: { users: pageUsers }, error } = await supabase.auth.admin.listUsers({ page, perPage })
      if (error) throw error
      if (!pageUsers || pageUsers.length === 0) break
      allAuthUsers = allAuthUsers.concat(pageUsers)
      if (pageUsers.length < perPage) break
      page++
    }

    const memberEmailMap = new Map(members?.map(m => [m.email.toLowerCase(), m]) || [])
    const authEmailMap = new Map(allAuthUsers.map(u => [u.email?.toLowerCase(), u]))

    // 1. Auth users without member records → create member record
    for (const authUser of allAuthUsers) {
      const email = authUser.email?.toLowerCase()
      if (!email) continue

      if (!memberEmailMap.has(email)) {
        const name = authUser.user_metadata?.full_name || authUser.user_metadata?.name || email.split('@')[0]

        if (dryRun) {
          results.authUsersImported.push(email)
          continue
        }

        try {
          const { error: insertError } = await supabase
            .from('members')
            .insert([{
              email,
              name,
              user_id: authUser.id,
              status: 'inactive',  // Inactive until they login and set password
              role: DEFAULT_STRUCTURAL_ROLE
            }])

          if (insertError) {
            results.errors.push({ email, error: insertError.message })
          } else {
            results.authUsersImported.push(email)
          }
        } catch (err: any) {
          results.errors.push({ email, error: err.message })
        }
      }
    }

    // 2. Members without auth accounts → create auth user and send invite
    // 3. Members with auth accounts but no user_id link → link them

    for (const member of members || []) {
      const email = member.email.toLowerCase()
      const authUser = authEmailMap.get(email)

      if (!authUser) {
        // No auth account - create one and send invite
        if (dryRun) {
          results.membersInvited.push(email)
          continue
        }

        try {
          const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
            type: 'invite',
            email,
            options: {
              data: {
                full_name: member.name,
                name: member.name,
                role: member.role || DEFAULT_STRUCTURAL_ROLE
              },
              redirectTo: `${SITE_URL}/auth/callback`
            }
          })

          if (linkError) {
            results.errors.push({ email, error: linkError.message })
            continue
          }

          // Link member to new auth user
          if (linkData.user?.id) {
            await supabase
              .from('members')
              .update({ user_id: linkData.user.id })
              .eq('id', member.id)
          }

          // Send invite email
          const inviteUrl = linkData.properties?.action_link
          if (inviteUrl) {
            try {
              const emailHtml = generateInviteEmailHtml(inviteUrl, member.name)
              await sendEmail({
                from: EMAIL_ANNOUNCEMENTS,
                to: email,
                subject: EMAIL_SUBJECTS.invite,
                html: emailHtml,
              })
              results.membersInvited.push(email)
            } catch (emailErr: any) {
              results.errors.push({ email, error: `Auth created but email failed: ${emailErr.message}` })
            }
          }

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 200))

        } catch (err: any) {
          results.errors.push({ email, error: err.message })
        }
      } else if (!member.user_id) {
        // Has auth account but member not linked - link them
        if (dryRun) {
          results.membersLinked.push(email)
          continue
        }

        try {
          await supabase
            .from('members')
            .update({ user_id: authUser.id })
            .eq('id', member.id)

          results.membersLinked.push(email)
        } catch (err: any) {
          results.errors.push({ email, error: err.message })
        }
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        dryRun,
        summary: {
          totalMembers: members?.length || 0,
          totalAuthUsers: allAuthUsers.length,
          authUsersImported: results.authUsersImported.length,
          membersInvited: results.membersInvited.length,
          membersLinked: results.membersLinked.length,
          errors: results.errors.length
        },
        details: results
      })
    }

  } catch (error) {
    console.error('Sync error:', error)
    return errorResponse({ code: 'server_error', headers })
  }
}
