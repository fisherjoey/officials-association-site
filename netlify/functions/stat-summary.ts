import { createHandler, supabase } from './_shared/handler'
import { computeRollup } from '../../lib/stats/rollup'
import type { RollupGame, OrgMapping, ManualEntry } from '../../lib/stats/types'

const PAGE = 1000

/** Fetch every stat_games row for a season, paginated past the 1000-row cap. */
async function fetchSeasonGames(season: string): Promise<RollupGame[]> {
  const games: RollupGame[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('stat_games')
      .select('game_date, status, bill_to_name, level_name, officials, assignment_count')
      .eq('season', season)
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    for (const r of data) {
      games.push({
        gameDate: r.game_date,
        status: r.status,
        billToName: r.bill_to_name,
        levelName: r.level_name,
        officials: Array.isArray(r.officials) ? r.officials : [],
        assignmentCount: r.assignment_count || 0,
      })
    }
    if (data.length < PAGE) break
  }
  return games
}

/**
 * Season Stats roll-up (read side). GET ?season=&period=
 * Returns the summary shape StatisticsClient consumes, plus meta.
 */
export const handler = createHandler({
  name: 'stat-summary',
  auth: { GET: 'authenticated' },
  methods: ['GET'],
  handler: async ({ event }) => {
    const q = event.queryStringParameters || {}
    const period = q.period || 'ytd'

    // Available seasons (most recent first) + default season.
    const { data: seasonRows, error: sErr } = await supabase
      .from('stat_games')
      .select('season')
      .order('season', { ascending: false })
    if (sErr) throw sErr
    const seasons = [...new Set((seasonRows || []).map((r) => r.season))]
    const season = q.season || seasons[0]

    if (!season) {
      // No data ingested yet.
      return {
        statusCode: 200,
        body: JSON.stringify({ empty: true, seasons: [], season: null, rollup: null }),
      }
    }

    const [games, mapRes, manualRes, lastImportRes] = await Promise.all([
      fetchSeasonGames(season),
      supabase.from('stat_org_mappings').select('bill_to_name, display_name, kind, category, active'),
      supabase.from('stat_manual_entries').select('active_officials, ready_officials').eq('season', season).eq('period', period).maybeSingle(),
      supabase.from('stat_game_imports').select('filename, created_at, season').eq('season', season).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    if (mapRes.error) throw mapRes.error

    const mappings: OrgMapping[] = (mapRes.data || []).map((m) => ({
      billToName: m.bill_to_name,
      displayName: m.display_name,
      kind: m.kind,
      category: m.category,
      active: m.active,
    }))
    const manual: ManualEntry | null = manualRes.data
      ? { activeOfficials: manualRes.data.active_officials, readyOfficials: manualRes.data.ready_officials }
      : null

    const rollup = computeRollup(games, mappings, manual, { season, period })

    return {
      statusCode: 200,
      body: JSON.stringify({
        empty: games.length === 0,
        seasons,
        season,
        period,
        rollup,
        lastImport: lastImportRes.data || null,
      }),
    }
  },
})
