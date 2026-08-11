import { createHandler, supabase, errorResponse } from './_shared/handler'

/**
 * Wire shape POSTed to /.netlify/functions/officials.
 *
 * The frontend (`lib/api/public-content.ts` officialsAPI) sends a
 * `Partial<Official>` straight through with no transformation; integration
 * tests import this type so any shape drift fails at compile time.
 *
 * NOTE: schema enforces `level BETWEEN 1 AND 5` (see
 * `supabase/migrations/create-public-content-tables.sql`); a 23514 check
 * violation from Postgres is mapped to 400 by `mapPgError` in `_shared/handler`.
 */
export interface OfficialCreatePayload {
  name: string
  level?: number
  photo_url?: string
  bio?: string
  years_experience?: string
  email?: string
  availability?: string
  certifications?: string[]
  active?: boolean
  priority?: number
}

export interface OfficialUpdatePayload extends Partial<OfficialCreatePayload> {
  id: string
}

export const handler = createHandler({
  name: 'officials',
  auth: { GET: 'public', POST: 'admin_or_executive', PUT: 'admin_or_executive', DELETE: 'admin_or_executive' },
  handler: async ({ event, logger, user }) => {
    switch (event.httpMethod) {
      case 'GET': {
        const { level } = event.queryStringParameters || {}

        let query = supabase
          .from('officials')
          .select('*')
          .order('priority', { ascending: false })
          .order('name', { ascending: true })

        if (level) {
          query = query.eq('level', parseInt(level))
        }

        const { data, error } = await query.limit(200)

        if (error) throw error
        return { statusCode: 200, body: JSON.stringify(data) }
      }

      case 'POST': {
        const body = JSON.parse(event.body || '{}')
        logger.info('crud', 'create_official', `Creating official: ${body.name || 'unnamed'}`, {
          metadata: { name: body.name, level: body.level }
        })

        if (!body.name) {
          return errorResponse({
            code: 'invalid_input',
            message: 'Name is required.',
            fields: { name: 'Name is required' },
          })
        }

        const { data, error } = await supabase
          .from('officials')
          .insert([body])
          .select()
          .single()

        if (error) throw error

        await logger.audit('CREATE', 'official', data.id, {
          actorId: user!.id,
          actorEmail: user!.email,
          newValues: { name: body.name, level: body.level },
          description: `Created official: ${body.name}`
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

        logger.info('crud', 'update_official', `Updating official ${id}`, {
          metadata: { id, updates: Object.keys(updates) }
        })

        const { data, error } = await supabase
          .from('officials')
          .update(updates)
          .eq('id', id)
          .select()
          .single()

        if (error) throw error

        await logger.audit('UPDATE', 'official', id, {
          actorId: user!.id,
          actorEmail: user!.email,
          newValues: updates,
          description: `Updated official ${id}`
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

        logger.info('crud', 'delete_official', `Deleting official ${id}`, { metadata: { id } })

        const { error } = await supabase
          .from('officials')
          .delete()
          .eq('id', id)

        if (error) throw error

        await logger.audit('DELETE', 'official', id, {
          actorId: user!.id,
          actorEmail: user!.email,
          description: `Deleted official ${id}`
        })

        return { statusCode: 204, body: '' }
      }

      default:
        return errorResponse({ code: 'method_not_allowed' })
    }
  }
})
