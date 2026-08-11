import { createHandler, supabase, errorResponse } from './_shared/handler'

export const handler = createHandler({
  name: 'scheduler-updates',
  auth: { GET: 'authenticated', POST: 'admin_or_executive', PUT: 'admin_or_executive', DELETE: 'admin_or_executive' },
  handler: async ({ event, logger, user }) => {
    switch (event.httpMethod) {
      case 'GET': {
        const { data, error } = await supabase
          .from('scheduler_updates')
          .select('*')
          .order('date', { ascending: false })
          .limit(200)

        if (error) throw error

        return {
          statusCode: 200,
          body: JSON.stringify(data)
        }
      }

      case 'POST': {
        const body = JSON.parse(event.body || '{}')

        logger.info('crud', 'create_scheduler_update', `Creating scheduler update: ${body.title || 'untitled'}`, {
          metadata: { title: body.title }
        })

        // Postgres returns 22007 for malformed timestamps, which mapPgError
        // doesn't recognize. Validate up front so callers get a clean 400.
        if (body.date !== undefined && body.date !== null && body.date !== '') {
          const ts = new Date(body.date)
          if (Number.isNaN(ts.getTime())) {
            return {
              statusCode: 400,
              body: JSON.stringify({ error: 'Invalid date format' })
            }
          }
        }

        const { data, error } = await supabase
          .from('scheduler_updates')
          .insert([{
            ...body,
            date: body.date || new Date().toISOString()
          }])
          .select()

        if (error) throw error

        await logger.audit('CREATE', 'scheduler_update', data[0].id, {
          actorId: user!.id,
          actorEmail: user!.email,
          newValues: { title: body.title },
          description: `Created scheduler update: ${body.title}`
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
            message: 'A record must be selected for update.',
          })
        }

        logger.info('crud', 'update_scheduler_update', `Updating scheduler update ${id}`, {
          metadata: { id, updates: Object.keys(updateData) }
        })

        const { data, error } = await supabase
          .from('scheduler_updates')
          .update({ ...updateData, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()

        if (error) throw error

        if (!data || data.length === 0) {
          return {
            statusCode: 404,
            body: JSON.stringify({ error: 'Not found' })
          }
        }

        await logger.audit('UPDATE', 'scheduler_update', id, {
          actorId: user!.id,
          actorEmail: user!.email,
          newValues: updateData,
          description: `Updated scheduler update ${id}`
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
            message: 'A record must be selected for deletion.',
          })
        }

        logger.info('crud', 'delete_scheduler_update', `Deleting scheduler update ${id}`, {
          metadata: { id }
        })

        const { error } = await supabase
          .from('scheduler_updates')
          .delete()
          .eq('id', id)

        if (error) throw error

        await logger.audit('DELETE', 'scheduler_update', id, {
          actorId: user!.id,
          actorEmail: user!.email,
          description: `Deleted scheduler update ${id}`
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
