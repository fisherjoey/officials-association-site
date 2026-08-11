import { createHandler, supabase, errorResponse } from './_shared/handler'

/**
 * Wire shape POSTed to /.netlify/functions/member-activities.
 *
 * The frontend (`lib/api/members.ts` memberActivitiesAPI) takes `any` and
 * forwards it straight through. Integration tests use this typed interface
 * so the wire shape stays grep-able.
 *
 * NOTE: the schema declares `activity_type` as TEXT NOT NULL with a comment
 * documenting the expected enum {meeting,training,game,certification,other}
 * (see `supabase/members-schema.sql`); the handler enforces this at the
 * boundary since the column has no DB-level CHECK.
 */
export interface MemberActivityCreatePayload {
  member_id: string
  /** Documented enum: 'meeting' | 'training' | 'game' | 'certification' | 'other' */
  activity_type: string
  /** ISO date (YYYY-MM-DD) — Postgres `DATE` column. */
  activity_date: string
  activity_data?: Record<string, unknown>
  notes?: string
}

export interface MemberActivityUpdatePayload extends Partial<MemberActivityCreatePayload> {
  id: string
}

/** Documented enum from the schema comment on `member_activities.activity_type`.
 * Schema column is plain TEXT NOT NULL — no DB-level CHECK — so we enforce
 * the contract at the handler boundary. */
const ALLOWED_ACTIVITY_TYPES = [
  'meeting',
  'training',
  'game',
  'certification',
  'other',
] as const

export const handler = createHandler({
  name: 'member-activities',
  auth: { GET: 'authenticated', POST: 'admin_or_executive', PUT: 'admin_or_executive', DELETE: 'admin_or_executive' },
  handler: async ({ event, logger, user }) => {
    switch (event.httpMethod) {
      case 'GET': {
        const { member_id } = event.queryStringParameters || {}

        let query = supabase
          .from('member_activities')
          .select('*')
          .order('activity_date', { ascending: false })
          .limit(500)

        if (member_id) {
          query = query.eq('member_id', member_id)
        }

        const { data, error } = await query

        if (error) throw error

        return { statusCode: 200, body: JSON.stringify(data) }
      }

      case 'POST': {
        const body = JSON.parse(event.body || '{}')
        logger.info('crud', 'create_member_activity', `Creating member activity for member ${body.member_id}`, {
          metadata: { member_id: body.member_id, activity_type: body.activity_type }
        })

        if (
          body.activity_type !== undefined &&
          !ALLOWED_ACTIVITY_TYPES.includes(body.activity_type)
        ) {
          return {
            statusCode: 400,
            body: JSON.stringify({
              error: `Invalid activity_type: must be one of ${ALLOWED_ACTIVITY_TYPES.join(', ')}`,
            }),
          }
        }

        const { data, error } = await supabase
          .from('member_activities')
          .insert([body])
          .select()
          .single()

        if (error) throw error

        await logger.audit('CREATE', 'member_activity', data.id, {
          actorId: user!.id,
          actorEmail: user!.email,
          targetUserId: body.member_id,
          newValues: { activity_type: body.activity_type, activity_date: body.activity_date },
          description: `Created activity for member ${body.member_id}`
        })

        return { statusCode: 201, body: JSON.stringify(data) }
      }

      case 'PUT': {
        const body = JSON.parse(event.body || '{}')
        const { id, ...updates } = body

        if (!id) {
          return errorResponse({
            code: 'invalid_input',
            message: 'A record must be selected for update.',
          })
        }

        if (
          updates.activity_type !== undefined &&
          !ALLOWED_ACTIVITY_TYPES.includes(updates.activity_type)
        ) {
          return {
            statusCode: 400,
            body: JSON.stringify({
              error: `Invalid activity_type: must be one of ${ALLOWED_ACTIVITY_TYPES.join(', ')}`,
            }),
          }
        }

        logger.info('crud', 'update_member_activity', `Updating member activity ${id}`, {
          metadata: { id, updates: Object.keys(updates) }
        })

        const { data, error } = await supabase
          .from('member_activities')
          .update(updates)
          .eq('id', id)
          .select()
          .single()

        if (error) throw error

        await logger.audit('UPDATE', 'member_activity', id, {
          actorId: user!.id,
          actorEmail: user!.email,
          newValues: updates,
          description: `Updated member activity ${id}`
        })

        return { statusCode: 200, body: JSON.stringify(data) }
      }

      case 'DELETE': {
        const id = event.queryStringParameters?.id

        if (!id) {
          return errorResponse({
            code: 'invalid_input',
            message: 'A record must be selected for deletion.',
          })
        }

        logger.info('crud', 'delete_member_activity', `Deleting member activity ${id}`, { metadata: { id } })

        const { data: existing, error: findError } = await supabase
          .from('member_activities')
          .select('id')
          .eq('id', id)
          .single()

        if (findError || !existing) {
          logger.warn('crud', 'delete_member_activity_not_found', `Member activity ${id} not found`, { metadata: { id } })
          return errorResponse({
            code: 'not_found',
            message: 'Activity not found.'.replace('..', '.'),
          })
        }

        const { error } = await supabase
          .from('member_activities')
          .delete()
          .eq('id', id)

        if (error) throw error

        await logger.audit('DELETE', 'member_activity', id, {
          actorId: user!.id,
          actorEmail: user!.email,
          description: `Deleted member activity ${id}`
        })

        return { statusCode: 204, body: '' }
      }

      default:
        return errorResponse({ code: 'method_not_allowed' })
    }
  }
})
