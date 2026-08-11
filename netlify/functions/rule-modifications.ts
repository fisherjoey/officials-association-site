import { createHandler, supabase, errorResponse } from './_shared/handler'
import { RULE_CATEGORIES } from '../../lib/schemas/rule-modification'

// Single source of truth: same enum the frontend dropdown uses.
const VALID_CATEGORIES = new Set<string>(RULE_CATEGORIES)

export const handler = createHandler({
  name: 'rule-modifications',
  auth: { GET: 'authenticated', POST: 'admin_or_executive', PUT: 'admin_or_executive', DELETE: 'admin_or_executive' },
  handler: async ({ event, logger, user }) => {
    switch (event.httpMethod) {
      case 'GET': {
        // ?active=true (default) — only active rows
        // ?active=false        — only deactivated rows
        // ?active=all          — both
        const activeParam = event.queryStringParameters?.active ?? 'true'

        let query = supabase
          .from('rule_modifications')
          .select('*')
          .order('priority', { ascending: false })
          .limit(200)

        if (activeParam === 'false') {
          query = query.eq('active', false)
        } else if (activeParam !== 'all') {
          query = query.eq('active', true)
        }

        const { data, error } = await query

        if (error) throw error

        return { statusCode: 200, body: JSON.stringify(data) }
      }

      case 'POST': {
        const body = JSON.parse(event.body || '{}')
        logger.info('crud', 'create_rule_modification', `Creating rule modification: ${body.title || 'untitled'}`, {
          metadata: { title: body.title, league: body.league }
        })

        if (body.category !== undefined && !VALID_CATEGORIES.has(body.category)) {
          return errorResponse({
            code: 'invalid_input',
            message: `Invalid category. Expected one of: ${Array.from(VALID_CATEGORIES).join(', ')}`,
            fields: { category: 'Choose a category from the list' },
          })
        }

        const { data, error } = await supabase
          .from('rule_modifications')
          .insert([body])
          .select()
          .single()

        if (error) throw error

        await logger.audit('CREATE', 'rule_modification', data.id, {
          actorId: user!.id,
          actorEmail: user!.email,
          newValues: { title: body.title, league: body.league },
          description: `Created rule modification: ${body.title}`
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

        logger.info('crud', 'update_rule_modification', `Updating rule modification ${id}`, {
          metadata: { id, updates: Object.keys(updates) }
        })

        const { data, error } = await supabase
          .from('rule_modifications')
          .update(updates)
          .eq('id', id)
          .select()
          .single()

        if (error) throw error

        await logger.audit('UPDATE', 'rule_modification', id, {
          actorId: user!.id,
          actorEmail: user!.email,
          newValues: updates,
          description: `Updated rule modification ${id}`
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

        logger.info('crud', 'delete_rule_modification', `Deleting rule modification ${id}`, { metadata: { id } })

        const { error } = await supabase
          .from('rule_modifications')
          .delete()
          .eq('id', id)

        if (error) throw error

        await logger.audit('DELETE', 'rule_modification', id, {
          actorId: user!.id,
          actorEmail: user!.email,
          description: `Deleted rule modification ${id}`
        })

        return { statusCode: 204, body: '' }
      }

      default:
        return errorResponse({ code: 'method_not_allowed' })
    }
  }
})
