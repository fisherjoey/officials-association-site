import { createHandler, supabase, errorResponse } from './_shared/handler'

/**
 * Active/Ready official head-counts per period.
 *   GET — ?season=&period= (defaults period=ytd) -> the entry or null.
 *   PUT — upsert the entry for (season, period).
 */
export const handler = createHandler({
  name: 'stat-manual-entries',
  auth: { GET: 'authenticated', PUT: 'admin_or_executive', POST: 'admin_or_executive' },
  handler: async ({ event, user }) => {
    switch (event.httpMethod) {
      case 'GET': {
        const { season, period } = event.queryStringParameters || {}
        if (!season) return errorResponse({ code: 'invalid_input', message: 'season is required.' })
        const { data, error } = await supabase
          .from('stat_manual_entries')
          .select('*')
          .eq('season', season)
          .eq('period', period || 'ytd')
          .maybeSingle()
        if (error) throw error
        return { statusCode: 200, body: JSON.stringify(data) }
      }

      case 'POST':
      case 'PUT': {
        const body = JSON.parse(event.body || '{}') as {
          season?: string
          period?: string
          activeOfficials?: number | null
          readyOfficials?: number | null
        }
        if (!body.season) return errorResponse({ code: 'invalid_input', message: 'season is required.' })

        const { data, error } = await supabase
          .from('stat_manual_entries')
          .upsert(
            {
              season: body.season,
              period: body.period || 'ytd',
              active_officials: body.activeOfficials ?? null,
              ready_officials: body.readyOfficials ?? null,
              updated_by: user!.id,
              updated_by_email: user!.email,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'season,period' }
          )
          .select()
          .single()
        if (error) throw error

        return { statusCode: 200, body: JSON.stringify(data) }
      }

      default:
        return errorResponse({ code: 'method_not_allowed' })
    }
  },
})
