/**
 * Integration tests for /.netlify/functions/announcements.
 *
 * Auth gate for GET (401 unauthenticated, 200 for any signed-in user) is
 * already covered in `portal.test.ts`; we exercise the writes here plus
 * a few deeper GET behaviours (ordering, filtering).
 *
 * The wire-shape interfaces are imported from the handler — TypeScript
 * fails compilation if the frontend caller and the handler drift.
 */
import {
  handler,
  type AnnouncementCreatePayload,
  type AnnouncementUpdatePayload,
} from '@/netlify/functions/announcements'
import { invokeFunction } from './helpers/invokeFunction'
import { cleanupAnnouncementsRows } from './helpers/cleanup'
import { getSupabaseAdmin, tag } from './helpers/supabase'
import {
  cleanupOrphanedTestUsers,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from './helpers/auth'
import { DEFAULT_AUTHOR } from '../../lib/siteConfig'

let admin: TestUser
let executive: TestUser
let official: TestUser

beforeAll(async () => {
  await cleanupOrphanedTestUsers()
  await cleanupAnnouncementsRows()
  ;[admin, executive, official] = await Promise.all([
    createTestUser('admin'),
    createTestUser('executive'),
    createTestUser('official'),
  ])
}, 30_000)

afterAll(async () => {
  await Promise.all([
    admin && deleteTestUser(admin),
    executive && deleteTestUser(executive),
    official && deleteTestUser(official),
  ])
  // Audit-log inserts are awaited inside the handler, but be safe:
  await new Promise((r) => setTimeout(r, 200))
  await cleanupAnnouncementsRows()
})

const validBody = (
  overrides: Partial<AnnouncementCreatePayload> = {}
): AnnouncementCreatePayload => ({
  title: tag('Title'),
  content: 'This is the announcement body content for an integration test row.',
  category: 'general',
  priority: 'normal',
  author: DEFAULT_AUTHOR,
  date: new Date().toISOString(),
  ...overrides,
})

describe('announcements — POST', () => {
  it('rejects POST without auth', async () => {
    const res = await invokeFunction(handler, { method: 'POST', body: validBody() })
    expect(res.statusCode).toBe(401)
  })

  it('rejects POST from an "official" role with 403', async () => {
    const res = await invokeFunction(handler, {
      method: 'POST',
      bearerToken: official.accessToken,
      body: validBody(),
    })
    expect(res.statusCode).toBe(403)
  })

  it('admin can POST → 201 + row in DB', async () => {
    const title = tag('AdminPOST')
    const res = await invokeFunction(handler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: validBody({ title }),
    })
    expect(res.statusCode).toBe(201)
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.body.title).toBe(title)

    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('announcements')
      .select('id, title, category, priority, author')
      .eq('id', res.body.id)
      .single()
    expect(data).not.toBeNull()
    expect(data!.title).toBe(title)
    expect(data!.category).toBe('general')
  })

  it('executive can POST → 201', async () => {
    const title = tag('ExecPOST')
    const res = await invokeFunction(handler, {
      method: 'POST',
      bearerToken: executive.accessToken,
      body: validBody({ title }),
    })
    expect(res.statusCode).toBe(201)
    expect(res.body.title).toBe(title)
  })

  // FIXED: shared `mapPgError` in `_shared/handler` now turns a 23502
  // not-null violation into a 400. We don't add explicit field-level
  // validation in the handler — the schema is the source of truth.
  it('POST with missing required fields → 400', async () => {
    const res = await invokeFunction(handler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: {},
    })
    expect(res.statusCode).toBe(400)
  })

  // FIXED: handler now validates `priority` against {high,normal,low} on
  // POST and PUT (defaulting to 'normal' when missing on POST), so bogus
  // values 400 instead of round-tripping back to clients.
  it('POST with bogus priority → 400', async () => {
    const res = await invokeFunction(handler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: validBody({ title: tag('BadPri'), priority: 'URGENT!!!' as any }),
    })
    expect(res.statusCode).toBe(400)
  })

  // FIXED: handler now runs Date.parse on the `date` field and returns
  // 400 if it can't be parsed, instead of letting non-ISO garbage hit
  // Postgres and surface as a 500.
  it('POST with malformed date → 400', async () => {
    const res = await invokeFunction(handler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: validBody({ title: tag('BadDate'), date: 'not-a-date' }),
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('announcements — PUT', () => {
  it('admin PUT round-trip: insert → modify → read-back', async () => {
    const title = tag('PUTOriginal')
    // Insert via handler so we exercise the full write path.
    const created = await invokeFunction(handler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: validBody({ title }),
    })
    expect(created.statusCode).toBe(201)
    const id: string = created.body.id

    const updatedTitle = tag('PUTUpdated')
    const updateBody: AnnouncementUpdatePayload = {
      id,
      title: updatedTitle,
      content: 'This is the updated content for a PUT round-trip integration test.',
      priority: 'high',
    }

    const updated = await invokeFunction(handler, {
      method: 'PUT',
      bearerToken: admin.accessToken,
      body: updateBody,
    })
    expect(updated.statusCode).toBe(200)
    expect(updated.body.id).toBe(id)
    expect(updated.body.title).toBe(updatedTitle)
    expect(updated.body.priority).toBe('high')

    // Read back from DB to confirm the change actually landed.
    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('announcements')
      .select('title, priority, content')
      .eq('id', id)
      .single()
    expect(data!.title).toBe(updatedTitle)
    expect(data!.priority).toBe('high')
  })

  it('PUT without id → 400', async () => {
    const res = await invokeFunction(handler, {
      method: 'PUT',
      bearerToken: admin.accessToken,
      body: { title: tag('NoIdPUT') },
    })
    expect(res.statusCode).toBe(400)
    expect(res.body.message ?? res.body.error).toMatch(/(ID is required|must be selected)/i)
  })

  it('non-admin PUT → 403', async () => {
    const res = await invokeFunction(handler, {
      method: 'PUT',
      bearerToken: official.accessToken,
      body: { id: '00000000-0000-0000-0000-000000000000', title: 'nope' },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('announcements — DELETE', () => {
  it('admin DELETE → row gone', async () => {
    const title = tag('DeleteMe')
    const created = await invokeFunction(handler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: validBody({ title }),
    })
    expect(created.statusCode).toBe(201)
    const id: string = created.body.id

    const del = await invokeFunction(handler, {
      method: 'DELETE',
      bearerToken: admin.accessToken,
      query: { id },
    })
    expect(del.statusCode).toBe(204)

    const sb = getSupabaseAdmin()
    const { data } = await sb.from('announcements').select('id').eq('id', id)
    expect(data).toEqual([])
  })

  it('non-admin DELETE → 403', async () => {
    const res = await invokeFunction(handler, {
      method: 'DELETE',
      bearerToken: official.accessToken,
      query: { id: '00000000-0000-0000-0000-000000000000' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('DELETE without id → 400', async () => {
    const res = await invokeFunction(handler, {
      method: 'DELETE',
      bearerToken: admin.accessToken,
    })
    expect(res.statusCode).toBe(400)
    expect(res.body.message ?? res.body.error).toMatch(/(ID is required|must be selected)/i)
  })
})

describe('announcements — GET behaviours', () => {
  it('returns rows ordered by date DESC', async () => {
    const sb = getSupabaseAdmin()
    const oldDate = new Date(Date.now() - 86400 * 1000 * 7).toISOString()
    const newDate = new Date().toISOString()

    const oldTitle = tag('GETOrderOld')
    const newTitle = tag('GETOrderNew')
    await invokeFunction(handler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: validBody({ title: oldTitle, date: oldDate }),
    })
    await invokeFunction(handler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: validBody({ title: newTitle, date: newDate }),
    })

    const res = await invokeFunction(handler, {
      method: 'GET',
      bearerToken: admin.accessToken,
    })
    expect(res.statusCode).toBe(200)
    const titles = (res.body as Array<{ title: string }>).map((a) => a.title)
    const oldIdx = titles.indexOf(oldTitle)
    const newIdx = titles.indexOf(newTitle)
    expect(oldIdx).toBeGreaterThan(-1)
    expect(newIdx).toBeGreaterThan(-1)
    // newer row must come first
    expect(newIdx).toBeLessThan(oldIdx)

    // Cleanup happens in afterAll via title prefix match.
    void sb
  })

  // FIXED: GET now respects ?published_only=true by filtering rows where
  // `expires` is NULL or in the future, so callers can rely on the flag
  // instead of doing client-side cleanup of expired rows.
  it('GET ?published_only=true hides expired announcements', async () => {
    const expiredTitle = tag('GETExpired')
    const liveTitle = tag('GETLive')
    const past = new Date(Date.now() - 86400 * 1000).toISOString()
    const future = new Date(Date.now() + 86400 * 1000).toISOString()

    await invokeFunction(handler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: validBody({ title: expiredTitle, expires: past }),
    })
    await invokeFunction(handler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: validBody({ title: liveTitle, expires: future }),
    })

    const res = await invokeFunction(handler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      query: { published_only: 'true' },
    })
    expect(res.statusCode).toBe(200)
    const titles = (res.body as Array<{ title: string }>).map((a) => a.title)
    expect(titles).toContain(liveTitle)
    expect(titles).not.toContain(expiredTitle)
  })
})
