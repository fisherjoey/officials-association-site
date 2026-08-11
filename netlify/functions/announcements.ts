import { createHandler, supabase, errorResponse } from './_shared/handler'

/**
 * Wire shape POSTed to /.netlify/functions/announcements.
 *
 * The frontend (`app/portal/news/NewsClient.tsx`) and integration tests both
 * import this type so a refactor on either side breaks compilation if the
 * shape drifts.
 */
export interface AnnouncementCreatePayload {
  title: string
  content: string
  category?: string
  priority?: 'high' | 'normal' | 'low'
  author?: string
  /** ISO timestamp; the handler defaults to now() if omitted. */
  date?: string
  /** Optional list of intended audience tags (mirrors the schema column). */
  audience?: string[]
  /** ISO timestamp; row hides itself once `expires` passes. */
  expires?: string
}

export interface AnnouncementUpdatePayload extends Partial<AnnouncementCreatePayload> {
  id: string
}

/** Allowed values for the `priority` column. Schema is unbounded TEXT but the
 * frontend `Announcement` interface narrows it to this set; we enforce it
 * here so a buggy or hostile client can't put garbage on the wire. */
const ALLOWED_PRIORITIES = ['high', 'normal', 'low'] as const

export const handler = createHandler({
  name: 'announcements',
  auth: { GET: 'authenticated', POST: 'admin_or_executive', PUT: 'admin_or_executive', DELETE: 'admin_or_executive' },
  handler: async ({ event, logger, user }) => {
    switch (event.httpMethod) {
      case 'GET': {
        const { published_only } = event.queryStringParameters || {}

        let query = supabase
          .from('announcements')
          .select('*')
          .order('date', { ascending: false })
          .limit(200)

        // When published_only=true is set, hide rows past their expiry. The
        // schema column is `expires` (TIMESTAMPTZ, NULL = never expires).
        if (published_only === 'true') {
          query = query.or(`expires.is.null,expires.gt.${new Date().toISOString()}`)
        }

        const { data, error } = await query

        if (error) throw error

        return {
          statusCode: 200,
          body: JSON.stringify(data)
        }
      }

      case 'POST': {
        const body = JSON.parse(event.body || '{}')

        logger.info('crud', 'create_announcement', `Creating announcement: ${body.title || 'untitled'}`, {
          metadata: { title: body.title, type: body.type }
        })

        // Validate priority against the documented enum. Schema is plain
        // TEXT so we have to enforce the contract here.
        if (body.priority !== undefined && !ALLOWED_PRIORITIES.includes(body.priority)) {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: `Invalid priority: must be one of ${ALLOWED_PRIORITIES.join(', ')}` })
          }
        }

        // Validate `date` if supplied — Postgres' 22P02 → 400 mapping covers
        // some malformed strings but not every junk value, so we guard
        // explicitly for clean error messages.
        if (body.date !== undefined && Number.isNaN(Date.parse(body.date))) {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Invalid date: must be a parseable ISO timestamp' })
          }
        }

        const { data, error } = await supabase
          .from('announcements')
          .insert([{
            ...body,
            priority: body.priority ?? 'normal',
            date: body.date || new Date().toISOString()
          }])
          .select()

        if (error) throw error

        await logger.audit('CREATE', 'announcement', data[0].id, {
          actorId: user!.id,
          actorEmail: user!.email,
          newValues: { title: body.title, type: body.type },
          description: `Created announcement: ${body.title}`
        })

        return {
          statusCode: 201,
          body: JSON.stringify(data[0])
        }
      }

      case 'PUT': {
        const body = JSON.parse(event.body || '{}')
        const { id, ...updateData } = body

        if (!id) {
          return errorResponse({
            code: 'invalid_input',
            message: 'An announcement must be selected for update.',
          })
        }

        // Same enum guard on update. We don't default missing values here —
        // a PUT only touches the columns it sends.
        if (updateData.priority !== undefined && !ALLOWED_PRIORITIES.includes(updateData.priority)) {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: `Invalid priority: must be one of ${ALLOWED_PRIORITIES.join(', ')}` })
          }
        }

        if (updateData.date !== undefined && Number.isNaN(Date.parse(updateData.date))) {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Invalid date: must be a parseable ISO timestamp' })
          }
        }

        logger.info('crud', 'update_announcement', `Updating announcement ${id}`, {
          metadata: { id, updates: Object.keys(updateData) }
        })

        const { data, error } = await supabase
          .from('announcements')
          .update({ ...updateData, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()

        if (error) throw error

        await logger.audit('UPDATE', 'announcement', id, {
          actorId: user!.id,
          actorEmail: user!.email,
          newValues: updateData,
          description: `Updated announcement ${id}`
        })

        return {
          statusCode: 200,
          body: JSON.stringify(data[0])
        }
      }

      case 'DELETE': {
        const { id } = event.queryStringParameters || {}

        if (!id) {
          return errorResponse({
            code: 'invalid_input',
            message: 'An announcement must be selected for deletion.',
          })
        }

        logger.info('crud', 'delete_announcement', `Deleting announcement ${id}`, {
          metadata: { id }
        })

        const { error } = await supabase
          .from('announcements')
          .delete()
          .eq('id', id)

        if (error) throw error

        await logger.audit('DELETE', 'announcement', id, {
          actorId: user!.id,
          actorEmail: user!.email,
          description: `Deleted announcement ${id}`
        })

        return {
          statusCode: 204,
          body: ''
        }
      }

      default:
        return errorResponse({ code: 'method_not_allowed' })
    }
  }
})
