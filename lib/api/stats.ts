/**
 * Season Stats API — Arbiter ingestion + roll-up read side.
 */
import { apiFetch, API_BASE } from './client'
import type { NormalizedGame, Rollup } from '../stats/types'

export interface ImportResult {
  importId: string
  season: string
  gameCount: number
  assignmentCount: number
  insertedCount: number
  updatedCount: number
  unmappedOrgs: string[]
}

export interface SummaryResponse {
  empty: boolean
  seasons: string[]
  season: string | null
  period?: string
  rollup: Rollup | null
  lastImport?: { filename: string; created_at: string; season: string } | null
}

export interface OrgMappingRow {
  id: string
  bill_to_name: string
  display_name: string
  kind: 'league' | 'tournament' | 'excluded'
  category: string | null
  active: boolean
}

export const statsAPI = {
  /** Roll-up for a season/period. */
  async getSummary(params?: { season?: string; period?: string }): Promise<SummaryResponse> {
    const qs = new URLSearchParams()
    if (params?.season) qs.set('season', params.season)
    if (params?.period) qs.set('period', params.period)
    const res = await apiFetch(`${API_BASE}/stat-summary${qs.toString() ? `?${qs}` : ''}`)
    return res.json()
  },

  /** Upload parsed Arbiter Game Info rows (idempotent by game_id). */
  async uploadGames(payload: {
    season: string
    filename: string
    fileHash: string
    games: NormalizedGame[]
    rowCount: number
  }): Promise<ImportResult> {
    const res = await apiFetch(`${API_BASE}/stat-imports`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    return res.json()
  },

  async getImports(): Promise<any[]> {
    const res = await apiFetch(`${API_BASE}/stat-imports`)
    return res.json()
  },

  async getMappings(unmappedForSeason?: string): Promise<{ mappings: OrgMappingRow[]; unmapped: { billToName: string; games: number }[] }> {
    const qs = unmappedForSeason ? `?unmappedForSeason=${encodeURIComponent(unmappedForSeason)}` : ''
    const res = await apiFetch(`${API_BASE}/stat-org-mappings${qs}`)
    return res.json()
  },

  async saveMapping(m: { billToName: string; displayName: string; kind: string; category?: string | null }): Promise<OrgMappingRow> {
    const res = await apiFetch(`${API_BASE}/stat-org-mappings`, { method: 'POST', body: JSON.stringify(m) })
    return res.json()
  },

  async getManual(season: string, period = 'ytd'): Promise<{ active_officials: number | null; ready_officials: number | null } | null> {
    const res = await apiFetch(`${API_BASE}/stat-manual-entries?season=${encodeURIComponent(season)}&period=${period}`)
    return res.json()
  },

  async saveManual(entry: { season: string; period?: string; activeOfficials: number | null; readyOfficials: number | null }): Promise<any> {
    const res = await apiFetch(`${API_BASE}/stat-manual-entries`, { method: 'PUT', body: JSON.stringify(entry) })
    return res.json()
  },
}
