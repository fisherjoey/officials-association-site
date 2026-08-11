import { createHandler, findAuthUserByEmail, errorResponse } from './_shared/handler'
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

/**
 * Wire shape the PUT branch accepts. Caller MUST send `id`; everything
 * else is optional and patched onto the row. Privileged fields
 * (role/email/netlify_user_id/user_id/status/rank) are stripped from
 * non-admin callers — see the strip list in the PUT handler.
 */
export interface MemberUpdatePayload {
  id: string
  name?: string
  email?: string
  phone?: string
  certification_level?: string
  rank?: number
  status?: string
  role?: string
  address?: string
  city?: string
  province?: string
  postal_code?: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
  custom_fields?: Record<string, unknown>
  notes?: string
  // Allowed in the wire shape so tests can probe the strip-list — the
  // handler refuses to accept these from non-admin callers.
  netlify_user_id?: string
  user_id?: string
}

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
            <p style="margin: 0 0 16px 0;">As a member, you'll have access to:</p>
            <ul style="margin: 0 0 16px 0; padding-left: 20px;">
              <li style="margin-bottom: 8px;"><strong style="color: #003DA5;">Resources</strong> - Training materials, rulebooks, and guides</li>
              <li style="margin-bottom: 8px;"><strong style="color: #003DA5;">Newsletter</strong> - Our official newsletter</li>
              <li style="margin-bottom: 8px;"><strong style="color: #003DA5;">Calendar</strong> - Upcoming events and training sessions</li>
              <li style="margin-bottom: 8px;"><strong style="color: #003DA5;">Rule Modifications</strong> - League-specific rule changes</li>
            </ul>
            <p style="text-align: center; margin: 24px 0;">
              <a href="${inviteUrl}" style="display: inline-block; padding: 14px 28px; background-color: #F97316; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600;">Accept Invitation</a>
            </p>
            <p style="margin: 0;">Best regards,<br><strong style="color: #003DA5;">${ORG_SHORT_NAME} Executive Board</strong></p>
          </td>
        </tr>
        <tr>
          <td style="background-color: #1F2937; color: #D1D5DB; padding: 30px 20px; text-align: center; font-size: 14px; border-top: 3px solid #F97316;">
            <p style="margin: 0 0 10px 0; font-weight: 600; color: #ffffff;">${ORG_NAME}</p>
            <p style="margin: 0 0 15px 0;">${ORG_LOCATION}</p>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 20px auto;">
              <tr>
                <td style="padding: 0 8px;"><a href="${SITE_URL}" style="color: #F97316; text-decoration: none;">Website</a></td>
                <td style="padding: 0 8px;"><a href="${getPortalUrl()}" style="color: #F97316; text-decoration: none;">Member Portal</a></td>
                <td style="padding: 0 8px;"><a href="${getContactUrl('membership')}" style="color: #F97316; text-decoration: none;">Contact Us</a></td>
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

const FORBIDDEN = (msg?: string) => errorResponse({
  code: 'forbidden',
  message: msg,
})

export const handler = createHandler({
  name: 'members',
  auth: {
    GET: 'authenticated',
    POST: 'authenticated',
    PUT: 'authenticated',
    DELETE: 'admin',
  },
  handler: async ({ event, supabase, logger, user }) => {
    const isAdmin = user!.role === 'admin' || user!.role === 'executive'
    const callerEmail = user!.email.toLowerCase()
    const callerId = user!.id

    switch (event.httpMethod) {
      case 'GET': {
        const { netlify_user_id, user_id, id, email } = event.queryStringParameters || {}

        // Get member by email — self lookup unless admin/executive
        if (email) {
          if (!isAdmin && email.toLowerCase() !== callerEmail) {
            return FORBIDDEN()
          }

          const { data, error } = await supabase
            .from('members')
            .select('*')
            .eq('email', email.toLowerCase())
            .single()

          if (error && error.code !== 'PGRST116') throw error
          return { statusCode: 200, body: JSON.stringify(data || null) }
        }

        // Get member by Supabase Auth user ID — self lookup unless admin/executive
        if (user_id) {
          if (!isAdmin && user_id !== callerId) {
            return FORBIDDEN()
          }

          const { data, error } = await supabase
            .from('members')
            .select('*')
            .eq('user_id', user_id)
            .single()

          if (error && error.code !== 'PGRST116') throw error
          return { statusCode: 200, body: JSON.stringify(data || null) }
        }

        // Lookup by member id or netlify_user_id, and full list, are admin/executive only
        if (!isAdmin) return FORBIDDEN()

        if (netlify_user_id) {
          const { data, error } = await supabase
            .from('members')
            .select('*')
            .eq('netlify_user_id', netlify_user_id)
            .single()

          if (error && error.code !== 'PGRST116') throw error
          return { statusCode: 200, body: JSON.stringify(data || null) }
        }

        if (id) {
          const { data, error } = await supabase
            .from('members')
            .select('*')
            .eq('id', id)
            .single()

          if (error) throw error
          return { statusCode: 200, body: JSON.stringify(data) }
        }

        // Full list (admin/executive only by the FORBIDDEN gate above)
        const { data, error } = await supabase
          .from('members')
          .select('*')
          .order('name', { ascending: true })
          .limit(1000)

        if (error) throw error

        const signedInUserIds = new Set<string>()
        let page = 1
        const perPage = 1000
        while (true) {
          const { data: { users } } = await supabase.auth.admin.listUsers({ page, perPage })
          for (const u of users || []) {
            if (u.last_sign_in_at) signedInUserIds.add(u.id)
          }
          if (!users || users.length < perPage) break
          page++
        }

        const membersWithStatus = data?.map(member => ({
          ...member,
          account_setup_complete: !!(member.user_id && signedInUserIds.has(member.user_id))
        })) || []

        return { statusCode: 200, body: JSON.stringify(membersWithStatus) }
      }

      case 'POST': {
        const body = JSON.parse(event.body || '{}')
        const { email, name, role, skipInvite, ...memberData } = body

        if (!email) {
          return errorResponse({
            code: 'invalid_input',
            message: 'Email is required.',
            fields: { email: 'Email is required' },
          })
        }

        // Non-admins can only create their own member row, and may not assign a role
        if (!isAdmin) {
          if (email.toLowerCase() !== callerEmail) {
            return FORBIDDEN('Cannot create a member record for another user')
          }
          if (role && role !== 'official') {
            return FORBIDDEN('Cannot assign a role')
          }
          if (memberData.user_id && memberData.user_id !== callerId) {
            return FORBIDDEN('user_id must match the authenticated user')
          }
        }

        logger.info('crud', 'create_member_start', `Creating member: ${email || name || 'unknown'}`, {
          metadata: { email, name, skipInvite }
        })

        // Check if member with this email already exists
        const { data: existingMember } = await supabase
          .from('members')
          .select('id')
          .eq('email', email.toLowerCase())
          .single()

        if (existingMember) {
          logger.warn('crud', 'create_member_exists', `Member already exists with email: ${email}`, {
            metadata: { email }
          })
          return errorResponse({
            code: 'invalid_input',
            statusCode: 409,
            message: 'A member with that email address already exists.',
            fields: { email: 'Already in use' },
          })
        }

        // Check if auth user already exists
        const existingAuthUser = await findAuthUserByEmail(email, supabase)

        let authUserId: string | null = null
        let inviteSent = false

        if (existingAuthUser) {
          // Auth user exists - link to them
          authUserId = existingAuthUser.id
        } else if (!skipInvite && isAdmin) {
          // Only admins/executives trigger invite emails on member creation.
          // Self-creating users go through the standard /accept-invite flow.
          try {
            const siteUrl = SITE_URL
            const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
              type: 'invite',
              email: email.toLowerCase(),
              options: {
                data: {
                  full_name: name,
                  name: name,
                  role: role || 'official'
                },
                redirectTo: `${siteUrl}/auth/callback`
              }
            })

            if (linkError) {
              logger.error('crud', 'create_member_invite_failed', `Failed to create auth user: ${linkError.message}`, new Error(linkError.message))
              return errorResponse({
                code: 'server_error',
                message: 'We couldn’t set up an account for that member. Please try again.',
              })
            }

            authUserId = linkData.user?.id || null
            const inviteUrl = linkData.properties?.action_link

            if (inviteUrl) {
              try {
                const emailHtml = generateInviteEmailHtml(inviteUrl, name)
                await sendEmail({
                  from: EMAIL_ANNOUNCEMENTS,
                  to: email,
                  subject: EMAIL_SUBJECTS.invite,
                  html: emailHtml,
                })
                inviteSent = true
                logger.info('crud', 'create_member_invite_sent', `Invite email sent to ${email}`, {
                  metadata: { email, authUserId }
                })
              } catch (emailErr) {
                logger.error('crud', 'create_member_email_failed', `Failed to send invite email to ${email}`, emailErr instanceof Error ? emailErr : new Error(String(emailErr)))
              }
            }
          } catch (authErr) {
            logger.error('crud', 'create_member_auth_failed', 'Auth user creation failed', authErr instanceof Error ? authErr : new Error(String(authErr)))
          }
        }

        // Create member record with user_id link
        const insertRow: Record<string, any> = {
          ...memberData,
          email: email.toLowerCase(),
          name,
          role: role || 'official',
          user_id: authUserId || (isAdmin ? null : callerId),
        }

        const { data, error } = await supabase
          .from('members')
          .insert([insertRow])
          .select()
          .single()

        if (error) throw error

        await logger.audit('CREATE', 'member', data.id, {
          actorId: authUserId || callerId,
          actorEmail: callerEmail,
          newValues: { email, name, role: role || 'official' },
          description: `Created member ${email}`
        })

        logger.info('crud', 'create_member_success', `Member created: ${email}`, {
          metadata: { memberId: data.id, email, inviteSent }
        })

        return { statusCode: 201, body: JSON.stringify({ ...data, inviteSent }) }
      }

      case 'PUT': {
        const body = JSON.parse(event.body || '{}')
        const { id, ...updates } = body

        if (!id) {
          return errorResponse({
            code: 'invalid_input',
            message: 'A member must be selected.',
          })
        }

        const { data: existing } = await supabase
          .from('members')
          .select('*')
          .eq('id', id)
          .single()

        if (!existing) {
          return errorResponse({ code: 'not_found', message: 'That member couldn’t be found.' })
        }

        // Non-admins must own the row, either by user_id link or (for the
        // initial linking flow) by matching email on a row whose user_id
        // is still null. Privileged fields are stripped regardless.
        if (!isAdmin) {
          const ownsByUserId = existing.user_id === callerId
          const ownsByEmail = !existing.user_id
            && (existing.email || '').toLowerCase() === callerEmail
          if (!ownsByUserId && !ownsByEmail) {
            return FORBIDDEN()
          }
          delete updates.role
          delete updates.email
          delete updates.netlify_user_id
          // status and rank are admin-only fields. A non-admin must not
          // be able to undo a suspension or self-promote rank by self-PUT.
          delete updates.status
          delete updates.rank
          if ('user_id' in updates && updates.user_id !== callerId) {
            delete updates.user_id
          }
        }

        logger.info('crud', 'update_member_start', `Updating member ${id}`, {
          metadata: { memberId: id, updates: Object.keys(updates) }
        })

        // If the strip emptied out the update body (e.g. the caller only
        // sent privileged fields), return the existing row unchanged
        // rather than firing an empty UPDATE — Supabase rejects those
        // and the resulting error would 500/404 a benign no-op.
        if (Object.keys(updates).length === 0) {
          return { statusCode: 200, body: JSON.stringify(existing) }
        }

        const { data, error } = await supabase
          .from('members')
          .update(updates)
          .eq('id', id)
          .select()
          .single()

        if (error) throw error

        // If role was updated, sync to Supabase Auth user metadata
        if (updates.role && data.user_id) {
          try {
            await supabase.auth.admin.updateUserById(data.user_id, {
              app_metadata: { role: updates.role }
            })
            logger.info('crud', 'role_sync_success', `Synced role to auth for user ${data.user_id}`, {
              metadata: { userId: data.user_id, newRole: updates.role }
            })
          } catch (authError) {
            logger.error('crud', 'role_sync_failed', `Failed to sync role to auth for user ${data.user_id}`, authError instanceof Error ? authError : new Error(String(authError)))
          }
        }

        await logger.audit('UPDATE', 'member', id, {
          actorId: callerId,
          actorEmail: callerEmail,
          oldValues: existing || undefined,
          newValues: updates,
          description: `Updated member ${data.email || data.name || id}`
        })

        logger.info('crud', 'update_member_success', `Member ${id} updated`, {
          metadata: { memberId: id, email: data.email }
        })

        return { statusCode: 200, body: JSON.stringify(data) }
      }

      case 'DELETE': {
        const id = event.queryStringParameters?.id

        if (!id) {
          return errorResponse({
            code: 'invalid_input',
            message: 'A member must be selected for deletion.',
          })
        }

        logger.info('crud', 'delete_member_start', `Deleting member ${id}`, {
          metadata: { memberId: id }
        })

        const { data: member } = await supabase
          .from('members')
          .select('*')
          .eq('id', id)
          .single()

        const { error } = await supabase
          .from('members')
          .delete()
          .eq('id', id)

        if (error) throw error

        // Also delete the auth user if linked
        let authUserDeleted = false

        if (member?.user_id) {
          try {
            await supabase.auth.admin.deleteUser(member.user_id)
            authUserDeleted = true
            logger.info('crud', 'delete_member_auth_deleted', `Auth user deleted for member ${id}`, {
              metadata: { memberId: id, userId: member.user_id }
            })
          } catch (authErr) {
            logger.error('crud', 'delete_member_auth_failed', 'Failed to delete auth user by user_id', authErr instanceof Error ? authErr : new Error(String(authErr)))
          }
        }

        if (!authUserDeleted && member?.email) {
          try {
            const authUser = await findAuthUserByEmail(member.email, supabase)
            if (authUser) {
              await supabase.auth.admin.deleteUser(authUser.id)
              logger.info('crud', 'delete_member_auth_deleted_by_email', `Auth user deleted by email lookup for member ${id}`, {
                metadata: { memberId: id, userId: authUser.id, email: member.email }
              })
            }
          } catch (authErr) {
            logger.error('crud', 'delete_member_auth_email_lookup_failed', 'Failed to delete auth user by email', authErr instanceof Error ? authErr : new Error(String(authErr)))
          }
        }

        await logger.audit('DELETE', 'member', id, {
          actorId: callerId,
          actorEmail: callerEmail,
          oldValues: member || undefined,
          description: `Deleted member ${member?.email || member?.name || id}`
        })

        logger.info('crud', 'delete_member_success', `Member ${id} deleted`, {
          metadata: { memberId: id, email: member?.email }
        })

        return { statusCode: 204, body: '' }
      }
    }

    return errorResponse({ code: 'method_not_allowed' })
  }
})
