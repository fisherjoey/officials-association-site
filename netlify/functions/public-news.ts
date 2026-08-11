import { createHandler, supabase, errorResponse } from './_shared/handler'

export const handler = createHandler({
  name: 'public-news',
  auth: { GET: 'public', POST: 'admin_or_executive', PUT: 'admin_or_executive', DELETE: 'admin_or_executive' },
  handler: async ({ event, logger, user }) => {
    switch (event.httpMethod) {
      case 'GET': {
        const { slug } = event.queryStringParameters || {}

        if (slug) {
          const { data, error } = await supabase
            .from('public_news')
            .select('*')
            .eq('slug', slug)
            .single()

          if (error) throw error

          if (!data) {
            return errorResponse({
            code: 'not_found',
            message: 'News article not found.'.replace('..', '.'),
          })
          }

          return { statusCode: 200, body: JSON.stringify(data) }
        }

        const { data, error } = await supabase
          .from('public_news')
          .select('*')
          .order('priority', { ascending: false })
          .order('published_date', { ascending: false })
          .limit(200)

        if (error) throw error
        return { statusCode: 200, body: JSON.stringify(data) }
      }

      case 'POST': {
        const body = JSON.parse(event.body || '{}')
        logger.info('crud', 'create_public_news', `Creating news article: ${body.title || 'untitled'}`, {
          metadata: { title: body.title, slug: body.slug, author: body.author }
        })

        if (!body.title || !body.slug || !body.published_date || !body.author || !body.excerpt || !body.body) {
          const fields: Record<string, string> = {}
          if (!body.title) fields.title = 'Title is required'
          if (!body.slug) fields.slug = 'Slug is required'
          if (!body.published_date) fields.published_date = 'Published date is required'
          if (!body.author) fields.author = 'Author is required'
          if (!body.excerpt) fields.excerpt = 'Excerpt is required'
          if (!body.body) fields.body = 'Body is required'
          return errorResponse({
            code: 'invalid_input',
            message: 'Title, slug, published date, author, excerpt, and body are all required.',
            fields,
          })
        }

        // Postgres surfaces malformed timestamps as 22007, which mapPgError
        // doesn't recognize — pre-validate so the caller gets a clean 400
        // instead of bubbling into the 500 catch-all.
        if (Number.isNaN(Date.parse(body.published_date))) {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Invalid value format', column: 'published_date' })
          }
        }

        const { data, error } = await supabase
          .from('public_news')
          .insert([body])
          .select()
          .single()

        if (error) throw error

        await logger.audit('CREATE', 'news', data.id, {
          actorId: user!.id,
          actorEmail: user!.email,
          newValues: { title: body.title, slug: body.slug },
          description: `Created news article: ${body.title}`
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

        logger.info('crud', 'update_public_news', `Updating news article ${id}`, {
          metadata: { id, updates: Object.keys(updates) }
        })

        const { data, error } = await supabase
          .from('public_news')
          .update(updates)
          .eq('id', id)
          .select()
          .single()

        if (error) throw error

        await logger.audit('UPDATE', 'news', id, {
          actorId: user!.id,
          actorEmail: user!.email,
          newValues: updates,
          description: `Updated news article ${id}`
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

        logger.info('crud', 'delete_public_news', `Deleting news article ${id}`, { metadata: { id } })

        const { error } = await supabase
          .from('public_news')
          .delete()
          .eq('id', id)

        if (error) throw error

        await logger.audit('DELETE', 'news', id, {
          actorId: user!.id,
          actorEmail: user!.email,
          description: `Deleted news article ${id}`
        })

        return { statusCode: 204, body: '' }
      }

      default:
        return errorResponse({ code: 'method_not_allowed' })
    }
  }
})
