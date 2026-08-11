import { createHandler, supabase, errorResponse } from './_shared/handler'

export const handler = createHandler({
  name: 'newsletters',
  auth: { GET: 'authenticated', POST: 'admin_or_executive', PUT: 'admin_or_executive', DELETE: 'admin_or_executive' },
  handler: async ({ event, logger, user }) => {
    switch (event.httpMethod) {
      case 'GET': {
        const { data, error } = await supabase
          .from('newsletters')
          .select('*')
          .order('date', { ascending: false })
          .limit(200)

        if (error) throw error

        return { statusCode: 200, body: JSON.stringify(data) }
      }

      case 'POST': {
        const body = JSON.parse(event.body || '{}')
        logger.info('crud', 'create_newsletter', `Creating newsletter: ${body.title || 'untitled'}`, {
          metadata: { title: body.title }
        })

        // is_featured is a BOOLEAN column. Postgres rejects non-booleans
        // with 22P02 → 400 via mapPgError, but reject explicitly so callers
        // get a stable error shape regardless of how the driver coerces.
        if (body.is_featured !== undefined && typeof body.is_featured !== 'boolean') {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: 'is_featured must be a boolean' })
          }
        }

        const { data, error } = await supabase
          .from('newsletters')
          .insert([body])
          .select()
          .single()

        if (error) throw error

        await logger.audit('CREATE', 'newsletter', data.id, {
          actorId: user!.id,
          actorEmail: user!.email,
          newValues: { title: body.title },
          description: `Created newsletter: ${body.title}`
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

        logger.info('crud', 'update_newsletter', `Updating newsletter ${id}`, {
          metadata: { id, updates: Object.keys(updates) }
        })

        const { data, error } = await supabase
          .from('newsletters')
          .update(updates)
          .eq('id', id)
          .select()
          .single()

        if (error) throw error

        await logger.audit('UPDATE', 'newsletter', id, {
          actorId: user!.id,
          actorEmail: user!.email,
          newValues: updates,
          description: `Updated newsletter ${id}`
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

        logger.info('crud', 'delete_newsletter', `Deleting newsletter ${id}`, { metadata: { id } })

        const { error } = await supabase
          .from('newsletters')
          .delete()
          .eq('id', id)

        if (error) throw error

        await logger.audit('DELETE', 'newsletter', id, {
          actorId: user!.id,
          actorEmail: user!.email,
          description: `Deleted newsletter ${id}`
        })

        return { statusCode: 204, body: '' }
      }

      default:
        return errorResponse({ code: 'method_not_allowed' })
    }
  }
})
