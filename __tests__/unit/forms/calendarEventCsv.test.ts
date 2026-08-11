import {
  CSV_DIVISION_COLUMNS,
  CSV_HEADERS,
  buildTemplateCsv,
  parseCsv,
  parseEventsCsv,
} from '@/lib/forms/calendarEventCsv'
import { buildCalendarEventPayload } from '@/lib/forms/calendarEventPayload'

const HEADER_ROW = CSV_HEADERS.join(',')

/**
 * Build a CSV row matching the canonical column order. Pass division flags
 * as a `Set<string>` of the columns that should be `TRUE`. Anything missing
 * is emitted as `FALSE`.
 */
function row(opts: {
  type?: string
  title?: string
  startDate?: string
  startTime?: string
  endDate?: string
  endTime?: string
  location?: string
  description?: string
  affiliation?: string
  gender?: string
  multiLocation?: string
  levelOfPlay?: string
  divisionsTrue?: ReadonlyArray<string>
}): string {
  const cells = [
    opts.type ?? 'Tournament',
    opts.title ?? 'Test Tournament',
    opts.startDate ?? '06/05/2026',
    opts.startTime ?? '12:00 AM',
    opts.endDate ?? '06/06/2026',
    opts.endTime ?? '11:59 PM',
    opts.location ?? 'Site 1',
    opts.description ?? 'Description',
    opts.affiliation ?? 'Club 1',
    opts.gender ?? 'Both',
    opts.multiLocation ?? 'FALSE',
    opts.levelOfPlay ?? 'Example City',
    '', // Divisions -> separator
    ...CSV_DIVISION_COLUMNS.map((c) =>
      opts.divisionsTrue?.includes(c) ? 'TRUE' : 'FALSE'
    ),
  ]
  return cells.join(',')
}

describe('parseCsv', () => {
  it('parses a simple unquoted CSV', () => {
    const rows = parseCsv('a,b,c\n1,2,3\n')
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('handles quoted fields with embedded commas', () => {
    const rows = parseCsv('a,b\n"hello, world","x"\n')
    expect(rows).toEqual([
      ['a', 'b'],
      ['hello, world', 'x'],
    ])
  })

  it('handles escaped quotes ("") inside quoted fields', () => {
    const rows = parseCsv('a\n"she said ""hi"""\n')
    expect(rows).toEqual([['a'], ['she said "hi"']])
  })

  it('handles CRLF line endings', () => {
    const rows = parseCsv('a,b\r\n1,2\r\n')
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('strips a leading UTF-8 BOM', () => {
    const rows = parseCsv('﻿a,b\n1,2\n')
    expect(rows[0]).toEqual(['a', 'b'])
  })

  it('handles a file with no trailing newline', () => {
    const rows = parseCsv('a,b\n1,2')
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('drops fully blank trailing lines', () => {
    const rows = parseCsv('a,b\n1,2\n\n')
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('returns [] for empty input', () => {
    expect(parseCsv('')).toEqual([])
  })
})

describe('parseEventsCsv — header validation', () => {
  it('flags missing required columns', () => {
    const csv = 'Event Title,Start Date\nFoo,01/01/2026\n'
    const result = parseEventsCsv(csv)
    expect(result.headerErrors.length).toBeGreaterThan(0)
    expect(result.headerErrors.join('\n')).toMatch(/Event Type/)
    expect(result.rows).toEqual([])
  })

  it('reports an empty CSV', () => {
    const result = parseEventsCsv('')
    expect(result.headerErrors).toEqual(['CSV is empty'])
  })

  it('accepts the full template header', () => {
    const csv = `${HEADER_ROW}\n`
    const result = parseEventsCsv(csv)
    expect(result.headerErrors).toEqual([])
    expect(result.rows).toEqual([])
  })
})

describe('parseEventsCsv — row parsing', () => {
  it('parses a tournament row with all fields populated', () => {
    const csv = `${HEADER_ROW}\n${row({
      type: 'Tournament',
      title: 'Test 1',
      startDate: '06/05/2026',
      startTime: '12:00 AM',
      endDate: '06/06/2026',
      endTime: '11:59 PM',
      location: 'Site 1',
      description: 'Not Real',
      affiliation: 'Club 1',
      gender: 'Both',
      multiLocation: 'FALSE',
      levelOfPlay: 'Club',
      divisionsTrue: ['U9', 'U13'],
    })}\n`

    const result = parseEventsCsv(csv)
    expect(result.headerErrors).toEqual([])
    expect(result.rows).toHaveLength(1)
    const r = result.rows[0]
    expect(r.ok).toBe(true)
    if (!r.ok) return

    expect(r.state.title).toBe('Test 1')
    expect(r.state.type).toBe('tournament')
    expect(r.state.location).toBe('Site 1')
    expect(r.state.description).toBe('Not Real')
    expect(r.state.tournamentDetails).toBeDefined()
    expect(r.state.tournamentDetails!.school).toBe('Club 1')
    expect(r.state.tournamentDetails!.divisions).toEqual(['U9', 'U13'])
    expect(r.state.tournamentDetails!.levels).toEqual(['Club'])
    expect(r.state.tournamentDetails!.genders).toEqual(['Boys', 'Girls'])
    expect(r.state.tournamentDetails!.multiLocation).toBe(false)
    expect(r.state.tournamentDetails!.gamesInArbiter).toBe(false)
  })

  it('produces ISO datetimes that round-trip via the wire-format builder', () => {
    const csv = `${HEADER_ROW}\n${row({
      startDate: '06/05/2026',
      startTime: '12:00 AM',
      endDate: '06/06/2026',
      endTime: '11:59 PM',
    })}\n`
    const result = parseEventsCsv(csv)
    expect(result.rows[0].ok).toBe(true)
    const r = result.rows[0]
    if (!r.ok) return

    const payload = buildCalendarEventPayload(r.state)
    expect(typeof payload.start_date).toBe('string')
    expect(typeof payload.end_date).toBe('string')
    // Spot-check the year, since the local-zone interpretation is
    // platform-dependent.
    expect(payload.start_date).toMatch(/^2026-/)
    expect(payload.end_date).toMatch(/^2026-/)
    expect(payload.tournament_details).not.toBeNull()
    expect(new Date(payload.end_date).getTime()).toBeGreaterThan(
      new Date(payload.start_date).getTime()
    )
  })

  it('maps Boys / Girls / Both gender values correctly', () => {
    const csv = [
      HEADER_ROW,
      row({ title: 'A', gender: 'Boys' }),
      row({ title: 'B', gender: 'Girls' }),
      row({ title: 'C', gender: 'Both' }),
    ].join('\n')
    const result = parseEventsCsv(csv)
    const genders = result.rows.map((r) =>
      r.ok ? r.state.tournamentDetails!.genders : null
    )
    expect(genders).toEqual([['Boys'], ['Girls'], ['Boys', 'Girls']])
  })

  it('parses TRUE/FALSE booleans case-insensitively', () => {
    const csv = `${HEADER_ROW}\n${row({
      multiLocation: 'true',
      divisionsTrue: ['HS-JV'],
    })}\n`
    const result = parseEventsCsv(csv)
    const r = result.rows[0]
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.state.tournamentDetails!.multiLocation).toBe(true)
    expect(r.state.tournamentDetails!.divisions).toEqual(['HS-JV'])
  })

  it('passes any "Level of Play" string through unchanged (no allow-list)', () => {
    const csv = [
      HEADER_ROW,
      row({ title: 'A', levelOfPlay: 'Example City Div 1' }),
      row({ title: 'B', levelOfPlay: 'PEBL' }),
      row({ title: 'C', levelOfPlay: 'Other' }),
    ].join('\n')
    const result = parseEventsCsv(csv)
    expect(result.rows.every((r) => r.ok)).toBe(true)
    const levels = result.rows.map((r) =>
      r.ok ? r.state.tournamentDetails!.levels : null
    )
    expect(levels).toEqual([['Example City Div 1'], ['PEBL'], ['Other']])
  })

  it('omits tournamentDetails for non-tournament event types', () => {
    const csv = `${HEADER_ROW}\n${row({
      type: 'Training',
      affiliation: 'Should be ignored',
      divisionsTrue: ['U9'],
    })}\n`
    const result = parseEventsCsv(csv)
    const r = result.rows[0]
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.state.type).toBe('training')
    expect(r.state.tournamentDetails).toBeUndefined()
  })

  it('lowercases the Event Type', () => {
    const csv = `${HEADER_ROW}\n${row({ type: 'TOURNAMENT' })}\n`
    const result = parseEventsCsv(csv)
    const r = result.rows[0]
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.state.type).toBe('tournament')
  })

  it('skips fully blank rows', () => {
    const blank = ',,,,,,,,,,,,,,,,,,,,,,'
    const csv = `${HEADER_ROW}\n${blank}\n${row({ title: 'Real' })}\n`
    const result = parseEventsCsv(csv)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].ok).toBe(true)
  })
})

describe('parseEventsCsv — row errors', () => {
  it('reports an invalid Event Type', () => {
    const csv = `${HEADER_ROW}\n${row({ type: 'Banquet' })}\n`
    const result = parseEventsCsv(csv)
    const r = result.rows[0]
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors.join('\n')).toMatch(/Event Type "Banquet"/)
    expect(r.lineNumber).toBe(2)
  })

  it('reports a missing title', () => {
    const csv = `${HEADER_ROW}\n${row({ title: '' })}\n`
    const result = parseEventsCsv(csv)
    const r = result.rows[0]
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors.join('\n')).toMatch(/Event Title is required/)
  })

  it('reports an unparseable start date', () => {
    const csv = `${HEADER_ROW}\n${row({ startDate: 'not a date' })}\n`
    const result = parseEventsCsv(csv)
    const r = result.rows[0]
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors.join('\n')).toMatch(/Could not parse start date\/time/)
  })

  it('reports when end is before start', () => {
    const csv = `${HEADER_ROW}\n${row({
      startDate: '06/06/2026',
      startTime: '12:00 PM',
      endDate: '06/05/2026',
      endTime: '12:00 PM',
    })}\n`
    const result = parseEventsCsv(csv)
    const r = result.rows[0]
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors.join('\n')).toMatch(/End time must be at or after start time/)
  })

  it('returns multiple errors for one row when many fields are bad', () => {
    const csv = `${HEADER_ROW}\n,,bad,bad,bad,bad,,,,,,,,,,,,,,,,,\n`
    const result = parseEventsCsv(csv)
    const r = result.rows[0]
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors.length).toBeGreaterThan(1)
  })
})

describe('buildTemplateCsv', () => {
  it('starts with the canonical header row', () => {
    const csv = buildTemplateCsv()
    expect(csv.split('\n')[0]).toBe(HEADER_ROW)
  })

  it('produces a template that round-trips through the parser without errors', () => {
    const csv = buildTemplateCsv()
    const result = parseEventsCsv(csv)
    expect(result.headerErrors).toEqual([])
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].ok).toBe(true)
  })
})
