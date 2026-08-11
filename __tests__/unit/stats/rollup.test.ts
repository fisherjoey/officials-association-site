import { computeRollup } from '@/lib/stats/rollup'
import type { RollupGame, OrgMapping } from '@/lib/stats/types'

const SEASON = '2025-2026'

const mappings: OrgMapping[] = [
  { billToName: 'Senior Mens Assoc', displayName: 'Example Senior Mens', kind: 'league', category: null },
  { billToName: 'Example Jr High', displayName: 'Example Junior High', kind: 'league', category: null },
  { billToName: 'Example High School', displayName: 'Example High School', kind: 'tournament', category: 'High School' },
]

const games: RollupGame[] = [
  { gameDate: '2025-09-08', status: 'Normal', billToName: 'Senior Mens Assoc', levelName: 'Mens Div 1', officials: ['A', 'B'], assignmentCount: 2 },
  { gameDate: '2025-09-15', status: 'Normal', billToName: 'Senior Mens Assoc', levelName: 'Mens Div 2', officials: ['A', 'C'], assignmentCount: 2 },
  { gameDate: '2025-10-02', status: 'Normal', billToName: 'Example Jr High', levelName: 'JH Sr Boys', officials: ['B'], assignmentCount: 1 },
  { gameDate: '2025-09-20', status: 'Normal', billToName: 'Example High School', levelName: 'Sr Boys', officials: ['A', 'B', 'C'], assignmentCount: 3 },
  { gameDate: '2025-10-05', status: 'Normal', billToName: 'Unknown Org', levelName: 'X', officials: ['D'], assignmentCount: 1 },
  { gameDate: '2025-09-25', status: 'Cancelled', billToName: 'Senior Mens Assoc', levelName: 'Mens Div 1', officials: ['A', 'B'], assignmentCount: 2 },
]

describe('computeRollup (season / YTD)', () => {
  const r = computeRollup(games, mappings, { activeOfficials: 242, ready: null } as any, { season: SEASON, period: 'ytd' })

  it('excludes cancelled games from all totals', () => {
    // 5 Normal games (the 6th is Cancelled)
    expect(r.assignments.totalGames).toBe(5)
    expect(r.assignments.totalAssignments).toBe(2 + 2 + 1 + 3 + 1)
  })

  it('computes per-official min/max/average over officials who reffed', () => {
    // A:3 (g1,g2,g4)  B:3 (g1,g3,g4)  C:2 (g2,g4)  D:1 (g5) — cancelled game ignored
    expect(r.officials.refereed).toBe(4)
    expect(r.assignments.min).toBe(1)
    expect(r.assignments.max).toBe(3)
    expect(r.assignments.average).toBeCloseTo(2.25, 5)
  })

  it('passes through manual head-counts', () => {
    expect(r.officials.active).toBe(242)
    expect(r.officials.ready).toBeNull()
  })

  it('buckets the games-per-official distribution and drops trailing empties', () => {
    const b19 = r.distribution.find((d) => d.range === '1-9')
    expect(b19?.count).toBe(4)
    // no bucket beyond the max should be present
    expect(r.distribution.some((d) => d.count === 0 && d.range !== '1-9')).toBe(false)
  })

  it('groups leagues with subdivisions and keeps tournaments separate', () => {
    const sm = r.leagues.breakdown.find((l) => l.name === 'Example Senior Mens')
    expect(sm).toBeTruthy()
    expect(sm!.games).toBe(2)
    expect(sm!.assignments).toBe(4)
    expect(sm!.subdivisions).toEqual(
      expect.arrayContaining([
        { name: 'Mens Div 1', games: 1, assignments: 2 },
        { name: 'Mens Div 2', games: 1, assignments: 2 },
      ])
    )
    // Example High School is a tournament, must not appear as a league
    expect(r.leagues.breakdown.some((l) => l.name === 'Example High School')).toBe(false)
  })

  it('surfaces unmapped orgs and still counts their games under Unclassified', () => {
    expect(r.unmappedOrgs).toEqual(['Unknown Org'])
    const unc = r.leagues.breakdown.find((l) => l.name === 'Unclassified')
    expect(unc!.games).toBe(1)
  })

  it('rolls up tournaments by category', () => {
    expect(r.tournaments.total).toBe(1)
    expect(r.tournaments.totalGames).toBe(1)
    expect(r.tournaments.totalAssignments).toBe(3)
    expect(r.tournaments.byCategory).toEqual([
      { name: 'High School', count: 1, games: 1, assignments: 3 },
    ])
    expect(r.tournaments.breakdown[0]).toMatchObject({ name: 'Example High School', count: 1, games: 1, assignments: 3, category: 'High School' })
  })
})

describe('computeRollup (monthly)', () => {
  it('filters to a single month by game_date', () => {
    const r = computeRollup(games, mappings, { activeOfficials: null, readyOfficials: null }, { season: SEASON, period: '2025-10' })
    // October Normal games: Example Jr High (g3) + Unknown (g5) = 2 games
    expect(r.assignments.totalGames).toBe(2)
    expect(r.assignments.totalAssignments).toBe(2)
  })
})
