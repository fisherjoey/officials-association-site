/**
 * Pure parser for the Arbiter "Game Info" export.
 *
 * Input is a raw sheet as an array of rows (each row an array of cells), exactly
 * what SheetJS `sheet_to_json(ws, { header: 1 })` or the CSV parser produces.
 * Output is normalized, validated game records ready to upsert by game_id.
 *
 * No I/O, no DB, no SheetJS import — kept pure so it is fully unit-testable.
 */
import type { NormalizedGame, ParseResult, RowError } from './types'

const FIELD_ALIASES: Record<string, string> = {
  gameid: 'gameId',
  date: 'gameDate',
  time: 'gameTime',
  status: 'status',
  sitename: 'siteName',
  subsitename: 'subSiteName',
  billtoname: 'billToName',
  sportname: 'sportName',
  levelname: 'levelName',
  hometeams: 'homeTeams',
  awayteams: 'awayTeams',
  officials: 'officials',
}

const UNASSIGNED = new Set(['tba', 'tbd', 'n/a', 'na', ''])

const norm = (v: unknown): string => (v == null ? '' : String(v).trim())
const key = (v: unknown): string => norm(v).toLowerCase().replace(/[\s_]+/g, '')

/** Locate the header row (first row containing a "GameID" cell) and its column map. */
function findHeader(rows: unknown[][]): { headerIndex: number; cols: Record<string, number>; officialsIdx: number } | null {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || []
    const idx = row.findIndex((c) => key(c) === 'gameid')
    if (idx === -1) continue
    const cols: Record<string, number> = {}
    row.forEach((cell, c) => {
      const field = FIELD_ALIASES[key(cell)]
      if (field && cols[field] === undefined) cols[field] = c
    })
    return { headerIndex: i, cols, officialsIdx: cols.officials ?? -1 }
  }
  return null
}

function toGameId(cell: unknown): number | null {
  const s = norm(cell)
  if (!s) return null
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return Math.round(n)
}

/** Coerce a cell into an ISO yyyy-mm-dd date, or null. Handles Date, ISO, M/D/YYYY, Excel serial. */
function toDate(cell: unknown): string | null {
  if (cell == null || cell === '') return null
  if (cell instanceof Date && !isNaN(cell.getTime())) {
    return `${cell.getFullYear()}-${pad(cell.getMonth() + 1)}-${pad(cell.getDate())}`
  }
  const s = norm(cell)
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/) // ISO / "2025-09-08 00:00:00"
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/) // M/D/YYYY
  if (m) return `${m[3]}-${pad(+m[1])}-${pad(+m[2])}`
  const serial = Number(s) // Excel serial date (days since 1899-12-30)
  if (Number.isFinite(serial) && serial > 20000 && serial < 90000) {
    const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000)
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  }
  return null
}

function toTime(cell: unknown): string | null {
  if (cell instanceof Date && !isNaN(cell.getTime())) {
    return `${pad(cell.getHours())}:${pad(cell.getMinutes())}`
  }
  const s = norm(cell)
  const m = s.match(/(\d{1,2}):(\d{2})/)
  return m ? `${pad(+m[1])}:${m[2]}` : null
}

const pad = (n: number): string => String(n).padStart(2, '0')

export function normalizeGameRows(rows: unknown[][]): ParseResult {
  const errors: RowError[] = []
  if (!rows || rows.length === 0) {
    return { games: [], errors: [{ row: 0, message: 'The file is empty.' }], duplicateCount: 0, orgs: [] }
  }

  const header = findHeader(rows)
  if (!header) {
    return {
      games: [],
      errors: [{ row: 0, message: 'Could not find a "GameID" column header — is this an Arbiter Game Info export?' }],
      duplicateCount: 0,
      orgs: [],
    }
  }

  const { headerIndex, cols, officialsIdx } = header

  // Guard against the wrong Arbiter report: a file can have a GameID column but
  // lack the Game Info columns (e.g. the "Games with Slots" export). Without
  // these, every row would import empty — so reject the file loudly instead.
  const REQUIRED: [string, string][] = [
    ['gameDate', 'Date'],
    ['status', 'Status'],
    ['billToName', 'BillToName'],
    ['levelName', 'LevelName'],
    ['officials', 'Officials'],
  ]
  const missing = REQUIRED.filter(([f]) => cols[f] === undefined).map(([, label]) => label)
  if (missing.length) {
    return {
      games: [],
      errors: [
        {
          row: 0,
          message: `This has a GameID column but is missing required Game Info column(s): ${missing.join(
            ', '
          )}. It looks like a different Arbiter report — please upload the "Game Info" export.`,
        },
      ],
      duplicateCount: 0,
      orgs: [],
    }
  }

  const byId = new Map<number, NormalizedGame>()
  let duplicateCount = 0
  const orgs = new Set<string>()

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i] || []
    const rowNo = i + 1 // 1-based for humans

    // Skip fully-empty rows silently.
    if (row.every((c) => norm(c) === '')) continue

    const gameId = toGameId(cols.gameId !== undefined ? row[cols.gameId] : undefined)
    if (gameId == null) {
      errors.push({ row: rowNo, message: 'Missing or invalid GameID.' })
      continue
    }

    const officials: string[] = []
    if (officialsIdx >= 0) {
      for (let c = officialsIdx; c < row.length; c++) {
        const name = norm(row[c])
        if (name && !UNASSIGNED.has(name.toLowerCase())) officials.push(name)
      }
    }

    const cell = (field: string): unknown => (cols[field] !== undefined ? row[cols[field]] : undefined)
    const billToName = norm(cell('billToName')) || null
    if (billToName) orgs.add(billToName)

    const game: NormalizedGame = {
      gameId,
      gameDate: toDate(cell('gameDate')),
      gameTime: toTime(cell('gameTime')),
      status: norm(cell('status')) || 'Normal',
      siteName: norm(cell('siteName')) || null,
      subSiteName: norm(cell('subSiteName')) || null,
      billToName,
      sportName: norm(cell('sportName')) || null,
      levelName: norm(cell('levelName')) || null,
      homeTeams: norm(cell('homeTeams')) || null,
      awayTeams: norm(cell('awayTeams')) || null,
      officials,
      assignmentCount: officials.length,
    }

    if (byId.has(gameId)) duplicateCount++
    byId.set(gameId, game) // last wins
  }

  return { games: [...byId.values()], errors, duplicateCount, orgs: [...orgs] }
}
