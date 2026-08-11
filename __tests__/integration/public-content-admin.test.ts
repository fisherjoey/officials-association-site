/**
 * Integration tests for the four public-content CMS handlers.
 *
 * Smoke coverage of the public GET path lives in `public-reads.test.ts`;
 * here we exercise the admin-gated POST/PUT/DELETE writes plus the
 * targeted GET-by-key path that the public site uses.
 *
 * The frontend (`lib/api/public-content.ts`) sends `JSON.stringify(item)`
 * straight through with no transformation — the wire shape *is* the
 * row shape. We bind to the row interfaces from `@/types/publicContent`
 * so any drift between the form-state types and what the handler reads
 * fails compilation.
 */
import { handler as newsHandler } from '@/netlify/functions/public-news'
import { handler as pagesHandler } from '@/netlify/functions/public-pages'
import { handler as resourcesHandler } from '@/netlify/functions/public-resources'
import { handler as trainingHandler } from '@/netlify/functions/public-training'
import { invokeFunction } from './helpers/invokeFunction'
import {
  cleanupPublicNewsRows,
  cleanupPublicPagesRows,
  cleanupPublicResourcesRows,
  cleanupPublicTrainingRows,
} from './helpers/cleanup'
import { getSupabaseAdmin, tag } from './helpers/supabase'
import {
  cleanupOrphanedTestUsers,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from './helpers/auth'
import type {
  PublicNewsItemInput,
  PublicTrainingEventInput,
  PublicResourceInput,
  PublicPageInput,
} from '@/types/publicContent'

let admin: TestUser
let executive: TestUser
let official: TestUser

beforeAll(async () => {
  await cleanupOrphanedTestUsers()
  await Promise.all([
    cleanupPublicNewsRows(),
    cleanupPublicPagesRows(),
    cleanupPublicResourcesRows(),
    cleanupPublicTrainingRows(),
  ])
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
  // Audit-log writes are awaited inside the handler, but be safe in case
  // a future change makes them fire-and-forget.
  await new Promise((r) => setTimeout(r, 300))
  await Promise.all([
    cleanupPublicNewsRows(),
    cleanupPublicPagesRows(),
    cleanupPublicResourcesRows(),
    cleanupPublicTrainingRows(),
  ])
})

// ---------- payload builders -----------------------------------------------
// These mirror the partial inputs the frontend sends. They aren't shared
// with the frontend because the frontend already passes raw form state
// (`Partial<PublicNewsItem>` etc.) — we rely on the imported type for
// drift detection. Tagging the search column gates cleanup.

function newsBody(
  overrides: Partial<PublicNewsItemInput> = {}
): Partial<PublicNewsItemInput> {
  const t = tag('News')
  return {
    title: t,
    slug: t.toLowerCase(),
    published_date: new Date().toISOString(),
    author: 'OAS Editorial',
    excerpt: 'Short summary for the news index.',
    body: '<p>Full article body.</p>',
    ...overrides,
  }
}

function trainingBody(
  overrides: Partial<PublicTrainingEventInput> = {}
): Partial<PublicTrainingEventInput> {
  const t = tag('Training')
  return {
    title: t,
    slug: t.toLowerCase(),
    event_date: new Date(Date.now() + 86400 * 1000 * 14).toISOString(),
    start_time: '18:00',
    end_time: '20:00',
    location: 'Example Sports Centre',
    event_type: 'workshop',
    description: '<p>Workshop description.</p>',
    ...overrides,
  }
}

function resourceBody(
  overrides: Partial<PublicResourceInput> = {}
): Partial<PublicResourceInput> {
  const t = tag('Resource')
  return {
    title: t,
    slug: t.toLowerCase(),
    category: 'Guides',
    description: '<p>Reference document for officials.</p>',
    last_updated: new Date().toISOString(),
    ...overrides,
  }
}

function pageBody(
  overrides: Partial<PublicPageInput> = {}
): Partial<PublicPageInput> {
  // page_name is the search column for cleanup, so it must carry the tag.
  const t = tag('Page')
  return {
    page_name: t,
    title: 'Test Page',
    content: { body: '<p>Page body.</p>' } as Record<string, unknown>,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------

describe('public-news — admin writes', () => {
  it('admin POST → 201 + row in DB', async () => {
    const body = newsBody()
    const res = await invokeFunction(newsHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body,
    })
    expect(res.statusCode).toBe(201)
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.body.title).toBe(body.title)

    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('public_news')
      .select('id, title, slug, author')
      .eq('id', res.body.id)
      .single()
    expect(data).not.toBeNull()
    expect(data!.title).toBe(body.title)
    expect(data!.slug).toBe(body.slug)
  })

  it('official POST → 403', async () => {
    const res = await invokeFunction(newsHandler, {
      method: 'POST',
      bearerToken: official.accessToken,
      body: newsBody(),
    })
    expect(res.statusCode).toBe(403)
  })

  it('POST missing required fields → 400', async () => {
    const res = await invokeFunction(newsHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: { title: tag('NoFields') },
    })
    expect(res.statusCode).toBe(400)
    expect(res.body.message ?? res.body.error).toMatch(/(Missing required|are all required|are required)/i)
  })

  it('admin PUT round-trip', async () => {
    const created = await invokeFunction(newsHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: newsBody(),
    })
    expect(created.statusCode).toBe(201)
    const id: string = created.body.id

    const newTitle = tag('NewsUpdated')
    const updated = await invokeFunction(newsHandler, {
      method: 'PUT',
      bearerToken: admin.accessToken,
      body: { id, title: newTitle, excerpt: 'Updated excerpt copy.' },
    })
    expect(updated.statusCode).toBe(200)
    expect(updated.body.title).toBe(newTitle)

    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('public_news')
      .select('title, excerpt')
      .eq('id', id)
      .single()
    expect(data!.title).toBe(newTitle)
    expect(data!.excerpt).toBe('Updated excerpt copy.')
  })

  it('admin DELETE → row gone', async () => {
    const created = await invokeFunction(newsHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: newsBody(),
    })
    expect(created.statusCode).toBe(201)
    const id: string = created.body.id

    const del = await invokeFunction(newsHandler, {
      method: 'DELETE',
      bearerToken: admin.accessToken,
      query: { id },
    })
    expect(del.statusCode).toBe(204)

    const sb = getSupabaseAdmin()
    const { data } = await sb.from('public_news').select('id').eq('id', id)
    expect(data).toEqual([])
  })

  it('non-admin DELETE → 403', async () => {
    const res = await invokeFunction(newsHandler, {
      method: 'DELETE',
      bearerToken: official.accessToken,
      query: { id: '00000000-0000-0000-0000-000000000000' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('GET ?slug=<seeded> returns the single row', async () => {
    const body = newsBody()
    const created = await invokeFunction(newsHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body,
    })
    expect(created.statusCode).toBe(201)

    const res = await invokeFunction(newsHandler, {
      method: 'GET',
      query: { slug: body.slug! },
    })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.body)).toBe(false)
    expect(res.body.id).toBe(created.body.id)
    expect(res.body.slug).toBe(body.slug)
  })

  // FIXED: the schema declares `slug` UNIQUE NOT NULL. The handler doesn't
  // pre-check for duplicates, but createHandler's catch now routes the
  // Postgres unique-violation (23505) through mapPgError → 409.
  // netlify/functions/_shared/handler.ts (mapPgError)
  it('POST with duplicate slug → 4xx, not 500', async () => {
    const body = newsBody()
    const first = await invokeFunction(newsHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body,
    })
    expect(first.statusCode).toBe(201)

    const dup = await invokeFunction(newsHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: { ...body, title: tag('DupSlug') },
    })
    expect(dup.statusCode).toBeGreaterThanOrEqual(400)
    expect(dup.statusCode).toBeLessThan(500)
  })

  // FIXED: the handler now pre-validates `published_date` with Date.parse
  // and returns 400 for garbage. Postgres surfaces these as 22007 which
  // mapPgError doesn't cover, hence the explicit guard in the handler.
  // netlify/functions/public-news.ts (POST published_date guard)
  it('POST with malformed published_date → 400', async () => {
    const res = await invokeFunction(newsHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: newsBody({ published_date: 'not-a-date' }),
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('public-pages — admin writes', () => {
  it('admin POST → 201 + row in DB', async () => {
    const body = pageBody()
    const res = await invokeFunction(pagesHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body,
    })
    expect(res.statusCode).toBe(201)
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.body.page_name).toBe(body.page_name)

    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('public_pages')
      .select('id, page_name, title')
      .eq('id', res.body.id)
      .single()
    expect(data).not.toBeNull()
    expect(data!.page_name).toBe(body.page_name)
  })

  it('official POST → 403', async () => {
    const res = await invokeFunction(pagesHandler, {
      method: 'POST',
      bearerToken: official.accessToken,
      body: pageBody(),
    })
    expect(res.statusCode).toBe(403)
  })

  // pages requires `admin`, NOT `admin_or_executive`. Verifying this so
  // a future loosening of the gate is caught.
  it('executive POST → 403 (pages is admin-only)', async () => {
    const res = await invokeFunction(pagesHandler, {
      method: 'POST',
      bearerToken: executive.accessToken,
      body: pageBody(),
    })
    expect(res.statusCode).toBe(403)
  })

  it('POST missing required fields → 400', async () => {
    const res = await invokeFunction(pagesHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: { page_name: tag('NoFields') },
    })
    expect(res.statusCode).toBe(400)
    expect(res.body.message ?? res.body.error).toMatch(/(Missing required|are all required|are required)/i)
  })

  it('admin PUT round-trip', async () => {
    const created = await invokeFunction(pagesHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: pageBody(),
    })
    expect(created.statusCode).toBe(201)
    const id: string = created.body.id

    const newTitle = 'Updated Page Title'
    const updated = await invokeFunction(pagesHandler, {
      method: 'PUT',
      bearerToken: admin.accessToken,
      body: { id, title: newTitle },
    })
    expect(updated.statusCode).toBe(200)
    expect(updated.body.title).toBe(newTitle)

    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('public_pages')
      .select('title')
      .eq('id', id)
      .single()
    expect(data!.title).toBe(newTitle)
  })

  it('admin DELETE → row gone', async () => {
    const created = await invokeFunction(pagesHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: pageBody(),
    })
    expect(created.statusCode).toBe(201)
    const id: string = created.body.id

    const del = await invokeFunction(pagesHandler, {
      method: 'DELETE',
      bearerToken: admin.accessToken,
      query: { id },
    })
    expect(del.statusCode).toBe(204)

    const sb = getSupabaseAdmin()
    const { data } = await sb.from('public_pages').select('id').eq('id', id)
    expect(data).toEqual([])
  })

  it('non-admin DELETE → 403', async () => {
    const res = await invokeFunction(pagesHandler, {
      method: 'DELETE',
      bearerToken: official.accessToken,
      query: { id: '00000000-0000-0000-0000-000000000000' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('GET ?page_name=<seeded> returns the single row', async () => {
    const body = pageBody()
    const created = await invokeFunction(pagesHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body,
    })
    expect(created.statusCode).toBe(201)

    const res = await invokeFunction(pagesHandler, {
      method: 'GET',
      query: { page_name: body.page_name! },
    })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.body)).toBe(false)
    expect(res.body.id).toBe(created.body.id)
    expect(res.body.page_name).toBe(body.page_name)
  })

  // FIXED: when the page_name doesn't exist, Supabase `.single()` returns
  // PGRST116 which the handler `throw`s — createHandler's catch now routes
  // PGRST116 through mapPgError → 404.
  // netlify/functions/_shared/handler.ts (mapPgError)
  it('GET ?page_name=<bogus> returns 404', async () => {
    const res = await invokeFunction(pagesHandler, {
      method: 'GET',
      query: { page_name: `${tag('Bogus')}-does-not-exist` },
    })
    expect(res.statusCode).toBe(404)
  })

  // FIXED: page_name has a UNIQUE constraint and the handler doesn't
  // pre-check, but createHandler's catch now routes the unique-violation
  // (23505) through mapPgError → 409.
  // netlify/functions/_shared/handler.ts (mapPgError)
  it('POST with duplicate page_name → 4xx, not 500', async () => {
    const body = pageBody()
    const first = await invokeFunction(pagesHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body,
    })
    expect(first.statusCode).toBe(201)

    const dup = await invokeFunction(pagesHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: { ...body, title: 'Duplicate' },
    })
    expect(dup.statusCode).toBeGreaterThanOrEqual(400)
    expect(dup.statusCode).toBeLessThan(500)
  })
})

describe('public-resources — admin writes', () => {
  it('admin POST → 201 + row in DB', async () => {
    const body = resourceBody()
    const res = await invokeFunction(resourcesHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body,
    })
    expect(res.statusCode).toBe(201)
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.body.title).toBe(body.title)

    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('public_resources')
      .select('id, title, slug, category')
      .eq('id', res.body.id)
      .single()
    expect(data).not.toBeNull()
    expect(data!.title).toBe(body.title)
    expect(data!.category).toBe('Guides')
  })

  it('official POST → 403', async () => {
    const res = await invokeFunction(resourcesHandler, {
      method: 'POST',
      bearerToken: official.accessToken,
      body: resourceBody(),
    })
    expect(res.statusCode).toBe(403)
  })

  it('POST missing required fields → 400', async () => {
    const res = await invokeFunction(resourcesHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: { title: tag('NoFields') },
    })
    expect(res.statusCode).toBe(400)
    expect(res.body.message ?? res.body.error).toMatch(/(Missing required|are all required|are required)/i)
  })

  it('admin PUT round-trip', async () => {
    const created = await invokeFunction(resourcesHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: resourceBody(),
    })
    expect(created.statusCode).toBe(201)
    const id: string = created.body.id

    const newTitle = tag('ResourceUpdated')
    const updated = await invokeFunction(resourcesHandler, {
      method: 'PUT',
      bearerToken: admin.accessToken,
      body: { id, title: newTitle, featured: true },
    })
    expect(updated.statusCode).toBe(200)
    expect(updated.body.title).toBe(newTitle)
    expect(updated.body.featured).toBe(true)

    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('public_resources')
      .select('title, featured')
      .eq('id', id)
      .single()
    expect(data!.title).toBe(newTitle)
    expect(data!.featured).toBe(true)
  })

  it('admin DELETE → row gone', async () => {
    const created = await invokeFunction(resourcesHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: resourceBody(),
    })
    expect(created.statusCode).toBe(201)
    const id: string = created.body.id

    const del = await invokeFunction(resourcesHandler, {
      method: 'DELETE',
      bearerToken: admin.accessToken,
      query: { id },
    })
    expect(del.statusCode).toBe(204)

    const sb = getSupabaseAdmin()
    const { data } = await sb.from('public_resources').select('id').eq('id', id)
    expect(data).toEqual([])
  })

  it('non-admin DELETE → 403', async () => {
    const res = await invokeFunction(resourcesHandler, {
      method: 'DELETE',
      bearerToken: official.accessToken,
      query: { id: '00000000-0000-0000-0000-000000000000' },
    })
    expect(res.statusCode).toBe(403)
  })

  // FIXED: the schema CHECK on `category` (Rulebooks, Forms, Training
  // Materials, Policies, Guides) trips Postgres for bogus values; the
  // handler doesn't pre-validate, but createHandler's catch now routes the
  // CHECK violation (23514) through mapPgError → 400.
  // netlify/functions/_shared/handler.ts (mapPgError)
  it('POST with bogus category → 400', async () => {
    const res = await invokeFunction(resourcesHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: resourceBody({ category: 'NotARealCategory' }),
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('public-training — admin writes', () => {
  it('admin POST → 201 + row in DB', async () => {
    const body = trainingBody()
    const res = await invokeFunction(trainingHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body,
    })
    expect(res.statusCode).toBe(201)
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.body.title).toBe(body.title)

    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('public_training_events')
      .select('id, title, slug, event_type')
      .eq('id', res.body.id)
      .single()
    expect(data).not.toBeNull()
    expect(data!.title).toBe(body.title)
    expect(data!.event_type).toBe('workshop')
  })

  it('official POST → 403', async () => {
    const res = await invokeFunction(trainingHandler, {
      method: 'POST',
      bearerToken: official.accessToken,
      body: trainingBody(),
    })
    expect(res.statusCode).toBe(403)
  })

  it('POST missing required fields → 400', async () => {
    const res = await invokeFunction(trainingHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: { title: tag('NoFields') },
    })
    expect(res.statusCode).toBe(400)
    expect(res.body.message ?? res.body.error).toMatch(/(Missing required|are all required|are required)/i)
  })

  it('admin PUT round-trip', async () => {
    const created = await invokeFunction(trainingHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: trainingBody(),
    })
    expect(created.statusCode).toBe(201)
    const id: string = created.body.id

    const newTitle = tag('TrainingUpdated')
    const updated = await invokeFunction(trainingHandler, {
      method: 'PUT',
      bearerToken: admin.accessToken,
      body: { id, title: newTitle, location: 'New Venue' },
    })
    expect(updated.statusCode).toBe(200)
    expect(updated.body.title).toBe(newTitle)
    expect(updated.body.location).toBe('New Venue')

    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('public_training_events')
      .select('title, location')
      .eq('id', id)
      .single()
    expect(data!.title).toBe(newTitle)
    expect(data!.location).toBe('New Venue')
  })

  it('admin DELETE → row gone', async () => {
    const created = await invokeFunction(trainingHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: trainingBody(),
    })
    expect(created.statusCode).toBe(201)
    const id: string = created.body.id

    const del = await invokeFunction(trainingHandler, {
      method: 'DELETE',
      bearerToken: admin.accessToken,
      query: { id },
    })
    expect(del.statusCode).toBe(204)

    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('public_training_events')
      .select('id')
      .eq('id', id)
    expect(data).toEqual([])
  })

  it('non-admin DELETE → 403', async () => {
    const res = await invokeFunction(trainingHandler, {
      method: 'DELETE',
      bearerToken: official.accessToken,
      query: { id: '00000000-0000-0000-0000-000000000000' },
    })
    expect(res.statusCode).toBe(403)
  })

  // FIXED: the schema CHECK on `event_type` (workshop, certification,
  // refresher, meeting) trips Postgres for bogus values; the handler
  // doesn't pre-validate, but createHandler's catch now routes the CHECK
  // violation (23514) through mapPgError → 400.
  // netlify/functions/_shared/handler.ts (mapPgError)
  it('POST with bogus event_type → 400', async () => {
    const res = await invokeFunction(trainingHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: trainingBody({ event_type: 'tournament' as never }),
    })
    expect(res.statusCode).toBe(400)
  })
})
