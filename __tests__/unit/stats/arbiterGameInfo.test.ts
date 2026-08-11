import { normalizeGameRows } from '@/lib/stats/arbiterGameInfo'

const HEADER = [
  'GameID', 'Date', 'Time', 'Status', 'SiteName', 'SubSiteName',
  'BillToName', 'SportName', 'LevelName', 'HomeTeams', 'AwayTeams', 'Officials',
]

describe('normalizeGameRows', () => {
  it('parses a clean Arbiter row and counts officials across trailing columns', () => {
    const rows = [
      HEADER,
      [74397, '2025-09-08 00:00:00', '18:35:00', 'Normal', 'MNP Centre', 'Court 2',
        'Example Senior Mens Basketball Association', 'Basketball', 'Mens Div 1', 'TBA', 'TBA',
        'Steve Kabachia', 'Evan Picton'],
    ]
    const { games, errors } = normalizeGameRows(rows)
    expect(errors).toHaveLength(0)
    expect(games).toHaveLength(1)
    const g = games[0]
    expect(g.gameId).toBe(74397)
    expect(g.gameDate).toBe('2025-09-08')
    expect(g.gameTime).toBe('18:35')
    expect(g.status).toBe('Normal')
    expect(g.billToName).toBe('Example Senior Mens Basketball Association')
    expect(g.levelName).toBe('Mens Div 1')
    expect(g.officials).toEqual(['Steve Kabachia', 'Evan Picton'])
    expect(g.assignmentCount).toBe(2)
  })

  it('handles float-looking GameIDs and skips a header/title row above the real header', () => {
    const rows = [
      ['Some Arbiter export title', '', ''],
      HEADER,
      ['74400.0', '2025-09-08', '20:05:00', 'Normal', 'MNP', 'Court 3',
        'Org A', 'Basketball', 'Mens Div 2', 'TBA', 'TBA', 'Ignacio Lopez Coll', 'Fino Tiberi'],
    ]
    const { games, errors } = normalizeGameRows(rows)
    expect(errors).toHaveLength(0)
    expect(games).toHaveLength(1)
    expect(games[0].gameId).toBe(74400)
    expect(games[0].assignmentCount).toBe(2)
  })

  it('filters blank and TBA/TBD official slots out of the assignment count', () => {
    const rows = [
      HEADER,
      [1, '2025-10-01', '18:00', 'Normal', 'S', '', 'Org', 'Basketball', 'Lvl', 'A', 'B',
        'Real Name', 'TBA', '', 'TBD', 'Second Real'],
    ]
    const { games } = normalizeGameRows(rows)
    expect(games[0].officials).toEqual(['Real Name', 'Second Real'])
    expect(games[0].assignmentCount).toBe(2)
  })

  it('records an error for a row with no usable GameID and keeps going', () => {
    const rows = [
      HEADER,
      ['', '2025-09-08', '18:00', 'Normal', 'S', '', 'Org', 'B', 'L', 'A', 'B', 'Off One'],
      [77, '2025-09-09', '19:00', 'Normal', 'S', '', 'Org', 'B', 'L', 'A', 'B', 'Off Two'],
    ]
    const { games, errors } = normalizeGameRows(rows)
    expect(games).toHaveLength(1)
    expect(games[0].gameId).toBe(77)
    expect(errors).toHaveLength(1)
    expect(errors[0].row).toBe(2)
  })

  it('de-duplicates repeated GameIDs within one file (last wins) and reports the count', () => {
    const rows = [
      HEADER,
      [500, '2025-09-08', '18:00', 'Normal', 'S', '', 'Org', 'B', 'L', 'A', 'B', 'First Only'],
      [500, '2025-09-08', '18:00', 'Normal', 'S', '', 'Org', 'B', 'L', 'A', 'B', 'A Ref', 'B Ref'],
    ]
    const { games, duplicateCount } = normalizeGameRows(rows)
    expect(games).toHaveLength(1)
    expect(games[0].assignmentCount).toBe(2) // last row won
    expect(duplicateCount).toBe(1)
  })

  it('defaults an empty status to Normal and collects the distinct orgs', () => {
    const rows = [
      HEADER,
      [1, '2025-09-08', '18:00', '', 'S', '', 'Org A', 'B', 'L', 'A', 'B', 'X'],
      [2, '2025-09-08', '18:00', 'Cancelled', 'S', '', 'Org B', 'B', 'L', 'A', 'B', 'Y'],
      [3, '2025-09-08', '18:00', 'Normal', 'S', '', 'Org A', 'B', 'L', 'A', 'B', 'Z'],
    ]
    const { games, orgs } = normalizeGameRows(rows)
    expect(games[0].status).toBe('Normal')
    expect(games[1].status).toBe('Cancelled')
    expect(orgs.sort()).toEqual(['Org A', 'Org B'])
  })

  it('returns a header error when GameID column is missing entirely', () => {
    const rows = [
      ['Foo', 'Bar', 'Baz'],
      ['1', '2', '3'],
    ]
    const { games, errors } = normalizeGameRows(rows)
    expect(games).toHaveLength(0)
    expect(errors[0].message).toMatch(/GameID/i)
  })

  it('rejects a file that has GameID but is missing the Game Info columns (wrong report)', () => {
    // e.g. a "Games with Slots" export: has GameID + slot columns, but no
    // BillToName / LevelName / Officials.
    const rows = [
      ['GameID', 'Date', 'Slot', 'HomeTeam', 'AwayTeam'],
      [65089, '2025-09-08', 'A', 'X', 'Y'],
      [65176, '2025-09-09', 'B', 'X', 'Y'],
    ]
    const { games, errors } = normalizeGameRows(rows)
    expect(games).toHaveLength(0)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toMatch(/BillToName|Officials|Game Info/i)
  })
})
