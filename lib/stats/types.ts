/**
 * Shared types for the Season Stats feature (Arbiter ingestion + roll-up).
 * These mirror the shapes consumed by StatisticsClient and stored in Supabase.
 */

/** A single game after normalizing a raw Arbiter "Game Info" export row. */
export interface NormalizedGame {
  gameId: number
  gameDate: string | null // ISO yyyy-mm-dd
  gameTime: string | null // HH:MM
  status: string
  siteName: string | null
  subSiteName: string | null
  billToName: string | null
  sportName: string | null
  levelName: string | null
  homeTeams: string | null
  awayTeams: string | null
  officials: string[]
  assignmentCount: number
}

export interface RowError {
  row: number // 1-based row number in the source sheet
  message: string
}

export interface ParseResult {
  games: NormalizedGame[]
  errors: RowError[]
  /** Number of distinct game_ids that appeared more than once in the file (last wins). */
  duplicateCount: number
  /** Distinct bill_to_name values seen (for mapping review). */
  orgs: string[]
}

/** Classification of an Arbiter org (BillToName). */
export interface OrgMapping {
  billToName: string
  displayName: string
  kind: 'league' | 'tournament' | 'excluded'
  category: string | null
  active?: boolean
}

export interface ManualEntry {
  activeOfficials: number | null
  readyOfficials: number | null
}

/** Minimal game shape needed for roll-up (subset of NormalizedGame / DB row). */
export interface RollupGame {
  gameDate: string | null
  status: string
  billToName: string | null
  levelName: string | null
  officials: string[]
  assignmentCount: number
}

export interface RollupOptions {
  season: string
  /** 'ytd' for the whole season, or 'YYYY-MM' for a single month. */
  period: string
}

export interface Subdivision {
  name: string
  games: number
  assignments: number
}
export interface LeagueBreakdown {
  name: string
  games: number
  assignments: number
  subdivisions: Subdivision[]
}
export interface TournamentRow {
  name: string
  count: number
  games: number
  assignments: number
  category: string | null
}
export interface CategorySummary {
  name: string
  count: number
  games: number
  assignments: number
}

export interface Rollup {
  season: string
  period: string
  officials: { active: number | null; ready: number | null; refereed: number }
  assignments: {
    totalGames: number
    totalAssignments: number
    min: number
    max: number
    average: number
  }
  distribution: { range: string; count: number }[]
  leagues: {
    totalGames: number
    totalAssignments: number
    breakdown: LeagueBreakdown[]
  }
  tournaments: {
    total: number
    totalGames: number
    totalAssignments: number
    byCategory: CategorySummary[]
    breakdown: TournamentRow[]
  }
  /** Orgs present in the data but with no mapping — surfaced for admin review. */
  unmappedOrgs: string[]
}
