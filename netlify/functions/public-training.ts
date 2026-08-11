import { createHandler, supabase, errorResponse } from './_shared/handler'

export const handler = createHandler({
  name: 'public-training',
  auth: { GET: 'public', POST: 'admin_or_executive', PUT: 'admin_or_executive', DELETE: 'admin_or_executive' },
  handler: async ({ event, logger, user }) => {
    switch (event.httpMethod) {
      case 'GET': {
        const { slug } = event.queryStringParameters || {}

        if (slug) {
          const { data, error } = await supabase
            .from('public_training_events')
            .select('*')
            .eq('slug', slug)
            .single()

          if (error) throw error

          if (!data) {
            return errorResponse({
            code: 'not_found',
            message: 'Training event not found.'.replace('..', '.'),
          })
          }

          return { statusCode: 200, body: JSON.stringify(data) }
        }

        const { data, error } = await supabase
          .from('public_training_events')
          .select('*')
          .order('priority', { ascending: false })
          .order('event_date', { ascending: true })
          .limit(200)

        if (error) throw error
        return { statusCode: 200, body: JSON.stringify(data) }
      }

      case 'POST': {
        const body = JSON.parse(event.body || '{}')
        logger.info('crud', 'create_training_event', `Creating training event: ${body.title || 'untitled'}`, {
          metadata: { title: body.title, event_type: body.event_type }
        })

        if (!body.title || !body.slug || !body.event_date || !body.start_time || !body.end_time || !body.location || !body.event_type || !body.description) {
          return errorResponse({
            code: 'invalid_input',
            message: 'Title, slug, event date, start time, end time, location, event type, and description are all required.',
          })
        }

        const { data, error } = await supabase
          .from('public_training_events')
          .insert([body])
          .select()
          .single()

        if (error) throw error

        await logger.audit('CREATE', 'training_event', data.id, {
          actorId: user!.id,
          actorEmail: user!.email,
          newValues: { title: body.title, event_type: body.event_type },
          description: `Created training event: ${body.title}`
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

        logger.info('crud', 'update_training_event', `Updating training event ${id}`, {
          metadata: { id, updates: Object.keys(updates) }
        })

        const { data, error } = await supabase
          .from('public_training_events')
          .update(updates)
          .eq('id', id)
          .select()
          .single()

        if (error) throw error

        await logger.audit('UPDATE', 'training_event', id, {
          actorId: user!.id,
          actorEmail: user!.email,
          newValues: updates,
          description: `Updated training event ${id}`
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

        logger.info('crud', 'delete_training_event', `Deleting training event ${id}`, { metadata: { id } })

        const { error } = await supabase
          .from('public_training_events')
          .delete()
          .eq('id', id)

        if (error) throw error

        await logger.audit('DELETE', 'training_event', id, {
          actorId: user!.id,
          actorEmail: user!.email,
          description: `Deleted training event ${id}`
        })

        return { statusCode: 204, body: '' }
      }

      default:
        return errorResponse({ code: 'method_not_allowed' })
    }
  }
})
