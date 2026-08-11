/**
 * Integration tests for the calendar-events Netlify function.
 *
 * Covers POST / PUT / DELETE auth gates and CRUD round-trips against a
 * real Supabase. The GET-auth gate ("requires bearer token") is already
 * covered by `portal.test.ts`; this file adds deeper GET behavior
 * (filter / read-back) and exercises the write paths end-to-end.
 *
 * Drift check: the wire-shape body is built via the shared
 * `buildCalendarEventPayload` helper that the portal also uses. If the
 * portal refactors its event form, TS will fail here at compile time.
 */
import { handler } from '@/netlify/functions/calendar-events'
import {
  buildCalendarEventPayload,
  type CalendarEventFormState,
} from '@/lib/forms/calendarEventPayload'

import { invokeFunction } from './helpers/invokeFunction'
import { cleanupCalendarEventsRows } from './helpers/cleanup'
import { getSupabaseAdmin, tag } from './helpers/supabase'
import {
  createTestUser,
  deleteTestUser,
  cleanupOrphanedTestUsers,
  type TestUser,
} from './helpers/auth'
import { DEFAULT_AUTHOR } from '../../lib/siteConfig'

let admin: TestUser
let official: TestUser

beforeAll(async () => {
  await cleanupOrphanedTestUsers()
  await cleanupCalendarEventsRows()
  ;[admin, official] = await Promise.all([
    createTestUser('admin'),
    createTestUser('official'),
  ])
}, 30_000)

afterAll(async () => {
  await Promise.all([
    admin && deleteTestUser(admin),
    official && deleteTestUser(official),
  ])
  // calendar-events doesn't fire-and-forget, but the audit logger does;
  // a small flush window is harmless and keeps us aligned with the pattern.
  await new Promise((r) => setTimeout(r, 200))
  await cleanupCalendarEventsRows()
})

/** Build a valid in-memory event state for tests; tag the title for cleanup. */
function makeState(overrides: Partial<CalendarEventFormState> = {}): CalendarEventFormState {
  const start = new Date('2030-06-15T18:00:00.000Z')
  const end = new Date('2030-06-15T20:00:00.000Z')
  return {
    title: tag('Event'),
    type: 'training',
    start,
    end,
    location: 'Test Gym',
    description: 'Integration test event',
    instructor: 'E2E Coach',
    maxParticipants: 12,
    registrationLink: 'https://example.test/register',
    ...overrides,
  }
}

/**
 * Insert a tagged calendar_events row directly via the admin client and
 * return its id. Used by tests that need an existing row to update / delete
 * without relying on a successful POST.
 */
async function insertSeedEvent(overrides: Partial<CalendarEventFormState> = {}): Promise<{ id: string; title: string }> {
  const sb = getSupabaseAdmin()
  const payload = buildCalendarEventPayload(makeState(overrides))
  const { data, error } = await sb
    .from('calendar_events')
    .insert([payload])
    .select('id, title')
  if (error || !data?.[0]) {
    throw new Error(`seed insert failed: ${error?.message ?? 'no row returned'}`)
  }
  return { id: data[0].id as string, title: data[0].title as string }
}

describe('calendar-events — POST', () => {
  it('returns 401 without auth', async () => {
    const res = await invokeFunction(handler, {
      method: 'POST',
      body: buildCalendarEventPayload(makeState()),
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 403 for a non-admin official', async () => {
    const res = await invokeFunction(handler, {
      method: 'POST',
      bearerToken: official.accessToken,
      body: buildCalendarEventPayload(makeState()),
    })
    expect(res.statusCode).toBe(403)
  })

  it('admin creates an event (201) and the row lands in the DB with the expected fields', async () => {
    const state = makeState({ title: tag('Created'), type: 'meeting' })
    const payload = buildCalendarEventPayload(state)

    const sb = getSupabaseAdmin()
    const beforeCount = await sb
      .from('calendar_events')
      .select('id', { count: 'exact', head: true })
      .like('title', `%${state.title}%`)

    const res = await invokeFunction<{ id: string; title: string; type: string }>(handler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: payload,
    })

    expect(res.statusCode).toBe(201)
    expect(res.body.id).toEqual(expect.any(String))
    expect(res.body.title).toBe(state.title)
    expect(res.body.type).toBe('meeting')

    // Read back from the DB with the admin client and assert key fields.
    const { data: row } = await sb
      .from('calendar_events')
      .select('*')
      .eq('id', res.body.id)
      .single()
    expect(row).toBeTruthy()
    expect(row!.title).toBe(state.title)
    expect(row!.type).toBe('meeting')
    expect(row!.location).toBe('Test Gym')
    expect(row!.description).toBe('Integration test event')
    expect(row!.instructor).toBe('E2E Coach')
    expect(row!.max_participants).toBe(12)
    expect(row!.registration_link).toBe('https://example.test/register')
    expect(new Date(row!.start_date).toISOString()).toBe(payload.start_date)
    expect(new Date(row!.end_date).toISOString()).toBe(payload.end_date)
    expect(row!.created_by).toBe(DEFAULT_AUTHOR)

    // Sanity: row count for this title went up by exactly 1.
    const afterCount = await sb
      .from('calendar_events')
      .select('id', { count: 'exact', head: true })
      .like('title', `%${state.title}%`)
    expect((afterCount.count ?? 0) - (beforeCount.count ?? 0)).toBe(1)
  })

  // FIXED: shared mapPgError now turns the supabase NOT NULL violation
  //        (Postgres 23502) into a 400 with "Missing required field(s)".
  it('returns 400 when required fields are missing', async () => {
    const res = await invokeFunction(handler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: { description: tag('NoTitle') }, // no title / type / start_date / end_date
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('calendar-events — PUT', () => {
  it('admin updates an event: insert → modify → read back', async () => {
    const seed = await insertSeedEvent({ title: tag('Updatable'), type: 'training' })

    const newTitle = tag('Updated')
    const res = await invokeFunction<{ id: string; title: string; location: string | null }>(handler, {
      method: 'PUT',
      bearerToken: admin.accessToken,
      body: {
        id: seed.id,
        title: newTitle,
        location: 'New Venue',
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.body.id).toBe(seed.id)
    expect(res.body.title).toBe(newTitle)

    const sb = getSupabaseAdmin()
    const { data: row } = await sb
      .from('calendar_events')
      .select('title, location')
      .eq('id', seed.id)
      .single()
    expect(row?.title).toBe(newTitle)
    expect(row?.location).toBe('New Venue')
  })

  it('returns 400 when PUT body is missing id', async () => {
    const res = await invokeFunction(handler, {
      method: 'PUT',
      bearerToken: admin.accessToken,
      body: { title: tag('NoId') },
    })
    expect(res.statusCode).toBe(400)
    expect(res.body.message ?? res.body.error).toMatch(/(ID is required|must be selected)/i)
  })

  it('returns 401 without auth', async () => {
    const res = await invokeFunction(handler, {
      method: 'PUT',
      body: { id: 'doesnt-matter', title: tag('Anon') },
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 403 for a non-admin official', async () => {
    const res = await invokeFunction(handler, {
      method: 'PUT',
      bearerToken: official.accessToken,
      body: { id: 'doesnt-matter', title: tag('Forbidden') },
    })
    expect(res.statusCode).toBe(403)
  })

  // FIXED: handler now checks `data.length === 0` after .update().select()
  //        and returns 404 when the id didn't match any row.
  it('returns 404 when PUT targets an id that does not exist', async () => {
    const res = await invokeFunction(handler, {
      method: 'PUT',
      bearerToken: admin.accessToken,
      body: { id: '00000000-0000-0000-0000-000000000000', title: tag('Ghost') },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('calendar-events — DELETE', () => {
  it('admin deletes an event: row is gone from the DB', async () => {
    const seed = await insertSeedEvent({ title: tag('Deletable') })

    const sb = getSupabaseAdmin()
    const before = await sb
      .from('calendar_events')
      .select('id')
      .eq('id', seed.id)
      .maybeSingle()
    expect(before.data?.id).toBe(seed.id)

    const res = await invokeFunction(handler, {
      method: 'DELETE',
      bearerToken: admin.accessToken,
      query: { id: seed.id },
    })
    expect(res.statusCode).toBe(204)

    const after = await sb
      .from('calendar_events')
      .select('id')
      .eq('id', seed.id)
      .maybeSingle()
    expect(after.data).toBeNull()
  })

  it('returns 400 when DELETE has no id query param', async () => {
    const res = await invokeFunction(handler, {
      method: 'DELETE',
      bearerToken: admin.accessToken,
    })
    expect(res.statusCode).toBe(400)
    expect(res.body.message ?? res.body.error).toMatch(/(ID is required|must be selected)/i)
  })

  it('returns 403 for a non-admin official', async () => {
    const seed = await insertSeedEvent({ title: tag('NoDelete') })
    const res = await invokeFunction(handler, {
      method: 'DELETE',
      bearerToken: official.accessToken,
      query: { id: seed.id },
    })
    expect(res.statusCode).toBe(403)

    // And the row survives.
    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('calendar_events')
      .select('id')
      .eq('id', seed.id)
      .maybeSingle()
    expect(data?.id).toBe(seed.id)
  })

  it('returns 401 without auth', async () => {
    const res = await invokeFunction(handler, {
      method: 'DELETE',
      query: { id: '00000000-0000-0000-0000-000000000000' },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('calendar-events — GET (deeper)', () => {
  it('admin GET returns rows including ones we just inserted', async () => {
    const seed = await insertSeedEvent({ title: tag('Listed') })

    const res = await invokeFunction<Array<{ id: string; title: string }>>(handler, {
      method: 'GET',
      bearerToken: admin.accessToken,
    })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.find((e) => e.id === seed.id)?.title).toBe(seed.title)
  })

  it('GET response is ordered by start_date ascending', async () => {
    // Two events: one in 2030, one in 2031. The 2030 row must appear first.
    const earlier = await insertSeedEvent({
      title: tag('Earlier'),
      start: new Date('2030-01-01T00:00:00.000Z'),
      end: new Date('2030-01-01T01:00:00.000Z'),
    })
    const later = await insertSeedEvent({
      title: tag('Later'),
      start: new Date('2031-01-01T00:00:00.000Z'),
      end: new Date('2031-01-01T01:00:00.000Z'),
    })

    const res = await invokeFunction<Array<{ id: string; start_date: string }>>(handler, {
      method: 'GET',
      bearerToken: admin.accessToken,
    })
    expect(res.statusCode).toBe(200)

    const earlierIdx = res.body.findIndex((e) => e.id === earlier.id)
    const laterIdx = res.body.findIndex((e) => e.id === later.id)
    expect(earlierIdx).toBeGreaterThanOrEqual(0)
    expect(laterIdx).toBeGreaterThanOrEqual(0)
    expect(earlierIdx).toBeLessThan(laterIdx)
  })
})
