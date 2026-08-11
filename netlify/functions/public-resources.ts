import { createHandler, supabase, errorResponse } from './_shared/handler'

export const handler = createHandler({
  name: 'public-resources',
  auth: { GET: 'public', POST: 'admin_or_executive', PUT: 'admin_or_executive', DELETE: 'admin_or_executive' },
  handler: async ({ event, logger, user }) => {
    switch (event.httpMethod) {
      case 'GET': {
        const { slug, category } = event.queryStringParameters || {}

        if (slug) {
          const { data, error } = await supabase
            .from('public_resources')
            .select('*')
            .eq('slug', slug)
            .single()

          if (error) throw error

          if (!data) {
            return errorResponse({
            code: 'not_found',
            message: 'Resource not found.'.replace('..', '.'),
          })
          }

          return { statusCode: 200, body: JSON.stringify(data) }
        }

        let query = supabase
          .from('public_resources')
          .select('*')
          .order('priority', { ascending: false })
          .order('last_updated', { ascending: false })

        if (category) {
          query = query.eq('category', category)
        }

        const { data, error } = await query.limit(200)

        if (error) throw error
        return { statusCode: 200, body: JSON.stringify(data) }
      }

      case 'POST': {
        const body = JSON.parse(event.body || '{}')
        logger.info('crud', 'create_public_resource', `Creating resource: ${body.title || 'untitled'}`, {
          metadata: { title: body.title, category: body.category }
        })

        if (!body.title || !body.slug || !body.category || !body.description || !body.last_updated) {
          const fields: Record<string, string> = {}
          if (!body.title) fields.title = 'Title is required'
          if (!body.slug) fields.slug = 'Slug is required'
          if (!body.category) fields.category = 'Category is required'
          if (!body.description) fields.description = 'Description is required'
          if (!body.last_updated) fields.last_updated = 'Last updated is required'
          return errorResponse({
            code: 'invalid_input',
            message: 'Title, slug, category, description, and last updated are all required.',
            fields,
          })
        }

        const { data, error } = await supabase
          .from('public_resources')
          .insert([body])
          .select()
          .single()

        if (error) throw error

        await logger.audit('CREATE', 'public_resource', data.id, {
          actorId: user!.id,
          actorEmail: user!.email,
          newValues: { title: body.title, category: body.category },
          description: `Created public resource: ${body.title}`
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

        logger.info('crud', 'update_public_resource', `Updating resource ${id}`, {
          metadata: { id, updates: Object.keys(updates) }
        })

        const { data, error } = await supabase
          .from('public_resources')
          .update(updates)
          .eq('id', id)
          .select()
          .single()

        if (error) throw error

        await logger.audit('UPDATE', 'public_resource', id, {
          actorId: user!.id,
          actorEmail: user!.email,
          newValues: updates,
          description: `Updated public resource ${id}`
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

        logger.info('crud', 'delete_public_resource', `Deleting resource ${id}`, { metadata: { id } })

        const { error } = await supabase
          .from('public_resources')
          .delete()
          .eq('id', id)

        if (error) throw error

        await logger.audit('DELETE', 'public_resource', id, {
          actorId: user!.id,
          actorEmail: user!.email,
          description: `Deleted public resource ${id}`
        })

        return { statusCode: 204, body: '' }
      }

      default:
        return errorResponse({ code: 'method_not_allowed' })
    }
  }
})
