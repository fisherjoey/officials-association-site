'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  IconUsers,
  IconCalendarEvent,
  IconClipboardList,
  IconTrophy,
  IconUpload,
  IconAlertTriangle,
  IconLoader2,
  IconRefresh,
} from '@tabler/icons-react'
import { ColumnDef } from '@tanstack/react-table'
import { toast } from 'sonner'
import { DataTable } from '@/components/ui/DataTable'
import Button from '@/components/ui/Button'
import { useRole } from '@/contexts/RoleContext'
import { statsAPI, type SummaryResponse } from '@/lib/api'
import type { Rollup } from '@/lib/stats/types'
import StatsUploadModal from '@/components/portal/StatsUploadModal'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts'
import { ORG_SHORT_NAME } from '@/lib/siteConfig'

type TournamentRow = { name: string; count: number; games: number; assignments: number; category: string | null }
type LeagueRow = { name: string; games: number; assignments: number; subRows?: LeagueRow[] }

const tournamentColumns: ColumnDef<TournamentRow>[] = [
  { accessorKey: 'name', header: 'Tournament' },
  { accessorKey: 'category', header: 'Category' },
  { accessorKey: 'games', header: 'Games', meta: { align: 'right' as const }, cell: ({ getValue }) => getValue<number>().toLocaleString() },
  { accessorKey: 'assignments', header: 'Assignments', meta: { align: 'right' as const }, cell: ({ getValue }) => getValue<number>().toLocaleString() },
]

const leagueColumns: ColumnDef<LeagueRow>[] = [
  { accessorKey: 'name', header: 'League' },
  { accessorKey: 'games', header: 'Games', meta: { align: 'right' as const }, cell: ({ getValue }) => getValue<number>().toLocaleString() },
  { accessorKey: 'assignments', header: 'Assignments', meta: { align: 'right' as const }, cell: ({ getValue }) => getValue<number>().toLocaleString() },
]

function StatCard({ label, value, icon: Icon, subtext }: { label: string; value: number | string; icon?: any; subtext?: string }) {
  return (
    <div className="bg-white dark:bg-portal-surface rounded-xl border border-gray-200 dark:border-portal-border p-4 sm:p-6">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="p-2 bg-blue-900/30 rounded-lg">
            <Icon className="h-6 w-6 text-blue-400" />
          </div>
        )}
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{typeof value === 'number' ? value.toLocaleString() : value}</p>
          {subtext && <p className="text-xs text-gray-400 dark:text-gray-500">{subtext}</p>}
        </div>
      </div>
    </div>
  )
}

/** The current basketball season string, e.g. "2025-2026" (rolls over in September). */
function currentSeason(): string {
  const now = new Date()
  const y = now.getFullYear()
  return now.getMonth() >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`
}

/** Basketball-season months (Sep–Jun) as { label, value:'YYYY-MM' } for a "2025-2026" season. */
function seasonMonths(season: string): { label: string; value: string }[] {
  const [y1] = season.split('-').map(Number)
  if (!y1) return []
  const spec = [
    [9, y1], [10, y1], [11, y1], [12, y1],
    [1, y1 + 1], [2, y1 + 1], [3, y1 + 1], [4, y1 + 1], [5, y1 + 1], [6, y1 + 1],
  ] as const
  const names = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  return spec.map(([m, y]) => ({ label: `${names[m]} ${y}`, value: `${y}-${String(m).padStart(2, '0')}` }))
}

export default function StatisticsClient() {
  const { user } = useRole()
  const canEdit = user.role === 'admin' || user.role === 'executive'

  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [viewType, setViewType] = useState<'season' | 'monthly'>('season')
  const [season, setSeason] = useState<string | undefined>()
  const [month, setMonth] = useState<string | undefined>()
  const [uploadOpen, setUploadOpen] = useState(false)

  const period = viewType === 'monthly' && month ? month : 'ytd'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await statsAPI.getSummary({ season, period })
      setSummary(res)
      if (!season && res.season) setSeason(res.season)
    } catch (e: any) {
      toast.error(e?.message || 'Could not load statistics.')
    } finally {
      setLoading(false)
    }
  }, [season, period])

  useEffect(() => { load() }, [load])

  const data: Rollup | null = summary?.rollup ?? null
  // Fall back to the current season so an admin can upload the FIRST file when the
  // DB is still empty (no games yet -> summary.season is null).
  const effectiveSeason = season ?? summary?.season ?? currentSeason()
  const months = useMemo(() => seasonMonths(effectiveSeason), [effectiveSeason])

  // default a month when switching to monthly view
  useEffect(() => {
    if (viewType === 'monthly' && !month && months.length) setMonth(months[0].value)
  }, [viewType, month, months])

  const leaguesData = useMemo((): LeagueRow[] => {
    if (!data) return []
    return data.leagues.breakdown.map((l) => ({
      name: l.name,
      games: l.games,
      assignments: l.assignments,
      subRows: l.subdivisions.length ? l.subdivisions.map((s) => ({ name: s.name, games: s.games, assignments: s.assignments })) : undefined,
    }))
  }, [data])

  const hasData = summary && !summary.empty && data
  const seasons = summary?.seasons ?? []

  return (
    <div className="space-y-6 portal-animate">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading tracking-tight text-gray-900 dark:text-white">Seasonal Officiating Stats</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Officiating activity from the {ORG_SHORT_NAME} scheduler
            {summary?.lastImport && (
              <span className="text-gray-400 dark:text-gray-500"> · updated {new Date(summary.lastImport.created_at).toLocaleDateString()}</span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* View toggle */}
          <div className="flex bg-gray-100 dark:bg-portal-surface rounded-lg p-1">
            {(['season', 'monthly'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setViewType(v)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewType === v
                    ? 'bg-white dark:bg-portal-hover shadow text-gray-900 dark:text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {v === 'season' ? 'Year-to-Date' : 'Monthly'}
              </button>
            ))}
          </div>

          {/* Season selector */}
          <select
            value={effectiveSeason}
            onChange={(e) => setSeason(e.target.value)}
            className="pl-3 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-portal-surface text-gray-900 dark:text-white"
          >
            {(seasons.length ? seasons : [effectiveSeason]).map((s) => (
              <option key={s} value={s}>{s} Season</option>
            ))}
          </select>

          {/* Month selector */}
          {viewType === 'monthly' && (
            <select
              value={month ?? ''}
              onChange={(e) => setMonth(e.target.value)}
              className="pl-3 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-portal-surface text-gray-900 dark:text-white"
            >
              {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          )}

          {canEdit && (
            <Button onClick={() => setUploadOpen(true)} size="sm">
              <span className="flex items-center gap-2"><IconUpload className="h-4 w-4" /> Upload Arbiter export</span>
            </Button>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-24 text-gray-400">
          <IconLoader2 className="h-8 w-8 animate-spin" />
        </div>
      )}

      {/* Empty state — no data ingested yet */}
      {!loading && !hasData && (
        <div className="bg-white dark:bg-portal-surface rounded-xl border border-gray-200 dark:border-portal-border p-10 text-center">
          <IconCalendarEvent className="h-10 w-10 mx-auto text-gray-300 dark:text-gray-600" />
          <h2 className="mt-3 text-lg font-semibold text-gray-900 dark:text-white">No statistics yet{season ? ` for ${season}` : ''}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {canEdit ? 'Upload an Arbiter Game Info export to populate this page.' : 'Statistics will appear here once an administrator uploads the season data.'}
          </p>
          {canEdit && (
            <Button onClick={() => setUploadOpen(true)} className="mt-4">
              <span className="flex items-center gap-2"><IconUpload className="h-4 w-4" /> Upload Arbiter export</span>
            </Button>
          )}
        </div>
      )}

      {!loading && hasData && data && (
        <>
          {/* Admin: unmapped orgs notice */}
          {canEdit && data.unmappedOrgs.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
              <IconAlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <strong>{data.unmappedOrgs.length} unclassified organization{data.unmappedOrgs.length > 1 ? 's' : ''}</strong> counted under “Unclassified”:{' '}
                {data.unmappedOrgs.slice(0, 6).join(', ')}{data.unmappedOrgs.length > 6 ? '…' : ''}. Classify them as leagues or tournaments in the org-mappings table.
              </div>
            </div>
          )}

          {/* Admin: manual head-counts (only prompts when missing) */}
          {canEdit && (data.officials.active == null || data.officials.ready == null) && (
            <HeadCountEditor season={effectiveSeason} period={period} onSaved={load} />
          )}

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard label="Active Officials" value={data.officials.active ?? '—'} icon={IconUsers} />
            <StatCard label="Ready to Officiate" value={data.officials.ready ?? '—'} icon={IconUsers} />
            <StatCard label="Refereed 1+ Game" value={data.officials.refereed} icon={IconUsers} />
            <StatCard label="Games" value={data.assignments.totalGames} icon={IconCalendarEvent} />
            <StatCard label="Assignments" value={data.assignments.totalAssignments} icon={IconClipboardList} />
            <StatCard label="Avg Games/Official" value={data.assignments.average.toFixed(1)} subtext={`Min ${data.assignments.min} · Max ${data.assignments.max}`} />
          </div>

          {/* Distribution */}
          {data.distribution.length > 0 && (
            <div className="bg-white dark:bg-portal-surface rounded-xl border border-gray-200 dark:border-portal-border p-6">
              <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Officials by Games Refereed</h2>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.distribution} layout="vertical" margin={{ left: 60, right: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} className="dark:opacity-30" />
                    <XAxis type="number" tick={{ fill: 'currentColor' }} className="text-gray-600 dark:text-gray-400" allowDecimals={false} />
                    <YAxis type="category" dataKey="range" tick={{ fontSize: 12, fill: 'currentColor' }} width={54} className="text-gray-600 dark:text-gray-400" />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--tooltip-bg, white)', borderColor: 'var(--tooltip-border, #e5e7eb)', color: 'var(--tooltip-text, #1f2937)' }} />
                    <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]}>
                      <LabelList dataKey="count" position="right" className="fill-gray-700 dark:fill-gray-300" fontSize={12} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Tournaments */}
          <div className="bg-white dark:bg-portal-surface rounded-xl border border-gray-200 dark:border-portal-border p-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <IconTrophy className="h-6 w-6 text-yellow-500" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Tournaments</h2>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                <span><strong className="text-gray-900 dark:text-white">{data.tournaments.total}</strong> tournaments</span>
                <span><strong className="text-gray-900 dark:text-white">{data.tournaments.totalGames.toLocaleString()}</strong> games</span>
                {data.tournaments.totalAssignments > 0 && <span><strong className="text-gray-900 dark:text-white">{data.tournaments.totalAssignments.toLocaleString()}</strong> assignments</span>}
              </div>
            </div>

            {data.tournaments.byCategory.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
                {data.tournaments.byCategory.map((cat) => (
                  <div key={cat.name} className="bg-gray-50 dark:bg-portal-hover rounded-lg p-3">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{cat.name}</p>
                    <p className="text-xl font-bold text-blue-400">{cat.count}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{cat.games.toLocaleString()} games</p>
                  </div>
                ))}
              </div>
            )}

            {data.tournaments.breakdown.length > 0 ? (
              <DataTable data={data.tournaments.breakdown} columns={tournamentColumns} searchable searchPlaceholder="Search tournaments..." maxHeight="24rem" stickyHeader />
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">No tournaments in this period.</p>
            )}
          </div>

          {/* Leagues */}
          <div className="bg-white dark:bg-portal-surface rounded-xl border border-gray-200 dark:border-portal-border p-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">League Breakdown</h2>
              <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                <span><strong className="text-gray-900 dark:text-white">{data.leagues.totalGames.toLocaleString()}</strong> games</span>
                <span><strong className="text-gray-900 dark:text-white">{data.leagues.totalAssignments.toLocaleString()}</strong> assignments</span>
              </div>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Only leagues with games this period. Click a league with divisions to expand.</p>
            {leaguesData.length > 0 ? (
              <DataTable data={leaguesData} columns={leagueColumns} getSubRows={(row) => row.subRows} />
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">No league games in this period.</p>
            )}
          </div>
        </>
      )}

      {uploadOpen && (
        <StatsUploadModal
          isOpen={uploadOpen}
          onClose={() => setUploadOpen(false)}
          season={effectiveSeason}
          onImported={(r) => {
            toast.success(`Imported: ${r.insertedCount} new, ${r.updatedCount} updated${r.unmappedOrgs.length ? ` · ${r.unmappedOrgs.length} to classify` : ''}`)
            load()
          }}
        />
      )}
    </div>
  )
}

/** Inline admin editor for the two Arbiter-roster head-counts. */
function HeadCountEditor({ season, period, onSaved }: { season: string; period: string; onSaved: () => void }) {
  const [active, setActive] = useState('')
  const [ready, setReady] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await statsAPI.saveManual({
        season,
        period,
        activeOfficials: active === '' ? null : Number(active),
        readyOfficials: ready === '' ? null : Number(ready),
      })
      toast.success('Head-counts saved')
      onSaved()
    } catch (e: any) {
      toast.error(e?.message || 'Could not save head-counts')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-blue-50 dark:bg-blue-900/15 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2 text-sm font-medium text-blue-900 dark:text-blue-200">
        <IconRefresh className="h-4 w-4" /> Set the {period === 'ytd' ? 'season' : 'monthly'} head-counts (from Arbiter roster)
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-gray-700 dark:text-gray-300">
          Active officials
          <input type="number" value={active} onChange={(e) => setActive(e.target.value)} className="mt-1 block w-32 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-portal-surface text-gray-900 dark:text-white" placeholder="e.g. 242" />
        </label>
        <label className="text-sm text-gray-700 dark:text-gray-300">
          Ready to officiate
          <input type="number" value={ready} onChange={(e) => setReady(e.target.value)} className="mt-1 block w-32 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-portal-surface text-gray-900 dark:text-white" placeholder="e.g. 215" />
        </label>
        <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </div>
    </div>
  )
}
