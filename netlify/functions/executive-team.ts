import { createHandler, supabase, errorResponse } from './_shared/handler'

/**
 * Wire shape POSTed to /.netlify/functions/executive-team. Integration
 * tests bind to this so any shape drift fails at compile time.
 */
export interface ExecutiveTeamCreatePayload {
  name: string
  position: string
  email: string
  image_url?: string | null
  bio?: string | null
  active?: boolean
  priority?: number
}

export interface ExecutiveTeamUpdatePayload extends Partial<ExecutiveTeamCreatePayload> {
  id: string
}

export const handler = createHandler({
  name: 'executive-team',
  auth: { GET: 'public', POST: 'admin', PUT: 'admin', DELETE: 'admin' },
  handler: async ({ event, logger, user }) => {
    switch (event.httpMethod) {
      case 'GET': {
        const { active } = event.queryStringParameters || {}

        let query = supabase
          .from('executive_team')
          .select('*')
          .order('priority', { ascending: false })
          .order('name', { ascending: true })

        if (active !== 'false') {
          query = query.eq('active', true)
        }

        const { data, error } = await query

        if (error) throw error
        return { statusCode: 200, body: JSON.stringify(data) }
      }

      case 'POST': {
        const body = JSON.parse(event.body || '{}')
        logger.info('crud', 'create_executive', `Creating executive member: ${body.name || 'unnamed'}`, {
          metadata: { name: body.name, position: body.position }
        })

        if (!body.name || !body.position || !body.email) {
          const fields: Record<string, string> = {}
          if (!body.name) fields.name = 'Name is required'
          if (!body.position) fields.position = 'Position is required'
          if (!body.email) fields.email = 'Email is required'
          return errorResponse({
            code: 'invalid_input',
            message: 'Name, position, and email are all required.',
            fields,
          })
        }

        const { data, error } = await supabase
          .from('executive_team')
          .insert([{
            name: body.name,
            position: body.position,
            email: body.email,
            image_url: body.image_url || null,
            bio: body.bio || null,
            active: body.active ?? true,
            priority: body.priority || 0
          }])
          .select()
          .single()

        if (error) throw error

        await logger.audit('CREATE', 'executive_team', data.id, {
          actorId: user!.id,
          actorEmail: user!.email,
          newValues: { name: body.name, position: body.position },
          description: `Created executive member: ${body.name}`
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

        logger.info('crud', 'update_executive', `Updating executive member ${id}`, {
          metadata: { id, updates: Object.keys(updates) }
        })

        const { data, error } = await supabase
          .from('executive_team')
          .update(updates)
          .eq('id', id)
          .select()
          .single()

        if (error) throw error

        await logger.audit('UPDATE', 'executive_team', id, {
          actorId: user!.id,
          actorEmail: user!.email,
          newValues: updates,
          description: `Updated executive member ${id}`
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

        logger.info('crud', 'delete_executive', `Deleting executive member ${id}`, { metadata: { id } })

        const { error } = await supabase
          .from('executive_team')
          .delete()
          .eq('id', id)

        if (error) throw error

        await logger.audit('DELETE', 'executive_team', id, {
          actorId: user!.id,
          actorEmail: user!.email,
          description: `Deleted executive member ${id}`
        })

        return { statusCode: 204, body: '' }
      }

      default:
        return errorResponse({ code: 'method_not_allowed' })
    }
  }
})
