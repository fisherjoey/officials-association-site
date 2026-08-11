/**
 * PUT /members integration tests.
 *
 * GET auth gates are covered in portal.test.ts; this file focuses on the
 * PUT path: ownership checks, privilege-field gating, 400/404/401 paths,
 * and that the persisted row actually reflects the requested update.
 *
 * The wire-shape (`MemberUpdatePayload`) is imported from the handler so
 * that any drift between the frontend profile forms (which send
 * `{ id, ...form }` with no transformation) and the handler is caught at
 * compile time.
 */
import {
  handler,
  type MemberUpdatePayload,
} from '@/netlify/functions/members'
import { invokeFunction } from './helpers/invokeFunction'
import { cleanupMembersRows } from './helpers/cleanup'
import { getSupabaseAdmin, tag } from './helpers/supabase'
import {
  cleanupOrphanedTestUsers,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from './helpers/auth'

/**
 * Inline minimal-row seeder. The shared `seedMember` helper insists on
 * setting a `rank` column that the deployed `members` schema does not
 * have, which would 500 us before the PUT handler even runs. We seed
 * directly via the admin client instead — read-only contract on the
 * helper preserved.
 */
async function seedMemberRow(
  user: TestUser,
  name: string,
  extra: Record<string, unknown> = {}
): Promise<{ id: string }> {
  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from('members')
    .insert({
      user_id: user.id,
      email: user.email,
      name,
      role: user.role,
      status: 'active',
      ...extra,
    })
    .select('id')
    .single()
  if (error) throw new Error(`seedMemberRow failed: ${error.message}`)
  return data as { id: string }
}

let admin: TestUser
let officialA: TestUser
let officialB: TestUser

beforeAll(async () => {
  await cleanupOrphanedTestUsers()
  await cleanupMembersRows()
  ;[admin, officialA, officialB] = await Promise.all([
    createTestUser('admin'),
    createTestUser('official'),
    createTestUser('official'),
  ])
}, 30_000)

afterAll(async () => {
  await Promise.all([
    admin && deleteTestUser(admin),
    officialA && deleteTestUser(officialA),
    officialB && deleteTestUser(officialB),
  ])
  // Members rows are deleted synchronously by the handler, but seedMember
  // inserts via the admin client — give any in-flight audit-log writes a
  // moment to flush before we wipe.
  await new Promise((r) => setTimeout(r, 300))
  await cleanupMembersRows()
})

describe('members PUT', () => {
  let memberA: { id: string }
  let memberB: { id: string }

  beforeEach(async () => {
    memberA = await seedMemberRow(officialA, tag('OfficialA'))
    memberB = await seedMemberRow(officialB, tag('OfficialB'))
  })

  afterEach(async () => {
    await cleanupMembersRows()
  })

  it('returns 401 without a bearer token', async () => {
    const body: MemberUpdatePayload = { id: memberA.id, phone: '403-555-0100' }
    const res = await invokeFunction(handler, {
      method: 'PUT',
      body,
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 400 when body has no id', async () => {
    const res = await invokeFunction(handler, {
      method: 'PUT',
      bearerToken: officialA.accessToken,
      body: { phone: '403-555-0100' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.body.message ?? res.body.error).toMatch(/(id|member must be selected)/i)
  })

  it('returns 404 when the id does not exist', async () => {
    // A well-formed UUID that won't match any row.
    const body: MemberUpdatePayload = {
      id: '00000000-0000-0000-0000-000000000000',
      phone: '403-555-0100',
    }
    const res = await invokeFunction(handler, {
      method: 'PUT',
      bearerToken: admin.accessToken,
      body,
    })
    expect(res.statusCode).toBe(404)
  })

  it('lets a member update their own row and persists the change', async () => {
    const newPhone = '403-555-7788'
    const newCity = `${tag('City').slice(0, 40)}`
    const body: MemberUpdatePayload = {
      id: memberA.id,
      phone: newPhone,
      city: newCity,
    }
    const res = await invokeFunction(handler, {
      method: 'PUT',
      bearerToken: officialA.accessToken,
      body,
    })

    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ id: memberA.id, phone: newPhone, city: newCity })

    // Read back through the admin client to confirm the row really changed.
    const sb = getSupabaseAdmin()
    const { data, error } = await sb
      .from('members')
      .select('phone, city')
      .eq('id', memberA.id)
      .single()
    expect(error).toBeNull()
    expect(data).toEqual({ phone: newPhone, city: newCity })
  })

  it("rejects a member updating someone else's row with 403", async () => {
    const body: MemberUpdatePayload = { id: memberB.id, phone: '403-555-9999' }
    const res = await invokeFunction(handler, {
      method: 'PUT',
      bearerToken: officialA.accessToken,
      body,
    })
    expect(res.statusCode).toBe(403)

    // And the row really wasn't touched.
    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('members')
      .select('phone')
      .eq('id', memberB.id)
      .single()
    expect(data?.phone ?? null).toBeNull()
  })

  it('strips role/email/netlify_user_id when a non-admin sends them', async () => {
    const body: MemberUpdatePayload = {
      id: memberA.id,
      phone: '403-555-1111',
      role: 'admin', // privileged, must be stripped
      email: 'attacker@example.test', // privileged, must be stripped
      netlify_user_id: 'forged-id', // privileged, must be stripped
    }
    const res = await invokeFunction(handler, {
      method: 'PUT',
      bearerToken: officialA.accessToken,
      body,
    })
    expect(res.statusCode).toBe(200)

    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('members')
      .select('role, email, netlify_user_id, phone')
      .eq('id', memberA.id)
      .single()
    expect(data?.role).toBe('official')
    expect(data?.email).toBe(officialA.email.toLowerCase())
    expect(data?.netlify_user_id).toBeNull()
    expect(data?.phone).toBe('403-555-1111')
  })

  // FIXED: members PUT now strips status/rank from non-admin updates
  // (was a privilege escalation — a regular member could undo an admin
  // suspension by self-PUTing { status: 'active' }).
  it('rejects non-admin attempt to change their own status', async () => {
    // Admin first suspends the member.
    const sb = getSupabaseAdmin()
    await sb.from('members').update({ status: 'suspended' }).eq('id', memberA.id)

    const body: MemberUpdatePayload = { id: memberA.id, status: 'active' }
    const res = await invokeFunction(handler, {
      method: 'PUT',
      bearerToken: officialA.accessToken,
      body,
    })
    // Either the handler should 403 the privileged-field write, or it
    // should silently strip `status` like it does for `role`. Either way,
    // the persisted status must NOT be the attacker-controlled value.
    const { data } = await sb
      .from('members')
      .select('status')
      .eq('id', memberA.id)
      .single()
    expect([200, 403]).toContain(res.statusCode)
    expect(data?.status).toBe('suspended')
  })

  it('lets an admin update any member, including admin-only fields', async () => {
    const body: MemberUpdatePayload = {
      id: memberB.id,
      phone: '403-555-2222',
      status: 'inactive',
      role: 'mentor',
      certification_level: tag('Cert'),
    }
    const res = await invokeFunction(handler, {
      method: 'PUT',
      bearerToken: admin.accessToken,
      body,
    })
    expect(res.statusCode).toBe(200)

    const sb = getSupabaseAdmin()
    const { data, error } = await sb
      .from('members')
      .select('phone, status, role, certification_level')
      .eq('id', memberB.id)
      .single()
    expect(error).toBeNull()
    expect(data).toEqual({
      phone: '403-555-2222',
      status: 'inactive',
      role: 'mentor',
      certification_level: body.certification_level,
    })
  })
})
