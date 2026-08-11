import { createHandler, supabase, errorResponse } from './_shared/handler'

export const handler = createHandler({
  name: 'public-pages',
  auth: { GET: 'public', POST: 'admin', PUT: 'admin', DELETE: 'admin' },
  handler: async ({ event, logger, user }) => {
    switch (event.httpMethod) {
      case 'GET': {
        const { page_name } = event.queryStringParameters || {}

        if (page_name) {
          const { data, error } = await supabase
            .from('public_pages')
            .select('*')
            .eq('page_name', page_name)
            .eq('active', true)
            .single()

          if (error) throw error

          if (!data) {
            return errorResponse({
            code: 'not_found',
            message: 'Page not found.'.replace('..', '.'),
          })
          }

          return { statusCode: 200, body: JSON.stringify(data) }
        }

        const { data, error } = await supabase
          .from('public_pages')
          .select('*')
          .order('page_name', { ascending: true })

        if (error) throw error
        return { statusCode: 200, body: JSON.stringify(data) }
      }

      case 'POST': {
        const body = JSON.parse(event.body || '{}')
        logger.info('crud', 'create_public_page', `Creating page: ${body.page_name || 'unnamed'}`, {
          metadata: { page_name: body.page_name, title: body.title }
        })

        if (!body.page_name || !body.title || !body.content) {
          const fields: Record<string, string> = {}
          if (!body.page_name) fields.page_name = 'Page name is required'
          if (!body.title) fields.title = 'Title is required'
          if (!body.content) fields.content = 'Content is required'
          return errorResponse({
            code: 'invalid_input',
            message: 'Page name, title, and content are all required.',
            fields,
          })
        }

        const { data, error } = await supabase
          .from('public_pages')
          .insert([body])
          .select()
          .single()

        if (error) throw error

        await logger.audit('CREATE', 'page', data.id, {
          actorId: user!.id,
          actorEmail: user!.email,
          newValues: { page_name: body.page_name, title: body.title },
          description: `Created page: ${body.page_name}`
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

        logger.info('crud', 'update_public_page', `Updating page ${id}`, {
          metadata: { id, updates: Object.keys(updates) }
        })

        const { data, error } = await supabase
          .from('public_pages')
          .update(updates)
          .eq('id', id)
          .select()
          .single()

        if (error) throw error

        await logger.audit('UPDATE', 'page', id, {
          actorId: user!.id,
          actorEmail: user!.email,
          newValues: updates,
          description: `Updated page ${id}`
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

        logger.info('crud', 'delete_public_page', `Deleting page ${id}`, { metadata: { id } })

        const { error } = await supabase
          .from('public_pages')
          .delete()
          .eq('id', id)

        if (error) throw error

        await logger.audit('DELETE', 'page', id, {
          actorId: user!.id,
          actorEmail: user!.email,
          description: `Deleted page ${id}`
        })

        return { statusCode: 204, body: '' }
      }

      default:
        return errorResponse({ code: 'method_not_allowed' })
    }
  }
})
