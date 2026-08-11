/**
 * Bulk-CSV parser for calendar events.
 *
 * Mirrors the column shape the scheduler uses in their spreadsheet:
 *
 *   Event Type, Event Title, Start Date, Start time, End Date, End Time,
 *   Location, Description, Affiliation, Gender, Multiple Locations,
 *   Level of Play, Divisions ->,
 *   U9, U11, U13, U15, U17, Prep, Junior High, HS-JV, HS-SV, Senior
 *
 * Tournament-only columns (Affiliation, Gender, Multiple Locations,
 * Level of Play, division flags) are populated into `tournamentDetails`
 * only when the row's `Event Type` is `tournament`. For other event
 * types those columns are tolerated but ignored.
 *
 * The parser produces in-memory `CalendarEventFormState` values; callers
 * pipe them through `buildCalendarEventPayload` (the same helper the UI
 * uses) before POSTing — so the wire format lives in exactly one place.
 */

import moment from 'moment'

import {
  CALENDAR_EVENT_TYPES,
  type CalendarEventFormState,
  type CalendarEventTournamentDetails,
  type CalendarEventType,
} from './calendarEventPayload'

export const CSV_DIVISION_COLUMNS = [
  'U9',
  'U11',
  'U13',
  'U15',
  'U17',
  'Prep',
  'Junior High',
  'HS-JV',
  'HS-SV',
  'Senior',
] as const

export const CSV_HEADERS = [
  'Event Type',
  'Event Title',
  'Start Date',
  'Start time',
  'End Date',
  'End Time',
  'Location',
  'Description',
  'Affiliation',
  'Gender',
  'Multiple Locations',
  'Level of Play',
  'Divisions ->',
  ...CSV_DIVISION_COLUMNS,
] as const

const REQUIRED_HEADERS: readonly string[] = [
  'Event Type',
  'Event Title',
  'Start Date',
  'Start time',
  'End Date',
  'End Time',
]

const DATE_TIME_FORMATS = [
  'MM/DD/YYYY h:mm A',
  'MM/DD/YYYY H:mm',
  'M/D/YYYY h:mm A',
  'M/D/YYYY H:mm',
  'YYYY-MM-DD h:mm A',
  'YYYY-MM-DD H:mm',
] as const

export type CsvRowResult =
  | { ok: true; lineNumber: number; state: CalendarEventFormState }
  | { ok: false; lineNumber: number; errors: string[]; raw: string[] }

export interface ParseEventsCsvResult {
  headerErrors: string[]
  rows: CsvRowResult[]
}

/**
 * Minimal RFC4180-ish CSV parser. Handles:
 *  - quoted fields with embedded commas / newlines
 *  - escaped quotes ("" inside quoted fields)
 *  - LF and CRLF line endings
 *  - UTF-8 BOM at start of file
 *
 * Returns rows as arrays of strings. Empty trailing lines are dropped.
 */
export function parseCsv(text: string): string[][] {
  if (!text) return []
  // Strip UTF-8 BOM if present
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        // escaped quote
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }

    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (ch === '\r') {
      // swallow; \n handles line break
      i++
      continue
    }
    if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
      continue
    }
    field += ch
    i++
  }

  // flush trailing field/row (file with no terminating newline)
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  // drop entirely-empty lines (e.g. trailing blank line)
  return rows.filter((r) => !(r.length === 1 && r[0] === ''))
}

/**
 * Parse the full CSV text. Validates headers, then parses each data row.
 * Per-row failures are returned alongside successes so the UI can show
 * which lines need fixing.
 */
export function parseEventsCsv(text: string): ParseEventsCsvResult {
  const rows = parseCsv(text)
  if (rows.length === 0) {
    return { headerErrors: ['CSV is empty'], rows: [] }
  }

  const header = rows[0].map((h) => h.trim())
  const headerErrors = validateHeader(header)
  if (headerErrors.length > 0) {
    return { headerErrors, rows: [] }
  }

  const indexByHeader = buildHeaderIndex(header)

  const results: CsvRowResult[] = []
  for (let r = 1; r < rows.length; r++) {
    const raw = rows[r]
    // skip rows that are entirely blank
    if (raw.every((c) => c.trim() === '')) continue
    const parsed = parseDataRow(raw, indexByHeader, r + 1)
    results.push(parsed)
  }

  return { headerErrors: [], rows: results }
}

function validateHeader(header: string[]): string[] {
  const errors: string[] = []
  for (const required of REQUIRED_HEADERS) {
    if (!header.includes(required)) {
      errors.push(`Missing required column: "${required}"`)
    }
  }
  return errors
}

function buildHeaderIndex(header: string[]): Record<string, number> {
  const idx: Record<string, number> = {}
  header.forEach((h, i) => {
    idx[h] = i
  })
  return idx
}

function getCell(
  raw: string[],
  indexByHeader: Record<string, number>,
  name: string
): string {
  const i = indexByHeader[name]
  if (i === undefined) return ''
  const v = raw[i]
  return v === undefined ? '' : v.trim()
}

function parseBool(value: string): boolean {
  const v = value.trim().toLowerCase()
  return v === 'true' || v === 'yes' || v === '1' || v === 'y'
}

function parseDateTime(date: string, time: string): Date | null {
  const combined = `${date.trim()} ${time.trim()}`
  for (const fmt of DATE_TIME_FORMATS) {
    const m = moment(combined, fmt, true)
    if (m.isValid()) return m.toDate()
  }
  return null
}

function parseEventType(value: string, errors: string[]): CalendarEventType | null {
  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    errors.push('Event Type is required')
    return null
  }
  if (!CALENDAR_EVENT_TYPES.includes(normalized as CalendarEventType)) {
    errors.push(
      `Event Type "${value}" is not valid (expected one of: ${CALENDAR_EVENT_TYPES.join(', ')})`
    )
    return null
  }
  return normalized as CalendarEventType
}

function parseGenders(value: string): string[] {
  const v = value.trim().toLowerCase()
  if (!v) return []
  if (v === 'boys') return ['Boys']
  if (v === 'girls') return ['Girls']
  if (v === 'both' || v === 'mixed' || v === 'co-ed' || v === 'coed') {
    return ['Boys', 'Girls']
  }
  // tolerant fallback — pass through original capitalised value as a single tag
  return [value.trim()]
}

function parseDataRow(
  raw: string[],
  indexByHeader: Record<string, number>,
  lineNumber: number
): CsvRowResult {
  const errors: string[] = []

  const type = parseEventType(getCell(raw, indexByHeader, 'Event Type'), errors)
  const title = getCell(raw, indexByHeader, 'Event Title')
  if (!title) errors.push('Event Title is required')
  if (title.length > 200) errors.push('Event Title must not exceed 200 characters')

  const startDate = getCell(raw, indexByHeader, 'Start Date')
  const startTime = getCell(raw, indexByHeader, 'Start time')
  const endDate = getCell(raw, indexByHeader, 'End Date')
  const endTime = getCell(raw, indexByHeader, 'End Time')

  if (!startDate) errors.push('Start Date is required')
  if (!startTime) errors.push('Start time is required')
  if (!endDate) errors.push('End Date is required')
  if (!endTime) errors.push('End Time is required')

  let start: Date | null = null
  let end: Date | null = null
  if (startDate && startTime) {
    start = parseDateTime(startDate, startTime)
    if (!start) {
      errors.push(
        `Could not parse start date/time "${startDate} ${startTime}" — expected MM/DD/YYYY and h:mm AM/PM`
      )
    }
  }
  if (endDate && endTime) {
    end = parseDateTime(endDate, endTime)
    if (!end) {
      errors.push(
        `Could not parse end date/time "${endDate} ${endTime}" — expected MM/DD/YYYY and h:mm AM/PM`
      )
    }
  }
  if (start && end && end.getTime() < start.getTime()) {
    errors.push('End time must be at or after start time')
  }

  if (errors.length > 0 || !type || !start || !end) {
    return { ok: false, lineNumber, errors, raw }
  }

  const location = getCell(raw, indexByHeader, 'Location')
  const description = getCell(raw, indexByHeader, 'Description')

  const state: CalendarEventFormState = {
    title,
    type,
    start,
    end,
    location: location || undefined,
    description: description || undefined,
  }

  if (type === 'tournament') {
    state.tournamentDetails = buildTournamentDetails(raw, indexByHeader)
  }

  return { ok: true, lineNumber, state }
}

function buildTournamentDetails(
  raw: string[],
  indexByHeader: Record<string, number>
): CalendarEventTournamentDetails {
  const school = getCell(raw, indexByHeader, 'Affiliation')
  const genders = parseGenders(getCell(raw, indexByHeader, 'Gender'))
  const multiLocation = parseBool(getCell(raw, indexByHeader, 'Multiple Locations'))
  const levelOfPlay = getCell(raw, indexByHeader, 'Level of Play')
  const levels = levelOfPlay ? [levelOfPlay] : []

  const divisions: string[] = []
  for (const col of CSV_DIVISION_COLUMNS) {
    if (parseBool(getCell(raw, indexByHeader, col))) {
      divisions.push(col)
    }
  }

  return {
    school,
    divisions,
    levels,
    genders,
    multiLocation,
    gamesInArbiter: false,
  }
}

/**
 * The downloadable CSV template. Header row + one example tournament row
 * so the scheduler can see the expected shape for each column.
 */
export function buildTemplateCsv(): string {
  const header = CSV_HEADERS.join(',')
  const exampleRow = [
    'Tournament',
    'Example Tournament',
    '06/05/2026',
    '12:00 AM',
    '06/06/2026',
    '11:59 PM',
    'Site 1',
    'Sample tournament — replace or delete this row',
    'Club Name',
    'Both',
    'FALSE',
    'Regional',
    '', // Divisions -> separator
    'TRUE', // U9
    'TRUE', // U11
    'FALSE', // U13
    'FALSE', // U15
    'FALSE', // U17
    'FALSE', // Prep
    'FALSE', // Junior High
    'FALSE', // HS-JV
    'FALSE', // HS-SV
    'FALSE', // Senior
  ].join(',')
  return `${header}\n${exampleRow}\n`
}
