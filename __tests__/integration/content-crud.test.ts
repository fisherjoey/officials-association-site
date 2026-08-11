/**
 * Integration tests for the three "simple content CRUD" Netlify functions:
 *   - netlify/functions/newsletters.ts          (newsletters table)
 *   - netlify/functions/scheduler-updates.ts    (scheduler_updates table)
 *   - netlify/functions/rule-modifications.ts   (rule_modifications table)
 *
 * All three share the same handler shape (admin_or_executive for write,
 * authenticated for read, body spread directly into insert/update). One
 * `describe` per handler — admin/official users are minted once in
 * beforeAll and reused across all three suites.
 *
 * GET-side auth gates are covered in `portal.test.ts`; this file
 * exercises POST / PUT / DELETE.
 *
 * Drift check: each frontend caller (TheBounceClient, scheduler-updates
 * page, RuleModificationsClient) collects form fields and ships them to
 * the handler with no transformation — the wire shape IS the form
 * state. None warrants extracting a payload-builder; we declare local
 * payload types that match the DB column set, and TS will fail at
 * compile time if the underlying schemas drift.
 */
import { handler as newslettersHandler } from '@/netlify/functions/newsletters'
import { handler as schedulerHandler } from '@/netlify/functions/scheduler-updates'
import { handler as ruleModsHandler } from '@/netlify/functions/rule-modifications'

import { invokeFunction } from './helpers/invokeFunction'
import {
  cleanupNewslettersRows,
  cleanupSchedulerUpdatesRows,
  cleanupRuleModificationsRows,
} from './helpers/cleanup'
import { getSupabaseAdmin, tag } from './helpers/supabase'
import {
  cleanupOrphanedTestUsers,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from './helpers/auth'

// ---------------------------------------------------------------------------
// Shared setup — one admin + one official across all three describe blocks.
// ---------------------------------------------------------------------------

let admin: TestUser
let official: TestUser

beforeAll(async () => {
  await cleanupOrphanedTestUsers()
  await Promise.all([
    cleanupNewslettersRows(),
    cleanupSchedulerUpdatesRows(),
    cleanupRuleModificationsRows(),
  ])
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
  // Audit-log inserts are awaited inside each handler, but be safe.
  await new Promise((r) => setTimeout(r, 200))
  await Promise.all([
    cleanupNewslettersRows(),
    cleanupSchedulerUpdatesRows(),
    cleanupRuleModificationsRows(),
  ])
})

const NIL_UUID = '00000000-0000-0000-0000-000000000000'

// ===========================================================================
// 1) newsletters
// ===========================================================================

interface NewsletterPayload {
  title: string
  date: string // YYYY-MM-DD
  description?: string
  file_name: string
  file_url: string
  file_size?: number
  is_featured?: boolean
}

const validNewsletter = (
  overrides: Partial<NewsletterPayload> = {}
): NewsletterPayload => ({
  title: tag('Newsletter'),
  date: '2030-01-15',
  description: 'Integration test newsletter row.',
  file_name: 'test.pdf',
  file_url: 'https://example.test/test.pdf',
  file_size: 1024,
  is_featured: false,
  ...overrides,
})

describe('newsletters', () => {
  describe('POST', () => {
    it('rejects POST without auth → 401', async () => {
      const res = await invokeFunction(newslettersHandler, {
        method: 'POST',
        body: validNewsletter(),
      })
      expect(res.statusCode).toBe(401)
    })

    it('rejects POST from an "official" role → 403', async () => {
      const res = await invokeFunction(newslettersHandler, {
        method: 'POST',
        bearerToken: official.accessToken,
        body: validNewsletter(),
      })
      expect(res.statusCode).toBe(403)
    })

    it('admin can POST → 201 + row in DB', async () => {
      const title = tag('NewsAdminPOST')
      const res = await invokeFunction(newslettersHandler, {
        method: 'POST',
        bearerToken: admin.accessToken,
        body: validNewsletter({ title }),
      })
      expect(res.statusCode).toBe(201)
      expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(res.body.title).toBe(title)

      const sb = getSupabaseAdmin()
      const { data } = await sb
        .from('newsletters')
        .select('id, title, file_url, is_featured')
        .eq('id', res.body.id)
        .single()
      expect(data).not.toBeNull()
      expect(data!.title).toBe(title)
      expect(data!.file_url).toBe('https://example.test/test.pdf')
    })

    // FIXED: shared mapPgError maps NOT NULL violations (23502) to 400.
    // netlify/functions/newsletters.ts:21
    it('POST with missing required fields → 400', async () => {
      const res = await invokeFunction(newslettersHandler, {
        method: 'POST',
        bearerToken: admin.accessToken,
        body: {},
      })
      expect(res.statusCode).toBe(400)
    })

    // FIXED: handler now rejects non-boolean is_featured up front with 400.
    // (Postgres also returns 22P02 → 400 via mapPgError, but the explicit
    // guard guarantees a stable error shape regardless of driver coercion.)
    // netlify/functions/newsletters.ts:21
    it('POST with non-boolean is_featured → 400', async () => {
      const res = await invokeFunction(newslettersHandler, {
        method: 'POST',
        bearerToken: admin.accessToken,
        body: validNewsletter({
          title: tag('BadFeatured'),
          is_featured: 'yes-please' as unknown as boolean,
        }),
      })
      expect(res.statusCode).toBe(400)
    })
  })

  describe('PUT', () => {
    it('admin PUT round-trip: insert → modify → read-back', async () => {
      const title = tag('NewsPUTOriginal')
      const created = await invokeFunction(newslettersHandler, {
        method: 'POST',
        bearerToken: admin.accessToken,
        body: validNewsletter({ title }),
      })
      expect(created.statusCode).toBe(201)
      const id: string = created.body.id

      const updatedTitle = tag('NewsPUTUpdated')
      const updated = await invokeFunction(newslettersHandler, {
        method: 'PUT',
        bearerToken: admin.accessToken,
        body: { id, title: updatedTitle, description: 'Updated description.' },
      })
      expect(updated.statusCode).toBe(200)
      expect(updated.body.id).toBe(id)
      expect(updated.body.title).toBe(updatedTitle)

      const sb = getSupabaseAdmin()
      const { data } = await sb
        .from('newsletters')
        .select('title, description')
        .eq('id', id)
        .single()
      expect(data!.title).toBe(updatedTitle)
      expect(data!.description).toBe('Updated description.')
    })

    it('PUT without id → 400', async () => {
      const res = await invokeFunction(newslettersHandler, {
        method: 'PUT',
        bearerToken: admin.accessToken,
        body: { title: tag('NoIdPUT') },
      })
      expect(res.statusCode).toBe(400)
      expect(res.body.message ?? res.body.error).toMatch(/(ID is required|must be selected)/i)
    })

    it('non-admin PUT → 403', async () => {
      const res = await invokeFunction(newslettersHandler, {
        method: 'PUT',
        bearerToken: official.accessToken,
        body: { id: NIL_UUID, title: 'nope' },
      })
      expect(res.statusCode).toBe(403)
    })

    // FIXED: shared mapPgError now maps PGRST116 (.single() with 0 rows)
    // to 404 "Not found".
    // netlify/functions/newsletters.ts:60
    it('PUT with non-existent id → 404', async () => {
      const res = await invokeFunction(newslettersHandler, {
        method: 'PUT',
        bearerToken: admin.accessToken,
        body: { id: NIL_UUID, title: tag('NotFound') },
      })
      expect(res.statusCode).toBe(404)
    })
  })

  describe('DELETE', () => {
    it('admin DELETE → row gone', async () => {
      const title = tag('NewsDeleteMe')
      const created = await invokeFunction(newslettersHandler, {
        method: 'POST',
        bearerToken: admin.accessToken,
        body: validNewsletter({ title }),
      })
      expect(created.statusCode).toBe(201)
      const id: string = created.body.id

      const del = await invokeFunction(newslettersHandler, {
        method: 'DELETE',
        bearerToken: admin.accessToken,
        query: { id },
      })
      expect(del.statusCode).toBe(204)

      const sb = getSupabaseAdmin()
      const { data } = await sb.from('newsletters').select('id').eq('id', id)
      expect(data).toEqual([])
    })

    it('non-admin DELETE → 403', async () => {
      const res = await invokeFunction(newslettersHandler, {
        method: 'DELETE',
        bearerToken: official.accessToken,
        query: { id: NIL_UUID },
      })
      expect(res.statusCode).toBe(403)
    })
  })
})

// ===========================================================================
// 2) scheduler-updates
// ===========================================================================

interface SchedulerUpdatePayload {
  title: string
  content: string
  author?: string
  date?: string
}

const validSchedulerUpdate = (
  overrides: Partial<SchedulerUpdatePayload> = {}
): SchedulerUpdatePayload => ({
  title: tag('SchedulerUpdate'),
  content: '<p>Integration test scheduler update body.</p>',
  author: 'Scheduler',
  date: new Date('2030-01-15T12:00:00.000Z').toISOString(),
  ...overrides,
})

describe('scheduler-updates', () => {
  describe('POST', () => {
    it('rejects POST without auth → 401', async () => {
      const res = await invokeFunction(schedulerHandler, {
        method: 'POST',
        body: validSchedulerUpdate(),
      })
      expect(res.statusCode).toBe(401)
    })

    it('rejects POST from an "official" role → 403', async () => {
      const res = await invokeFunction(schedulerHandler, {
        method: 'POST',
        bearerToken: official.accessToken,
        body: validSchedulerUpdate(),
      })
      expect(res.statusCode).toBe(403)
    })

    it('admin can POST → 201 + row in DB', async () => {
      const title = tag('SchedAdminPOST')
      const res = await invokeFunction(schedulerHandler, {
        method: 'POST',
        bearerToken: admin.accessToken,
        body: validSchedulerUpdate({ title }),
      })
      expect(res.statusCode).toBe(201)
      expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(res.body.title).toBe(title)
      expect(res.body.author).toBe('Scheduler')

      const sb = getSupabaseAdmin()
      const { data } = await sb
        .from('scheduler_updates')
        .select('id, title, content, author')
        .eq('id', res.body.id)
        .single()
      expect(data).not.toBeNull()
      expect(data!.title).toBe(title)
    })

    it('POST without explicit date → handler defaults to now()', async () => {
      const title = tag('SchedNoDate')
      const before = Date.now()
      const res = await invokeFunction(schedulerHandler, {
        method: 'POST',
        bearerToken: admin.accessToken,
        body: { title, content: 'No date supplied.', author: 'Scheduler' },
      })
      expect(res.statusCode).toBe(201)
      // Handler does `body.date || new Date().toISOString()`.
      const stamp = new Date(res.body.date).getTime()
      expect(stamp).toBeGreaterThanOrEqual(before - 1000)
      expect(stamp).toBeLessThanOrEqual(Date.now() + 1000)
    })

    // FIXED: shared mapPgError maps NOT NULL violations (23502) to 400.
    // netlify/functions/scheduler-updates.ts:23
    it('POST with missing required fields → 400', async () => {
      const res = await invokeFunction(schedulerHandler, {
        method: 'POST',
        bearerToken: admin.accessToken,
        body: {},
      })
      expect(res.statusCode).toBe(400)
    })

    // FIXED: handler now validates body.date with `new Date(...)` before
    // insert. Postgres returns 22007 (not 22P02) for malformed timestamps,
    // which mapPgError doesn't recognize, so we guard explicitly.
    // netlify/functions/scheduler-updates.ts:30
    it('POST with malformed date → 400', async () => {
      const res = await invokeFunction(schedulerHandler, {
        method: 'POST',
        bearerToken: admin.accessToken,
        body: validSchedulerUpdate({
          title: tag('SchedBadDate'),
          date: 'not-a-date',
        }),
      })
      expect(res.statusCode).toBe(400)
    })
  })

  describe('PUT', () => {
    it('admin PUT round-trip: insert → modify → read-back', async () => {
      const title = tag('SchedPUTOriginal')
      const created = await invokeFunction(schedulerHandler, {
        method: 'POST',
        bearerToken: admin.accessToken,
        body: validSchedulerUpdate({ title }),
      })
      expect(created.statusCode).toBe(201)
      const id: string = created.body.id

      const updatedTitle = tag('SchedPUTUpdated')
      const updated = await invokeFunction(schedulerHandler, {
        method: 'PUT',
        bearerToken: admin.accessToken,
        body: { id, title: updatedTitle, content: '<p>updated</p>' },
      })
      expect(updated.statusCode).toBe(200)
      expect(updated.body.id).toBe(id)
      expect(updated.body.title).toBe(updatedTitle)

      const sb = getSupabaseAdmin()
      const { data } = await sb
        .from('scheduler_updates')
        .select('title, content')
        .eq('id', id)
        .single()
      expect(data!.title).toBe(updatedTitle)
      expect(data!.content).toBe('<p>updated</p>')
    })

    it('PUT without id → 400', async () => {
      const res = await invokeFunction(schedulerHandler, {
        method: 'PUT',
        bearerToken: admin.accessToken,
        body: { title: tag('SchedNoIdPUT') },
      })
      expect(res.statusCode).toBe(400)
      expect(res.body.message ?? res.body.error).toMatch(/(ID is required|must be selected)/i)
    })

    it('non-admin PUT → 403', async () => {
      const res = await invokeFunction(schedulerHandler, {
        method: 'PUT',
        bearerToken: official.accessToken,
        body: { id: NIL_UUID, title: 'nope' },
      })
      expect(res.statusCode).toBe(403)
    })

    // FIXED: handler now checks `data.length === 0` after .update().select()
    //        and returns 404 when the id didn't match any row.
    // netlify/functions/scheduler-updates.ts:68
    it('PUT with non-existent id → 404', async () => {
      const res = await invokeFunction(schedulerHandler, {
        method: 'PUT',
        bearerToken: admin.accessToken,
        body: { id: NIL_UUID, title: tag('SchedNotFound') },
      })
      expect(res.statusCode).toBe(404)
    })
  })

  describe('DELETE', () => {
    it('admin DELETE → row gone', async () => {
      const title = tag('SchedDeleteMe')
      const created = await invokeFunction(schedulerHandler, {
        method: 'POST',
        bearerToken: admin.accessToken,
        body: validSchedulerUpdate({ title }),
      })
      expect(created.statusCode).toBe(201)
      const id: string = created.body.id

      const del = await invokeFunction(schedulerHandler, {
        method: 'DELETE',
        bearerToken: admin.accessToken,
        query: { id },
      })
      expect(del.statusCode).toBe(204)

      const sb = getSupabaseAdmin()
      const { data } = await sb
        .from('scheduler_updates')
        .select('id')
        .eq('id', id)
      expect(data).toEqual([])
    })

    it('non-admin DELETE → 403', async () => {
      const res = await invokeFunction(schedulerHandler, {
        method: 'DELETE',
        bearerToken: official.accessToken,
        query: { id: NIL_UUID },
      })
      expect(res.statusCode).toBe(403)
    })
  })
})

// ===========================================================================
// 3) rule-modifications
// ===========================================================================

interface RuleModificationPayload {
  title: string
  category: string
  summary?: string
  content: string
  active?: boolean
  priority?: number
  effective_date?: string
}

const validRuleMod = (
  overrides: Partial<RuleModificationPayload> = {}
): RuleModificationPayload => ({
  title: tag('RuleMod'),
  category: 'Club Tournament',
  summary: 'Integration test rule modification.',
  content: '<p>Test rule body.</p>',
  active: true,
  ...overrides,
})

describe('rule-modifications', () => {
  describe('POST', () => {
    it('rejects POST without auth → 401', async () => {
      const res = await invokeFunction(ruleModsHandler, {
        method: 'POST',
        body: validRuleMod(),
      })
      expect(res.statusCode).toBe(401)
    })

    it('rejects POST from an "official" role → 403', async () => {
      const res = await invokeFunction(ruleModsHandler, {
        method: 'POST',
        bearerToken: official.accessToken,
        body: validRuleMod(),
      })
      expect(res.statusCode).toBe(403)
    })

    it('admin can POST → 201 + row in DB', async () => {
      const title = tag('RuleAdminPOST')
      const res = await invokeFunction(ruleModsHandler, {
        method: 'POST',
        bearerToken: admin.accessToken,
        body: validRuleMod({ title }),
      })
      expect(res.statusCode).toBe(201)
      expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(res.body.title).toBe(title)
      expect(res.body.category).toBe('Club Tournament')

      const sb = getSupabaseAdmin()
      const { data } = await sb
        .from('rule_modifications')
        .select('id, title, category, content, active')
        .eq('id', res.body.id)
        .single()
      expect(data).not.toBeNull()
      expect(data!.title).toBe(title)
      expect(data!.active).toBe(true)
    })

    // FIXED: shared mapPgError maps NOT NULL violations (23502) to 400.
    // netlify/functions/rule-modifications.ts:22
    it('POST with missing required fields → 400', async () => {
      const res = await invokeFunction(ruleModsHandler, {
        method: 'POST',
        bearerToken: admin.accessToken,
        body: {},
      })
      expect(res.statusCode).toBe(400)
    })

    // FIXED: rule-modifications POST now validates `category` against
    // the RULE_CATEGORIES enum (the same set the frontend dropdown uses
    // — single source of truth in lib/schemas/rule-modification.ts).
    // Bogus values now 400 with the allowed set in the message.
    it('POST with bogus category → 400', async () => {
      const res = await invokeFunction(ruleModsHandler, {
        method: 'POST',
        bearerToken: admin.accessToken,
        body: validRuleMod({
          title: tag('BadCat'),
          category: 'NOT-A-REAL-CATEGORY-' + Date.now(),
        }),
      })
      expect(res.statusCode).toBe(400)
    })
  })

  describe('PUT', () => {
    it('admin PUT round-trip: insert → modify → read-back', async () => {
      const title = tag('RulePUTOriginal')
      const created = await invokeFunction(ruleModsHandler, {
        method: 'POST',
        bearerToken: admin.accessToken,
        body: validRuleMod({ title }),
      })
      expect(created.statusCode).toBe(201)
      const id: string = created.body.id

      const updatedTitle = tag('RulePUTUpdated')
      const updated = await invokeFunction(ruleModsHandler, {
        method: 'PUT',
        bearerToken: admin.accessToken,
        body: {
          id,
          title: updatedTitle,
          summary: 'Updated summary.',
          category: 'High School',
        },
      })
      expect(updated.statusCode).toBe(200)
      expect(updated.body.id).toBe(id)
      expect(updated.body.title).toBe(updatedTitle)
      expect(updated.body.category).toBe('High School')

      const sb = getSupabaseAdmin()
      const { data } = await sb
        .from('rule_modifications')
        .select('title, summary, category')
        .eq('id', id)
        .single()
      expect(data!.title).toBe(updatedTitle)
      expect(data!.summary).toBe('Updated summary.')
      expect(data!.category).toBe('High School')
    })

    it('PUT without id → 400', async () => {
      const res = await invokeFunction(ruleModsHandler, {
        method: 'PUT',
        bearerToken: admin.accessToken,
        body: { title: tag('RuleNoIdPUT') },
      })
      expect(res.statusCode).toBe(400)
      expect(res.body.message ?? res.body.error).toMatch(/(ID is required|must be selected)/i)
    })

    it('non-admin PUT → 403', async () => {
      const res = await invokeFunction(ruleModsHandler, {
        method: 'PUT',
        bearerToken: official.accessToken,
        body: { id: NIL_UUID, title: 'nope' },
      })
      expect(res.statusCode).toBe(403)
    })

    // FIXED: shared mapPgError now maps PGRST116 (.single() with 0 rows)
    // to 404 "Not found".
    // netlify/functions/rule-modifications.ts:62
    it('PUT with non-existent id → 404', async () => {
      const res = await invokeFunction(ruleModsHandler, {
        method: 'PUT',
        bearerToken: admin.accessToken,
        body: { id: NIL_UUID, title: tag('RuleNotFound') },
      })
      expect(res.statusCode).toBe(404)
    })
  })

  describe('DELETE', () => {
    it('admin DELETE → row gone', async () => {
      const title = tag('RuleDeleteMe')
      const created = await invokeFunction(ruleModsHandler, {
        method: 'POST',
        bearerToken: admin.accessToken,
        body: validRuleMod({ title }),
      })
      expect(created.statusCode).toBe(201)
      const id: string = created.body.id

      const del = await invokeFunction(ruleModsHandler, {
        method: 'DELETE',
        bearerToken: admin.accessToken,
        query: { id },
      })
      expect(del.statusCode).toBe(204)

      const sb = getSupabaseAdmin()
      const { data } = await sb
        .from('rule_modifications')
        .select('id')
        .eq('id', id)
      expect(data).toEqual([])
    })

    it('non-admin DELETE → 403', async () => {
      const res = await invokeFunction(ruleModsHandler, {
        method: 'DELETE',
        bearerToken: official.accessToken,
        query: { id: NIL_UUID },
      })
      expect(res.statusCode).toBe(403)
    })

    // FIXED: GET now reads ?active=true|false|all (defaults to true) so
    // admins can list deactivated rules. Mirrors the announcements
    // `published_only` filter pattern.
    // netlify/functions/rule-modifications.ts:8
    it('GET ?active=false returns deactivated rule modifications', async () => {
      const inactiveTitle = tag('RuleInactive')
      // Insert directly via admin client because the handler accepts
      // active=false in POST body.
      const sb = getSupabaseAdmin()
      const { data: inserted, error } = await sb
        .from('rule_modifications')
        .insert([
          {
            title: inactiveTitle,
            category: 'Club Tournament',
            content: '<p>inactive body</p>',
            active: false,
          },
        ])
        .select()
        .single()
      expect(error).toBeNull()
      expect(inserted).not.toBeNull()

      const res = await invokeFunction(ruleModsHandler, {
        method: 'GET',
        bearerToken: admin.accessToken,
        query: { active: 'false' },
      })
      expect(res.statusCode).toBe(200)
      const titles = (res.body as Array<{ title: string }>).map((r) => r.title)
      expect(titles).toContain(inactiveTitle)
    })
  })
})
