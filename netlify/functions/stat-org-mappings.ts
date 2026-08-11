import { createHandler, supabase, errorResponse } from './_shared/handler'

/**
 * Org -> league/tournament classifications.
 *   GET    — list all mappings (+ optional ?unmappedForSeason= to include orgs
 *            seen in data but not yet mapped).
 *   POST   — upsert a mapping by bill_to_name.
 *   DELETE — remove a mapping (?id= or ?billToName=).
 */
export const handler = createHandler({
  name: 'stat-org-mappings',
  auth: { GET: 'authenticated', POST: 'admin_or_executive', PUT: 'admin_or_executive', DELETE: 'admin_or_executive' },
  handler: async ({ event, logger, user }) => {
    switch (event.httpMethod) {
      case 'GET': {
        const { data: maps, error } = await supabase
          .from('stat_org_mappings')
          .select('*')
          .order('kind', { ascending: true })
          .order('display_name', { ascending: true })
        if (error) throw error

        // Optionally surface orgs present in a season's games with no mapping.
        const season = event.queryStringParameters?.unmappedForSeason
        let unmapped: { billToName: string; games: number }[] = []
        if (season) {
          const mapped = new Set((maps || []).map((m) => m.bill_to_name))
          const { data: games, error: gErr } = await supabase
            .from('stat_games')
            .select('bill_to_name')
            .eq('season', season)
          if (gErr) throw gErr
          const counts = new Map<string, number>()
          for (const g of games || []) {
            if (g.bill_to_name && !mapped.has(g.bill_to_name)) {
              counts.set(g.bill_to_name, (counts.get(g.bill_to_name) || 0) + 1)
            }
          }
          unmapped = [...counts.entries()]
            .map(([billToName, gamesCount]) => ({ billToName, games: gamesCount }))
            .sort((a, b) => b.games - a.games)
        }

        return { statusCode: 200, body: JSON.stringify({ mappings: maps, unmapped }) }
      }

      case 'POST':
      case 'PUT': {
        const body = JSON.parse(event.body || '{}') as {
          billToName?: string
          displayName?: string
          kind?: string
          category?: string | null
        }
        if (!body.billToName || !body.displayName || !body.kind) {
          return errorResponse({ code: 'invalid_input', message: 'billToName, displayName and kind are required.' })
        }
        if (!['league', 'tournament', 'excluded'].includes(body.kind)) {
          return errorResponse({ code: 'invalid_input', message: 'kind must be league, tournament or excluded.' })
        }

        const { data, error } = await supabase
          .from('stat_org_mappings')
          .upsert(
            {
              bill_to_name: body.billToName,
              display_name: body.displayName,
              kind: body.kind,
              category: body.category ?? null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'bill_to_name' }
          )
          .select()
          .single()
        if (error) throw error

        await logger.audit('UPDATE', 'stat_mapping', data.id, {
          actorId: user!.id,
          actorEmail: user!.email,
          newValues: { billToName: body.billToName, kind: body.kind, category: body.category },
          description: `Classified "${body.billToName}" as ${body.kind}${body.category ? ` (${body.category})` : ''}`,
        })

        return { statusCode: 200, body: JSON.stringify(data) }
      }

      case 'DELETE': {
        const { id, billToName } = event.queryStringParameters || {}
        if (!id && !billToName) {
          return errorResponse({ code: 'invalid_input', message: 'id or billToName is required.' })
        }
        const query = supabase.from('stat_org_mappings').delete()
        const { error } = id ? await query.eq('id', id) : await query.eq('bill_to_name', billToName!)
        if (error) throw error
        return { statusCode: 204, body: '' }
      }

      default:
        return errorResponse({ code: 'method_not_allowed' })
    }
  },
})
