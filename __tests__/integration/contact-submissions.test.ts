/**
 * Integration tests for /.netlify/functions/contact-submissions.
 *
 * The PUBLIC contact form (POST that creates these rows) is covered in
 * `contact-form.test.ts` — this file is the ADMIN side: listing, filtering,
 * searching, paginating, and PATCH-ing rows that already exist.
 *
 * The handler is admin-only (auth: 'admin'). We seed rows directly via the
 * service-role client so we control category/status/created_at/subject and
 * don't rely on the public POST behaviour.
 */
import { handler } from '@/netlify/functions/contact-submissions'
import { invokeFunction } from './helpers/invokeFunction'
import { cleanupContactRows, getSupabaseAdmin, tag, E2E_TAG } from './helpers/supabase'
import {
  cleanupOrphanedTestUsers,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from './helpers/auth'

interface SeededRow {
  id: string
  subject: string
  category: string
  status: string
  created_at: string
}

let admin: TestUser
let official: TestUser
let seeded: {
  scheduling: SeededRow
  general: SeededRow
  feedback: SeededRow
  oldGeneral: SeededRow
}

/** Insert a contact_submissions row directly. Returns the inserted row. */
async function seed(input: {
  subject: string
  category: string
  status?: string
  created_at?: string
  sender_name?: string
  sender_email?: string
  message?: string
}): Promise<SeededRow> {
  const sb = getSupabaseAdmin()
  const row = {
    sender_name: input.sender_name ?? 'E2E Sender',
    sender_email: input.sender_email ?? 'e2e@example.test',
    category: input.category,
    category_label: input.category,
    subject: input.subject,
    message: input.message ?? 'This is an admin-listing E2E test message.',
    recipient_email: 'inbox@example.test',
    status: input.status ?? 'new',
    ...(input.created_at ? { created_at: input.created_at } : {}),
  }
  const { data, error } = await sb
    .from('contact_submissions')
    .insert(row)
    .select('id, subject, category, status, created_at')
    .single()
  if (error || !data) {
    throw new Error(`Failed to seed contact_submission: ${error?.message ?? 'no data'}`)
  }
  return data as SeededRow
}

beforeAll(async () => {
  await cleanupOrphanedTestUsers()
  await cleanupContactRows()

  ;[admin, official] = await Promise.all([
    createTestUser('admin'),
    createTestUser('official'),
  ])

  // Spread created_at over 30 days so date-range filtering is testable.
  const now = Date.now()
  const day = 86400 * 1000
  const isoDaysAgo = (n: number) => new Date(now - n * day).toISOString()

  seeded = {
    scheduling: await seed({
      subject: tag('SchedSubject'),
      category: 'scheduling',
      status: 'new',
      created_at: isoDaysAgo(1),
    }),
    general: await seed({
      subject: tag('GenSubject'),
      category: 'general',
      status: 'new',
      created_at: isoDaysAgo(2),
    }),
    feedback: await seed({
      subject: tag('FbSubject'),
      category: 'feedback',
      status: 'responded',
      created_at: isoDaysAgo(3),
    }),
    oldGeneral: await seed({
      subject: tag('OldGenSubject'),
      category: 'general',
      status: 'archived',
      created_at: isoDaysAgo(20),
    }),
  }
}, 30_000)

afterAll(async () => {
  await Promise.all([
    admin && deleteTestUser(admin),
    official && deleteTestUser(official),
  ])
  // No fire-and-forget on this handler; small flush margin anyway.
  await new Promise((r) => setTimeout(r, 200))
  await cleanupContactRows()
})

interface ListResponse {
  submissions: Array<{
    id: string
    subject: string
    category: string
    status: string
    created_at: string
    sender_email: string
    sender_name: string
    message: string
  }>
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

/** Filter a list response down to rows we seeded so unrelated rows in
 *  shared dev DBs don't break assertions. */
function ours(res: { body: ListResponse }): ListResponse['submissions'] {
  return res.body.submissions.filter((r) => r.subject.includes(E2E_TAG))
}

describe('contact-submissions — auth', () => {
  it('GET without auth → 401', async () => {
    const res = await invokeFunction(handler, { method: 'GET' })
    expect(res.statusCode).toBe(401)
  })

  it('GET as non-admin (official) → 403', async () => {
    const res = await invokeFunction(handler, {
      method: 'GET',
      bearerToken: official.accessToken,
    })
    expect(res.statusCode).toBe(403)
  })

  it('PATCH without auth → 401', async () => {
    const res = await invokeFunction(handler, {
      method: 'PATCH',
      body: { id: seeded.general.id, status: 'read' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('rejects disallowed methods', async () => {
    const res = await invokeFunction(handler, {
      method: 'DELETE',
      bearerToken: admin.accessToken,
    })
    expect(res.statusCode).toBe(405)
  })
})

describe('contact-submissions — GET (list & filter)', () => {
  it('admin GET with no filters → all four seeded rows visible', async () => {
    const res = await invokeFunction<ListResponse>(handler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      query: { pageSize: '100' },
    })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.body.submissions)).toBe(true)
    expect(res.body.pagination).toMatchObject({ page: 1, pageSize: 100 })

    const ids = ours(res).map((r) => r.id)
    expect(ids).toEqual(
      expect.arrayContaining([
        seeded.scheduling.id,
        seeded.general.id,
        seeded.feedback.id,
        seeded.oldGeneral.id,
      ])
    )
  })

  it('rows come back ordered by created_at DESC', async () => {
    const res = await invokeFunction<ListResponse>(handler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      query: { pageSize: '100' },
    })
    expect(res.statusCode).toBe(200)
    const oursList = ours(res)
    // Among our seeded rows (scheduling=1d, general=2d, feedback=3d, old=20d)
    // the newest must appear before the oldest.
    const idxScheduling = oursList.findIndex((r) => r.id === seeded.scheduling.id)
    const idxOld = oursList.findIndex((r) => r.id === seeded.oldGeneral.id)
    expect(idxScheduling).toBeGreaterThan(-1)
    expect(idxOld).toBeGreaterThan(-1)
    expect(idxScheduling).toBeLessThan(idxOld)
  })

  it('?category=scheduling → only scheduling rows', async () => {
    const res = await invokeFunction<ListResponse>(handler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      query: { category: 'scheduling', pageSize: '100' },
    })
    expect(res.statusCode).toBe(200)
    // Every returned row must be scheduling — including any rows from other
    // tests/runs in the same DB.
    expect(res.body.submissions.every((r) => r.category === 'scheduling')).toBe(true)
    const oursList = ours(res)
    expect(oursList.map((r) => r.id)).toContain(seeded.scheduling.id)
    expect(oursList.map((r) => r.id)).not.toContain(seeded.general.id)
    expect(oursList.map((r) => r.id)).not.toContain(seeded.feedback.id)
  })

  it('?status=responded → only responded rows', async () => {
    const res = await invokeFunction<ListResponse>(handler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      query: { status: 'responded', pageSize: '100' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.body.submissions.every((r) => r.status === 'responded')).toBe(true)
    const oursList = ours(res)
    expect(oursList.map((r) => r.id)).toContain(seeded.feedback.id)
    expect(oursList.map((r) => r.id)).not.toContain(seeded.scheduling.id)
  })

  it('?category=X&status=Y combine (AND) — feedback+responded matches feedback row only', async () => {
    const res = await invokeFunction<ListResponse>(handler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      query: { category: 'feedback', status: 'responded', pageSize: '100' },
    })
    expect(res.statusCode).toBe(200)
    const oursList = ours(res)
    expect(oursList.map((r) => r.id)).toEqual([seeded.feedback.id])
  })

  it('?search=<part of subject tag> → search hit on subject', async () => {
    // Use the unique tail of one tagged subject so we get exactly one hit.
    const fragment = seeded.scheduling.subject.split('-').slice(-2).join('-')
    const res = await invokeFunction<ListResponse>(handler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      query: { search: fragment, pageSize: '100' },
    })
    expect(res.statusCode).toBe(200)
    const oursList = ours(res)
    expect(oursList.map((r) => r.id)).toContain(seeded.scheduling.id)
    expect(oursList.map((r) => r.id)).not.toContain(seeded.general.id)
  })

  it('?search=… searches sender_email too', async () => {
    const sb = getSupabaseAdmin()
    const uniqueEmail = `e2e-search-${Date.now()}@example.test`
    const seededRow = await seed({
      subject: tag('SearchEmailSubject'),
      category: 'general',
      sender_email: uniqueEmail,
    })
    try {
      const res = await invokeFunction<ListResponse>(handler, {
        method: 'GET',
        bearerToken: admin.accessToken,
        query: { search: uniqueEmail, pageSize: '100' },
      })
      expect(res.statusCode).toBe(200)
      const ids = res.body.submissions.map((r) => r.id)
      expect(ids).toContain(seededRow.id)
    } finally {
      await sb.from('contact_submissions').delete().eq('id', seededRow.id)
    }
  })

  it('?startDate&endDate → date range respected (last 7 days only)', async () => {
    const day = 86400 * 1000
    const start = new Date(Date.now() - 7 * day).toISOString()
    const end = new Date(Date.now() + day).toISOString()
    const res = await invokeFunction<ListResponse>(handler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      query: { startDate: start, endDate: end, pageSize: '100' },
    })
    expect(res.statusCode).toBe(200)
    const oursList = ours(res)
    const ids = oursList.map((r) => r.id)
    expect(ids).toContain(seeded.scheduling.id) // 1d ago
    expect(ids).toContain(seeded.general.id)    // 2d ago
    expect(ids).toContain(seeded.feedback.id)   // 3d ago
    expect(ids).not.toContain(seeded.oldGeneral.id) // 20d ago — out of range
  })

  it('pagination: pageSize=2 returns 2 rows and reports total', async () => {
    const res = await invokeFunction<ListResponse>(handler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      query: { page: '1', pageSize: '2' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.body.submissions.length).toBeLessThanOrEqual(2)
    expect(res.body.pagination.page).toBe(1)
    expect(res.body.pagination.pageSize).toBe(2)
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(4) // our four seeds
    expect(res.body.pagination.totalPages).toBeGreaterThanOrEqual(2)
  })

  it('pagination: page 1 vs page 2 return non-overlapping rows', async () => {
    const p1 = await invokeFunction<ListResponse>(handler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      query: { page: '1', pageSize: '2' },
    })
    const p2 = await invokeFunction<ListResponse>(handler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      query: { page: '2', pageSize: '2' },
    })
    expect(p1.statusCode).toBe(200)
    expect(p2.statusCode).toBe(200)
    const p1Ids = new Set(p1.body.submissions.map((r) => r.id))
    const p2Ids = p2.body.submissions.map((r) => r.id)
    for (const id of p2Ids) {
      expect(p1Ids.has(id)).toBe(false)
    }
  })

  it('pagination: pageSize is clamped at 100', async () => {
    const res = await invokeFunction<ListResponse>(handler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      query: { pageSize: '9999' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.body.pagination.pageSize).toBe(100)
  })

  // FIXED: pageSize=0 used to sail through Math.min(0, 100)=0 and
  // parseInt('0') is truthy-pass; the handler then computed range(0, -1)
  // which Postgrest treats as "no rows" while still reporting total. The
  // handler now clamps pageSize to a minimum of 1.
  // netlify/functions/contact-submissions.ts:21-22
  it('pagination: pageSize=0 should clamp to >=1, not return zero rows with positive total', async () => {
    const res = await invokeFunction<ListResponse>(handler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      query: { pageSize: '0' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.body.pagination.pageSize).toBeGreaterThanOrEqual(1)
    if (res.body.pagination.total > 0) {
      expect(res.body.submissions.length).toBeGreaterThan(0)
    }
  })

  // FIXED: page=0 used to make offset = (0 - 1) * pageSize = negative,
  // which Postgrest's .range() treats as starting from row 0 (lenient) but
  // pagination.page was reported as 0 — confusing for consumers. The
  // handler now clamps page to >=1.
  // netlify/functions/contact-submissions.ts:20,23
  it('pagination: page=0 should clamp to 1, not echo back 0', async () => {
    const res = await invokeFunction<ListResponse>(handler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      query: { page: '0', pageSize: '10' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.body.pagination.page).toBeGreaterThanOrEqual(1)
  })

  // FIXED: page=abc used to make parseInt('abc') = NaN → offset = NaN →
  // Postgrest errors out and the handler returned 500. The handler now
  // validates page/pageSize numerics up front and returns 400.
  // netlify/functions/contact-submissions.ts:20
  it('pagination: non-numeric page → 400, not 500', async () => {
    const res = await invokeFunction(handler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      query: { page: 'abc' },
    })
    expect(res.statusCode).toBe(400)
  })

  // FIXED: search used to be interpolated straight into the .or() filter
  // without escaping. A search containing a comma or paren broke the
  // PostgREST filter grammar and the handler 500'd. The handler now
  // backslash-escapes %, _, comma, paren, and backslash.
  // netlify/functions/contact-submissions.ts:33-35
  it('search with PostgREST-special characters does not 500', async () => {
    const res = await invokeFunction(handler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      query: { search: 'foo,bar)baz' },
    })
    expect(res.statusCode).toBe(200)
  })

  // FIXED: malformed startDate/endDate used to be passed straight through
  // to Postgres, which errored and the handler returned 500. The handler
  // now Date.parse-validates and returns 400.
  // netlify/functions/contact-submissions.ts:30-31
  it('malformed date filter → 400, not 500', async () => {
    const res = await invokeFunction(handler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      query: { startDate: 'not-a-date' },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('contact-submissions — PATCH', () => {
  it('admin PATCH status: new → responded round-trips', async () => {
    // Seed a fresh row so we don't mutate one another tests inspect.
    const row = await seed({
      subject: tag('PatchStatusSubject'),
      category: 'general',
      status: 'new',
    })

    const res = await invokeFunction(handler, {
      method: 'PATCH',
      bearerToken: admin.accessToken,
      body: { id: row.id, status: 'responded' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.body.success).toBe(true)

    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('contact_submissions')
      .select('status')
      .eq('id', row.id)
      .single()
    expect(data?.status).toBe('responded')
  })

  it('admin PATCH notes: appends arbitrary admin notes', async () => {
    const row = await seed({
      subject: tag('PatchNotesSubject'),
      category: 'general',
    })
    const note = `${E2E_TAG} admin note ${Date.now()}`

    const res = await invokeFunction(handler, {
      method: 'PATCH',
      bearerToken: admin.accessToken,
      body: { id: row.id, notes: note },
    })
    expect(res.statusCode).toBe(200)

    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('contact_submissions')
      .select('notes')
      .eq('id', row.id)
      .single()
    expect(data?.notes).toBe(note)
  })

  it('PATCH without id → 400', async () => {
    const res = await invokeFunction(handler, {
      method: 'PATCH',
      bearerToken: admin.accessToken,
      body: { status: 'responded' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.body.message ?? res.body.error).toMatch(/(id is required|must be selected)/i)
  })

  it('PATCH as non-admin (official) → 403', async () => {
    const res = await invokeFunction(handler, {
      method: 'PATCH',
      bearerToken: official.accessToken,
      body: { id: seeded.general.id, status: 'responded' },
    })
    expect(res.statusCode).toBe(403)
  })

  // FIXED: `status` used to have no enum validation server-side. The
  // schema column is VARCHAR(50) with a comment listing
  // 'new'|'read'|'responded'|'archived', but the handler accepted anything
  // that fit in 50 chars. The handler now validates against the enum and
  // returns 400 for unknown values.
  // netlify/functions/contact-submissions.ts:67-69
  it('PATCH with bogus status → 400', async () => {
    const row = await seed({
      subject: tag('PatchBogusSubject'),
      category: 'general',
    })
    const res = await invokeFunction(handler, {
      method: 'PATCH',
      bearerToken: admin.accessToken,
      body: { id: row.id, status: 'totally-made-up-status' },
    })
    expect(res.statusCode).toBe(400)
  })

  // FIXED: PATCH with id pointing at a non-existent row used to return
  // 200 success because supabase-js .update().eq() returns no error when
  // zero rows match. The handler now uses .select() on the update and
  // returns 404 when no rows are affected.
  // netlify/functions/contact-submissions.ts:71-78
  it('PATCH non-existent id → 404, not silent 200', async () => {
    const res = await invokeFunction(handler, {
      method: 'PATCH',
      bearerToken: admin.accessToken,
      body: { id: '00000000-0000-0000-0000-000000000000', status: 'responded' },
    })
    expect(res.statusCode).toBe(404)
  })
})
