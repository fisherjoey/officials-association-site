/**
 * Pure roll-up: turn stored game rows + org mappings + manual head-counts into
 * the summary shape StatisticsClient consumes. No DB, no I/O — fully testable.
 *
 * ~3,400 games/season → in-memory aggregation is trivially cheap.
 */
import type {
  RollupGame,
  OrgMapping,
  ManualEntry,
  RollupOptions,
  Rollup,
  LeagueBreakdown,
  TournamentRow,
  CategorySummary,
} from './types'

function inPeriod(game: RollupGame, period: string): boolean {
  if (period === 'ytd') return true
  // period is 'YYYY-MM'
  return !!game.gameDate && game.gameDate.slice(0, 7) === period
}

function buildDistribution(perOfficial: number[]): { range: string; count: number }[] {
  const counts = perOfficial.filter((n) => n > 0)
  if (counts.length === 0) return []
  const max = Math.max(...counts)
  const buckets: { lo: number; hi: number; range: string }[] = [{ lo: 1, hi: 9, range: '1-9' }]
  for (let t = 10; t <= max; t += 10) buckets.push({ lo: t, hi: t + 9, range: `${t}-${t + 9}` })
  return buckets.map((b) => ({
    range: b.range,
    count: counts.filter((c) => c >= b.lo && c <= b.hi).length,
  }))
}

export function computeRollup(
  games: RollupGame[],
  mappings: OrgMapping[],
  manual: ManualEntry | null,
  options: RollupOptions
): Rollup {
  const mapByOrg = new Map<string, OrgMapping>()
  for (const m of mappings) mapByOrg.set(m.billToName, m)

  const active = games.filter(
    (g) => (g.status || 'Normal').toLowerCase() === 'normal' && inPeriod(g, options.period)
  )

  // ---- per-official tallies (drives distribution + min/max/avg) ----
  const perOfficial = new Map<string, number>()
  for (const g of active) for (const off of g.officials) perOfficial.set(off, (perOfficial.get(off) || 0) + 1)
  const counts = [...perOfficial.values()]
  const refereed = counts.length
  const min = refereed ? Math.min(...counts) : 0
  const max = refereed ? Math.max(...counts) : 0
  const average = refereed ? counts.reduce((a, b) => a + b, 0) / refereed : 0

  // ---- league + tournament grouping ----
  const leagueMap = new Map<string, { games: number; assignments: number; levels: Map<string, { games: number; assignments: number }> }>()
  const tournMap = new Map<string, { games: number; assignments: number; category: string | null }>()
  const unmapped = new Set<string>()

  for (const g of active) {
    const org = g.billToName || 'Unknown'
    const mapping = g.billToName ? mapByOrg.get(g.billToName) : undefined

    if (mapping?.kind === 'excluded') continue

    if (mapping?.kind === 'tournament') {
      const name = mapping.displayName || org
      const t = tournMap.get(name) || { games: 0, assignments: 0, category: mapping.category }
      t.games += 1
      t.assignments += g.assignmentCount
      tournMap.set(name, t)
      continue
    }

    // league or unmapped → Unclassified
    const name = mapping?.kind === 'league' ? mapping.displayName || org : 'Unclassified'
    if (!mapping) unmapped.add(org)
    const l = leagueMap.get(name) || { games: 0, assignments: 0, levels: new Map() }
    l.games += 1
    l.assignments += g.assignmentCount
    const level = g.levelName || '—'
    const lv = l.levels.get(level) || { games: 0, assignments: 0 }
    lv.games += 1
    lv.assignments += g.assignmentCount
    l.levels.set(level, lv)
    leagueMap.set(name, l)
  }

  const leagueBreakdown: LeagueBreakdown[] = [...leagueMap.entries()]
    .map(([name, l]) => ({
      name,
      games: l.games,
      assignments: l.assignments,
      subdivisions:
        l.levels.size > 1
          ? [...l.levels.entries()]
              .map(([lname, lv]) => ({ name: lname, games: lv.games, assignments: lv.assignments }))
              .sort((a, b) => b.games - a.games)
          : [],
    }))
    .sort((a, b) => b.games - a.games)

  const tournBreakdown: TournamentRow[] = [...tournMap.entries()]
    .map(([name, t]) => ({ name, count: 1, games: t.games, assignments: t.assignments, category: t.category }))
    .sort((a, b) => b.games - a.games)

  const catMap = new Map<string, CategorySummary>()
  for (const t of tournBreakdown) {
    const cat = t.category || 'Other'
    const c = catMap.get(cat) || { name: cat, count: 0, games: 0, assignments: 0 }
    c.count += 1
    c.games += t.games
    c.assignments += t.assignments
    catMap.set(cat, c)
  }

  return {
    season: options.season,
    period: options.period,
    officials: {
      active: manual?.activeOfficials ?? null,
      ready: manual?.readyOfficials ?? null,
      refereed,
    },
    assignments: {
      totalGames: active.length,
      totalAssignments: active.reduce((a, g) => a + g.assignmentCount, 0),
      min,
      max,
      average,
    },
    distribution: buildDistribution(counts),
    leagues: {
      totalGames: leagueBreakdown.reduce((a, l) => a + l.games, 0),
      totalAssignments: leagueBreakdown.reduce((a, l) => a + l.assignments, 0),
      breakdown: leagueBreakdown,
    },
    tournaments: {
      total: tournBreakdown.length,
      totalGames: tournBreakdown.reduce((a, t) => a + t.games, 0),
      totalAssignments: tournBreakdown.reduce((a, t) => a + t.assignments, 0),
      byCategory: [...catMap.values()].sort((a, b) => b.games - a.games),
      breakdown: tournBreakdown,
    },
    unmappedOrgs: [...unmapped].sort(),
  }
}
