/**
 * Integration tests for the four admin-managed list handlers:
 *   - netlify/functions/officials.ts          (admin_or_executive)
 *   - netlify/functions/executive-team.ts     (admin only)
 *   - netlify/functions/member-activities.ts  (admin_or_executive)
 *   - netlify/functions/resources.ts          (admin_or_executive)
 *
 * Each handler has one describe block. We hit a real Supabase, mint test
 * users once in beforeAll, tag every row, and clean up on entry + exit.
 * Read-only auth gates (GET 401 / 200) are already covered in
 * portal.test.ts; this file focuses on POST / PUT / DELETE.
 *
 * Drift check: each handler now exports its request payload interface
 * (mirrors the announcements pattern). Tests bind to those types directly
 * — TypeScript fails compilation if the wire shape drifts.
 */
import {
  handler as officialsHandler,
  type OfficialCreatePayload,
  type OfficialUpdatePayload,
} from '@/netlify/functions/officials'
import {
  handler as executiveTeamHandler,
  type ExecutiveTeamCreatePayload,
  type ExecutiveTeamUpdatePayload,
} from '@/netlify/functions/executive-team'
import {
  handler as memberActivitiesHandler,
  type MemberActivityCreatePayload,
  type MemberActivityUpdatePayload,
} from '@/netlify/functions/member-activities'
import {
  handler as resourcesHandler,
  type ResourceCreatePayload,
  type ResourceUpdatePayload,
} from '@/netlify/functions/resources'

import { invokeFunction } from './helpers/invokeFunction'
import {
  cleanupOfficialsRows,
  cleanupExecutiveTeamRows,
  cleanupMemberActivitiesRows,
  cleanupResourcesRows,
  cleanupMembersRows,
} from './helpers/cleanup'
import { getSupabaseAdmin, tag } from './helpers/supabase'
import {
  cleanupOrphanedTestUsers,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from './helpers/auth'
import { seedMember, type SeededMember } from './helpers/seedMember'

let admin: TestUser
let executive: TestUser
let official: TestUser
/** Members row for the admin user — needed for member_activities FK. */
let memberRow: SeededMember

beforeAll(async () => {
  await cleanupOrphanedTestUsers()
  await Promise.all([
    cleanupOfficialsRows(),
    cleanupExecutiveTeamRows(),
    cleanupMemberActivitiesRows(),
    cleanupResourcesRows(),
    cleanupMembersRows(),
  ])
  ;[admin, executive, official] = await Promise.all([
    createTestUser('admin'),
    createTestUser('executive'),
    createTestUser('official'),
  ])
  // member_activities.member_id is FK to members.id — seed a row tied to
  // the admin user so the create path has a valid target.
  memberRow = await seedMember(admin, { name: tag('AdminMember') })
}, 30_000)

afterAll(async () => {
  await Promise.all([
    admin && deleteTestUser(admin),
    executive && deleteTestUser(executive),
    official && deleteTestUser(official),
  ])
  // Audit-log writes are awaited inside the handler, but a small flush
  // window keeps us in line with the cleanup contract from PATTERN.md.
  await new Promise((r) => setTimeout(r, 300))
  // member_activities first (has FK to members), then everything else.
  await cleanupMemberActivitiesRows()
  await Promise.all([
    cleanupOfficialsRows(),
    cleanupExecutiveTeamRows(),
    cleanupResourcesRows(),
    cleanupMembersRows(),
  ])
})

// ============================================================================
// officials — admin_or_executive
// ============================================================================
describe('officials — POST/PUT/DELETE', () => {
  const validBody = (
    overrides: Partial<OfficialCreatePayload> = {}
  ): OfficialCreatePayload => ({
    name: tag('Official'),
    level: 3,
    email: 'official@example.test',
    bio: 'Integration test official bio',
    active: true,
    priority: 0,
    ...overrides,
  })

  it('rejects POST without auth', async () => {
    const res = await invokeFunction(officialsHandler, {
      method: 'POST',
      body: validBody(),
    })
    expect(res.statusCode).toBe(401)
  })

  it('rejects POST from an "official" role with 403', async () => {
    const res = await invokeFunction(officialsHandler, {
      method: 'POST',
      bearerToken: official.accessToken,
      body: validBody(),
    })
    expect(res.statusCode).toBe(403)
  })

  it('admin can POST → 201 + row in DB', async () => {
    const name = tag('OfficialAdmin')
    const res = await invokeFunction(officialsHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: validBody({ name, level: 2 }),
    })
    expect(res.statusCode).toBe(201)
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.body.name).toBe(name)
    expect(res.body.level).toBe(2)

    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('officials')
      .select('id, name, level')
      .eq('id', res.body.id)
      .single()
    expect(data).not.toBeNull()
    expect(data!.name).toBe(name)
  })

  it('executive can POST → 201 (admin_or_executive auth)', async () => {
    const name = tag('OfficialExec')
    const res = await invokeFunction(officialsHandler, {
      method: 'POST',
      bearerToken: executive.accessToken,
      body: validBody({ name }),
    })
    expect(res.statusCode).toBe(201)
    expect(res.body.name).toBe(name)
  })

  it('POST without name → 400', async () => {
    const res = await invokeFunction(officialsHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: { level: 3 } as unknown as OfficialCreatePayload,
    })
    expect(res.statusCode).toBe(400)
    expect(res.body.message ?? res.body.error).toMatch(/name/i)
  })

  // FIXED: shared `mapPgError` in `_shared/handler` now turns the schema's
  // 23514 check_violation (`level BETWEEN 1 AND 5`) into a 400. No
  // handler-level validation needed — DB is the source of truth.
  it('POST with out-of-range level → 400', async () => {
    const res = await invokeFunction(officialsHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: validBody({ name: tag('BadLevel'), level: 99 }),
    })
    expect(res.statusCode).toBe(400)
  })

  it('admin PUT round-trip: insert → modify → read back', async () => {
    const created = await invokeFunction(officialsHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: validBody({ name: tag('OfficialPUTOriginal'), level: 1 }),
    })
    expect(created.statusCode).toBe(201)
    const id: string = created.body.id

    const updatedName = tag('OfficialPUTUpdated')
    const updateBody: OfficialUpdatePayload = {
      id,
      name: updatedName,
      level: 4,
    }
    const updated = await invokeFunction(officialsHandler, {
      method: 'PUT',
      bearerToken: admin.accessToken,
      body: updateBody,
    })
    expect(updated.statusCode).toBe(200)
    expect(updated.body.name).toBe(updatedName)
    expect(updated.body.level).toBe(4)

    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('officials')
      .select('name, level')
      .eq('id', id)
      .single()
    expect(data!.name).toBe(updatedName)
    expect(data!.level).toBe(4)
  })

  it('PUT without id → 400', async () => {
    const res = await invokeFunction(officialsHandler, {
      method: 'PUT',
      bearerToken: admin.accessToken,
      body: { name: tag('NoIdOfficial') },
    })
    expect(res.statusCode).toBe(400)
    expect(res.body.message ?? res.body.error).toMatch(/(ID is required|must be selected)/i)
  })

  it('admin DELETE → row gone', async () => {
    const created = await invokeFunction(officialsHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: validBody({ name: tag('OfficialDelete') }),
    })
    expect(created.statusCode).toBe(201)
    const id: string = created.body.id

    const del = await invokeFunction(officialsHandler, {
      method: 'DELETE',
      bearerToken: admin.accessToken,
      query: { id },
    })
    expect(del.statusCode).toBe(204)

    const sb = getSupabaseAdmin()
    const { data } = await sb.from('officials').select('id').eq('id', id)
    expect(data).toEqual([])
  })

  it('DELETE without id → 400', async () => {
    const res = await invokeFunction(officialsHandler, {
      method: 'DELETE',
      bearerToken: admin.accessToken,
    })
    expect(res.statusCode).toBe(400)
    expect(res.body.message ?? res.body.error).toMatch(/(ID is required|must be selected)/i)
  })
})

// ============================================================================
// executive-team — admin only
// ============================================================================
describe('executive-team — POST/PUT/DELETE', () => {
  const validBody = (
    overrides: Partial<ExecutiveTeamCreatePayload> = {}
  ): ExecutiveTeamCreatePayload => ({
    name: tag('Exec'),
    position: 'President',
    email: 'exec@example.test',
    bio: 'Integration test exec bio',
    active: true,
    priority: 50,
    ...overrides,
  })

  it('rejects POST without auth', async () => {
    const res = await invokeFunction(executiveTeamHandler, {
      method: 'POST',
      body: validBody(),
    })
    expect(res.statusCode).toBe(401)
  })

  it('rejects POST from an "official" role with 403', async () => {
    const res = await invokeFunction(executiveTeamHandler, {
      method: 'POST',
      bearerToken: official.accessToken,
      body: validBody(),
    })
    expect(res.statusCode).toBe(403)
  })

  // executive-team is admin-only (NOT admin_or_executive). An "executive"
  // role user MUST get 403 — anything else means the auth gate drifted.
  it('rejects POST from an "executive" role with 403 (admin-only)', async () => {
    const res = await invokeFunction(executiveTeamHandler, {
      method: 'POST',
      bearerToken: executive.accessToken,
      body: validBody({ name: tag('ExecByExec') }),
    })
    expect(res.statusCode).toBe(403)
  })

  it('admin can POST → 201 + row in DB', async () => {
    const name = tag('ExecAdmin')
    const res = await invokeFunction(executiveTeamHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: validBody({ name, position: 'Treasurer' }),
    })
    expect(res.statusCode).toBe(201)
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.body.name).toBe(name)
    expect(res.body.position).toBe('Treasurer')

    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('executive_team')
      .select('id, name, position, email')
      .eq('id', res.body.id)
      .single()
    expect(data).not.toBeNull()
    expect(data!.name).toBe(name)
  })

  it('POST missing required fields → 400', async () => {
    const res = await invokeFunction(executiveTeamHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: { name: tag('Incomplete') } as unknown as ExecutiveTeamCreatePayload,
    })
    expect(res.statusCode).toBe(400)
    expect(res.body.message ?? res.body.error).toMatch(/required/i)
  })

  it('admin PUT round-trip: insert → modify → read back', async () => {
    const created = await invokeFunction(executiveTeamHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: validBody({ name: tag('ExecPUTOriginal') }),
    })
    expect(created.statusCode).toBe(201)
    const id: string = created.body.id

    const updatedName = tag('ExecPUTUpdated')
    const updateBody: ExecutiveTeamUpdatePayload = {
      id,
      name: updatedName,
      position: 'Vice President',
    }
    const updated = await invokeFunction(executiveTeamHandler, {
      method: 'PUT',
      bearerToken: admin.accessToken,
      body: updateBody,
    })
    expect(updated.statusCode).toBe(200)
    expect(updated.body.name).toBe(updatedName)
    expect(updated.body.position).toBe('Vice President')

    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('executive_team')
      .select('name, position')
      .eq('id', id)
      .single()
    expect(data!.name).toBe(updatedName)
    expect(data!.position).toBe('Vice President')
  })

  it('admin DELETE → row gone', async () => {
    const created = await invokeFunction(executiveTeamHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: validBody({ name: tag('ExecDelete') }),
    })
    expect(created.statusCode).toBe(201)
    const id: string = created.body.id

    const del = await invokeFunction(executiveTeamHandler, {
      method: 'DELETE',
      bearerToken: admin.accessToken,
      query: { id },
    })
    expect(del.statusCode).toBe(204)

    const sb = getSupabaseAdmin()
    const { data } = await sb.from('executive_team').select('id').eq('id', id)
    expect(data).toEqual([])
  })

  it('DELETE without id → 400', async () => {
    const res = await invokeFunction(executiveTeamHandler, {
      method: 'DELETE',
      bearerToken: admin.accessToken,
    })
    expect(res.statusCode).toBe(400)
    expect(res.body.message ?? res.body.error).toMatch(/(ID is required|must be selected)/i)
  })
})

// ============================================================================
// member-activities — admin_or_executive
// ============================================================================
describe('member-activities — POST/PUT/DELETE', () => {
  // NOTE: the deployed `member_activities` table has no `description`
  // column even though `cleanupMemberActivitiesRows` cleans by it (the
  // helper is therefore a no-op). We tag via `notes` instead, and rely
  // on `ON DELETE CASCADE` from the members FK to drop activity rows
  // when their parent member is cleaned up in afterAll.
  const validBody = (
    overrides: Partial<MemberActivityCreatePayload> = {}
  ): MemberActivityCreatePayload => ({
    member_id: memberRow.id,
    activity_type: 'training',
    activity_date: '2030-06-15',
    notes: tag('Activity'),
    ...overrides,
  })

  it('rejects POST without auth', async () => {
    const res = await invokeFunction(memberActivitiesHandler, {
      method: 'POST',
      body: validBody(),
    })
    expect(res.statusCode).toBe(401)
  })

  it('rejects POST from an "official" role with 403', async () => {
    const res = await invokeFunction(memberActivitiesHandler, {
      method: 'POST',
      bearerToken: official.accessToken,
      body: validBody(),
    })
    expect(res.statusCode).toBe(403)
  })

  it('admin can POST → 201 + row in DB', async () => {
    const notes = tag('AdminActivity')
    const res = await invokeFunction(memberActivitiesHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: validBody({ notes, activity_type: 'meeting' }),
    })
    expect(res.statusCode).toBe(201)
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.body.activity_type).toBe('meeting')
    expect(res.body.member_id).toBe(memberRow.id)

    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('member_activities')
      .select('id, activity_type, member_id, notes')
      .eq('id', res.body.id)
      .single()
    expect(data).not.toBeNull()
    expect(data!.notes).toBe(notes)
  })

  it('executive can POST → 201 (admin_or_executive auth)', async () => {
    const notes = tag('ExecActivity')
    const res = await invokeFunction(memberActivitiesHandler, {
      method: 'POST',
      bearerToken: executive.accessToken,
      body: validBody({ notes }),
    })
    expect(res.statusCode).toBe(201)
    expect(res.body.notes).toBe(notes)
  })

  // FIXED: shared `mapPgError` turns 23502 not-null violations into 400s
  // automatically; the handler doesn't need explicit field validation.
  it('POST with missing required fields → 400', async () => {
    const res = await invokeFunction(memberActivitiesHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: {} as unknown as MemberActivityCreatePayload,
    })
    expect(res.statusCode).toBe(400)
  })

  // FIXED: handler now validates `activity_type` against the documented
  // enum on POST and PUT, so bogus values 400 instead of round-tripping.
  it('POST with bogus activity_type → 400', async () => {
    const res = await invokeFunction(memberActivitiesHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: validBody({
        notes: tag('BadType'),
        activity_type: 'not-a-real-type',
      }),
    })
    expect(res.statusCode).toBe(400)
  })

  it('admin PUT round-trip: insert → modify → read back', async () => {
    const created = await invokeFunction(memberActivitiesHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: validBody({ notes: tag('ActivityPUTOriginal') }),
    })
    expect(created.statusCode).toBe(201)
    const id: string = created.body.id

    const updatedNotes = tag('ActivityPUTUpdated')
    const updateBody: MemberActivityUpdatePayload = {
      id,
      notes: updatedNotes,
      activity_type: 'game',
    }
    const updated = await invokeFunction(memberActivitiesHandler, {
      method: 'PUT',
      bearerToken: admin.accessToken,
      body: updateBody,
    })
    expect(updated.statusCode).toBe(200)
    expect(updated.body.notes).toBe(updatedNotes)
    expect(updated.body.activity_type).toBe('game')

    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('member_activities')
      .select('notes, activity_type')
      .eq('id', id)
      .single()
    expect(data!.notes).toBe(updatedNotes)
    expect(data!.activity_type).toBe('game')
  })

  it('PUT without id → 400', async () => {
    const res = await invokeFunction(memberActivitiesHandler, {
      method: 'PUT',
      bearerToken: admin.accessToken,
      body: { notes: tag('NoIdActivity') },
    })
    expect(res.statusCode).toBe(400)
    expect(res.body.message ?? res.body.error).toMatch(/(ID is required|must be selected)/i)
  })

  it('admin DELETE → row gone', async () => {
    const created = await invokeFunction(memberActivitiesHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: validBody({ notes: tag('ActivityDelete') }),
    })
    expect(created.statusCode).toBe(201)
    const id: string = created.body.id

    const del = await invokeFunction(memberActivitiesHandler, {
      method: 'DELETE',
      bearerToken: admin.accessToken,
      query: { id },
    })
    expect(del.statusCode).toBe(204)

    const sb = getSupabaseAdmin()
    const { data } = await sb.from('member_activities').select('id').eq('id', id)
    expect(data).toEqual([])
  })

  it('DELETE of nonexistent row → 404 (member-activities does an existence check)', async () => {
    const res = await invokeFunction(memberActivitiesHandler, {
      method: 'DELETE',
      bearerToken: admin.accessToken,
      query: { id: '00000000-0000-0000-0000-000000000000' },
    })
    expect(res.statusCode).toBe(404)
  })
})

// ============================================================================
// resources — admin_or_executive
// ============================================================================
describe('resources — POST/PUT/DELETE', () => {
  const validBody = (
    overrides: Partial<ResourceCreatePayload> = {}
  ): ResourceCreatePayload => ({
    title: tag('Resource'),
    description: 'Integration test resource description',
    category: 'rulebooks',
    resource_type: 'file',
    file_url: 'https://example.test/file.pdf',
    file_name: 'file.pdf',
    is_featured: false,
    access_level: 'all',
    ...overrides,
  })

  it('rejects POST without auth', async () => {
    const res = await invokeFunction(resourcesHandler, {
      method: 'POST',
      body: validBody(),
    })
    expect(res.statusCode).toBe(401)
  })

  it('rejects POST from an "official" role with 403', async () => {
    const res = await invokeFunction(resourcesHandler, {
      method: 'POST',
      bearerToken: official.accessToken,
      body: validBody(),
    })
    expect(res.statusCode).toBe(403)
  })

  it('admin can POST → 201 + row in DB', async () => {
    const title = tag('ResourceAdmin')
    const res = await invokeFunction(resourcesHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: validBody({ title, category: 'forms' }),
    })
    expect(res.statusCode).toBe(201)
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.body.title).toBe(title)
    expect(res.body.category).toBe('forms')

    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('resources')
      .select('id, title, category')
      .eq('id', res.body.id)
      .single()
    expect(data).not.toBeNull()
    expect(data!.title).toBe(title)
  })

  it('executive can POST → 201 (admin_or_executive auth)', async () => {
    const title = tag('ResourceExec')
    const res = await invokeFunction(resourcesHandler, {
      method: 'POST',
      bearerToken: executive.accessToken,
      body: validBody({ title }),
    })
    expect(res.statusCode).toBe(201)
    expect(res.body.title).toBe(title)
  })

  // FIXED: shared `mapPgError` now turns the schema's 23502 not-null
  // violation on `title` into a 400, no handler-level guard needed.
  it('POST with missing title → 400', async () => {
    const res = await invokeFunction(resourcesHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: { description: 'no title' } as unknown as ResourceCreatePayload,
    })
    expect(res.statusCode).toBe(400)
  })

  it('admin PUT round-trip: insert → modify → read back', async () => {
    const created = await invokeFunction(resourcesHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: validBody({ title: tag('ResourcePUTOriginal') }),
    })
    expect(created.statusCode).toBe(201)
    const id: string = created.body.id

    const updatedTitle = tag('ResourcePUTUpdated')
    const updateBody: ResourceUpdatePayload = {
      id,
      title: updatedTitle,
      description: 'updated description',
      is_featured: true,
    }
    const updated = await invokeFunction(resourcesHandler, {
      method: 'PUT',
      bearerToken: admin.accessToken,
      body: updateBody,
    })
    expect(updated.statusCode).toBe(200)
    expect(updated.body.title).toBe(updatedTitle)
    expect(updated.body.is_featured).toBe(true)

    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('resources')
      .select('title, description, is_featured')
      .eq('id', id)
      .single()
    expect(data!.title).toBe(updatedTitle)
    expect(data!.description).toBe('updated description')
    expect(data!.is_featured).toBe(true)
  })

  it('PUT without id → 400', async () => {
    const res = await invokeFunction(resourcesHandler, {
      method: 'PUT',
      bearerToken: admin.accessToken,
      body: { title: tag('NoIdResource') },
    })
    expect(res.statusCode).toBe(400)
    expect(res.body.message ?? res.body.error).toMatch(/(ID is required|must be selected)/i)
  })

  it('admin DELETE → row gone', async () => {
    const created = await invokeFunction(resourcesHandler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: validBody({ title: tag('ResourceDelete') }),
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
    const { data } = await sb.from('resources').select('id').eq('id', id)
    expect(data).toEqual([])
  })

  it('DELETE without id → 400', async () => {
    const res = await invokeFunction(resourcesHandler, {
      method: 'DELETE',
      bearerToken: admin.accessToken,
    })
    expect(res.statusCode).toBe(400)
    expect(res.body.message ?? res.body.error).toMatch(/(ID is required|must be selected)/i)
  })

  // FIXED: `resources.active` column landed via migration; the GET
  // handler now ANDs `is_featured=true` with `active=true` so soft-
  // deleted rows stay out of the public/featured surface.
  it('GET ?featured=true hides rows where active=false', async () => {
    const sb = getSupabaseAdmin()
    // Insert one active+featured and one inactive+featured directly so we
    // know the seed shape regardless of handler behavior.
    const inactiveTitle = tag('ResourceInactive')
    const activeTitle = tag('ResourceActive')
    // resources.file_name is NOT NULL on the deployed schema; bare seed
    // inserts without it silently fail and the test would never see
    // either tagged row.
    const seed = await sb.from('resources').insert([
      {
        title: inactiveTitle,
        description: 'inactive seed',
        category: 'rulebooks',
        is_featured: true,
        active: false,
        file_name: 'inactive.pdf',
        file_url: 'https://example.test/inactive.pdf',
      },
      {
        title: activeTitle,
        description: 'active seed',
        category: 'rulebooks',
        is_featured: true,
        active: true,
        file_name: 'active.pdf',
        file_url: 'https://example.test/active.pdf',
      },
    ])
    if (seed.error) throw new Error(`seed insert failed: ${seed.error.message}`)

    const res = await invokeFunction(resourcesHandler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      query: { featured: 'true' },
    })
    expect(res.statusCode).toBe(200)
    const titles = (res.body as Array<{ title: string }>).map((r) => r.title)
    expect(titles).toContain(activeTitle)
    expect(titles).not.toContain(inactiveTitle)
  })
})
