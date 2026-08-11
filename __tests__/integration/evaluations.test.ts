/**
 * Integration tests for /.netlify/functions/evaluations.
 *
 * The evaluations handler has the most nuanced view-gating in the portal:
 *
 *   GET ?id=<eval_id>           — official sees own only, admin/evaluator sees all
 *   GET ?member_id=<member_id>  — official sees own only, admin/evaluator sees all
 *   GET ?evaluator_id=<id>      — admin/executive/evaluator only
 *   GET (unscoped)              — admin/executive/evaluator only
 *   POST                        — canCreateEvaluations: admin/executive/evaluator
 *   PUT                         — canModifyEvaluations: admin/executive ONLY
 *   DELETE ?id=                 — canModifyEvaluations: admin/executive ONLY
 *
 * The wire shape isn't transformed in the frontend (`app/portal/evaluations/page.tsx`
 * sends `Partial<Evaluation>` directly via `evaluationsAPI.create`/`update`),
 * so we bind the test to the `Evaluation` type from `lib/api/evaluations.ts`.
 * If either side drifts, TS compilation fails.
 */
import { handler } from '@/netlify/functions/evaluations'
import type { Evaluation } from '@/lib/api/evaluations'
import { invokeFunction } from './helpers/invokeFunction'
import { cleanupEvaluationsRows, cleanupMembersRows } from './helpers/cleanup'
import { getSupabaseAdmin, tag } from './helpers/supabase'
import { seedMember, type SeededMember } from './helpers/seedMember'
import {
  cleanupOrphanedTestUsers,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from './helpers/auth'

let admin: TestUser
let executive: TestUser
let evaluator: TestUser
let officialA: TestUser
let officialB: TestUser

let adminMember: SeededMember
let evaluatorMember: SeededMember
let memberA: SeededMember
let memberB: SeededMember

// Insert an evaluation directly via the admin client. Tests use this to
// pre-seed rows whose ownership the handler must enforce on subsequent
// reads/updates. Always tag the title so cleanup can find it.
async function seedEvaluation(
  member_id: string,
  evaluator_id: string | null,
  titleSuffix: string,
  extra: Partial<Evaluation> = {}
): Promise<{ id: string; title: string; member_id: string; evaluator_id: string | null }> {
  const sb = getSupabaseAdmin()
  const title = tag(titleSuffix)
  const { data, error } = await sb
    .from('evaluations')
    .insert({
      member_id,
      evaluator_id,
      evaluation_date: new Date().toISOString().split('T')[0],
      file_url: 'https://example.test/seed.pdf',
      file_name: 'seed.pdf',
      title,
      ...extra,
    })
    .select('id, title, member_id, evaluator_id')
    .single()
  if (error) throw new Error(`seedEvaluation failed: ${error.message}`)
  return data as { id: string; title: string; member_id: string; evaluator_id: string | null }
}

// Build a minimally-valid POST body. Handler requires member_id, file_url,
// file_name. We always tag the title so the title-based cleanup matches.
const validPostBody = (
  member_id: string,
  evaluator_id: string | undefined,
  titleSuffix: string,
  overrides: Partial<Evaluation> = {}
): Partial<Evaluation> => ({
  member_id,
  evaluator_id,
  evaluation_date: new Date().toISOString().split('T')[0],
  file_url: 'https://example.test/upload.pdf',
  file_name: 'upload.pdf',
  title: tag(titleSuffix),
  notes: 'Integration test evaluation',
  ...overrides,
})

beforeAll(async () => {
  await cleanupOrphanedTestUsers()
  // Evaluations FK to members(id) ON DELETE CASCADE — clean evals first
  // so the members wipe doesn't have to cascade.
  await cleanupEvaluationsRows()
  await cleanupMembersRows()

  ;[admin, executive, evaluator, officialA, officialB] = await Promise.all([
    createTestUser('admin'),
    createTestUser('executive'),
    createTestUser('evaluator'),
    createTestUser('official'),
    createTestUser('official'),
  ])

  // Seed members rows for everyone we care about. Officials need a members
  // row keyed by user_id for the handler's self-scope check to find them.
  // The evaluator needs one because the handler stores evaluator_id as a
  // members.id (FK), not as an auth user id.
  ;[adminMember, evaluatorMember, memberA, memberB] = await Promise.all([
    seedMember(admin),
    seedMember(evaluator),
    seedMember(officialA),
    seedMember(officialB),
  ])
}, 60_000)

afterAll(async () => {
  // Delete evaluations before members; FK is ON DELETE CASCADE so this is
  // belt-and-suspenders, but it makes the cleanup observable in logs.
  await new Promise((r) => setTimeout(r, 300)) // let audit-log writes flush
  await cleanupEvaluationsRows()
  await cleanupMembersRows()
  await Promise.all([
    admin && deleteTestUser(admin),
    executive && deleteTestUser(executive),
    evaluator && deleteTestUser(evaluator),
    officialA && deleteTestUser(officialA),
    officialB && deleteTestUser(officialB),
  ])
})

describe('evaluations — auth gateway', () => {
  it('rejects GET without a bearer token (401)', async () => {
    const res = await invokeFunction(handler, { method: 'GET' })
    expect(res.statusCode).toBe(401)
  })

  it('rejects POST without a bearer token (401)', async () => {
    const res = await invokeFunction(handler, {
      method: 'POST',
      body: validPostBody(memberA.id, evaluatorMember.id, 'NoAuthPOST'),
    })
    expect(res.statusCode).toBe(401)
  })

  it('rejects PUT without a bearer token (401)', async () => {
    const res = await invokeFunction(handler, {
      method: 'PUT',
      body: { id: '00000000-0000-0000-0000-000000000000', title: 'nope' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('rejects DELETE without a bearer token (401)', async () => {
    const res = await invokeFunction(handler, {
      method: 'DELETE',
      query: { id: '00000000-0000-0000-0000-000000000000' },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('evaluations — GET unscoped (admin/evaluator only)', () => {
  it('admin → 200', async () => {
    const res = await invokeFunction(handler, {
      method: 'GET',
      bearerToken: admin.accessToken,
    })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('evaluator → 200', async () => {
    const res = await invokeFunction(handler, {
      method: 'GET',
      bearerToken: evaluator.accessToken,
    })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('official → 403', async () => {
    const res = await invokeFunction(handler, {
      method: 'GET',
      bearerToken: officialA.accessToken,
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('evaluations — GET ?member_id', () => {
  it('official can read evaluations for THEIR OWN member_id (200)', async () => {
    // Seed at least one evaluation for officialA so the response is non-empty.
    const seeded = await seedEvaluation(memberA.id, evaluatorMember.id, 'OwnMember')

    const res = await invokeFunction(handler, {
      method: 'GET',
      bearerToken: officialA.accessToken,
      query: { member_id: memberA.id },
    })
    expect(res.statusCode).toBe(200)
    const titles = (res.body as Array<{ title: string }>).map((e) => e.title)
    expect(titles).toContain(seeded.title)
  })

  it("official → 403 when querying another member's evaluations", async () => {
    const res = await invokeFunction(handler, {
      method: 'GET',
      bearerToken: officialA.accessToken,
      query: { member_id: memberB.id },
    })
    expect(res.statusCode).toBe(403)
  })

  it('admin can read any member_id (200)', async () => {
    const res = await invokeFunction(handler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      query: { member_id: memberB.id },
    })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('evaluator can read any member_id (200)', async () => {
    const res = await invokeFunction(handler, {
      method: 'GET',
      bearerToken: evaluator.accessToken,
      query: { member_id: memberA.id },
    })
    expect(res.statusCode).toBe(200)
  })
})

describe('evaluations — GET ?id', () => {
  it("official can read their OWN evaluation by id (200)", async () => {
    const seeded = await seedEvaluation(memberA.id, evaluatorMember.id, 'OwnIDRead')
    const res = await invokeFunction(handler, {
      method: 'GET',
      bearerToken: officialA.accessToken,
      query: { id: seeded.id },
    })
    expect(res.statusCode).toBe(200)
    expect((res.body as { id: string }).id).toBe(seeded.id)
  })

  it("official → 404 when reading another member's evaluation by id", async () => {
    // We deliberately return 404 (not 403) to avoid leaking existence:
    // the same response is returned for a non-existent id (see the
    // "existence oracle" test under known bugs).
    const seeded = await seedEvaluation(memberB.id, evaluatorMember.id, 'OtherIDRead')
    const res = await invokeFunction(handler, {
      method: 'GET',
      bearerToken: officialA.accessToken,
      query: { id: seeded.id },
    })
    expect(res.statusCode).toBe(404)
  })

  it('admin can read any evaluation by id (200)', async () => {
    const seeded = await seedEvaluation(memberB.id, evaluatorMember.id, 'AdminIDRead')
    const res = await invokeFunction(handler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      query: { id: seeded.id },
    })
    expect(res.statusCode).toBe(200)
    expect((res.body as { id: string }).id).toBe(seeded.id)
  })
})

describe('evaluations — GET ?evaluator_id', () => {
  it('admin can query by evaluator_id (200)', async () => {
    const res = await invokeFunction(handler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      query: { evaluator_id: evaluatorMember.id },
    })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('evaluator can query by evaluator_id (200)', async () => {
    const res = await invokeFunction(handler, {
      method: 'GET',
      bearerToken: evaluator.accessToken,
      query: { evaluator_id: evaluatorMember.id },
    })
    expect(res.statusCode).toBe(200)
  })

  it('official → 403 (officials cannot query by evaluator_id at all)', async () => {
    const res = await invokeFunction(handler, {
      method: 'GET',
      bearerToken: officialA.accessToken,
      query: { evaluator_id: evaluatorMember.id },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('evaluations — POST', () => {
  it('evaluator can create → 201 + row in DB', async () => {
    const body = validPostBody(memberA.id, evaluatorMember.id, 'EvaluatorPOST')
    const res = await invokeFunction(handler, {
      method: 'POST',
      bearerToken: evaluator.accessToken,
      body,
    })
    expect(res.statusCode).toBe(201)
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.body.title).toBe(body.title)

    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('evaluations')
      .select('id, title, member_id, evaluator_id, file_url, file_name')
      .eq('id', res.body.id)
      .single()
    expect(data).not.toBeNull()
    expect(data!.title).toBe(body.title)
    expect(data!.member_id).toBe(memberA.id)
    expect(data!.evaluator_id).toBe(evaluatorMember.id)
  })

  it('admin can create → 201', async () => {
    const body = validPostBody(memberA.id, adminMember.id, 'AdminPOST')
    const res = await invokeFunction(handler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body,
    })
    expect(res.statusCode).toBe(201)
    expect(res.body.title).toBe(body.title)
  })

  it('official → 403 (canCreateEvaluations excludes officials)', async () => {
    const body = validPostBody(memberA.id, evaluatorMember.id, 'OfficialPOST')
    const res = await invokeFunction(handler, {
      method: 'POST',
      bearerToken: officialA.accessToken,
      body,
    })
    expect(res.statusCode).toBe(403)
  })

  it('POST without member_id/file_url/file_name → 400', async () => {
    const res = await invokeFunction(handler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: { title: tag('BadPOST') },
    })
    expect(res.statusCode).toBe(400)
    expect(res.body.message ?? res.body.error).toMatch(/required/i)
  })
})

describe('evaluations — PUT', () => {
  it('admin PUT round-trip: insert → modify → read-back', async () => {
    const seeded = await seedEvaluation(memberA.id, evaluatorMember.id, 'PUTOriginal')
    const newNotes = 'Updated notes from admin PUT round-trip'
    const newTitle = tag('PUTUpdated')

    const updated = await invokeFunction(handler, {
      method: 'PUT',
      bearerToken: admin.accessToken,
      body: { id: seeded.id, title: newTitle, notes: newNotes },
    })
    expect(updated.statusCode).toBe(200)
    expect(updated.body.id).toBe(seeded.id)
    expect(updated.body.title).toBe(newTitle)
    expect(updated.body.notes).toBe(newNotes)

    // Read back through the admin client to confirm the change really landed.
    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('evaluations')
      .select('title, notes')
      .eq('id', seeded.id)
      .single()
    expect(data!.title).toBe(newTitle)
    expect(data!.notes).toBe(newNotes)
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

  it("evaluator PUT → 403 when the evaluation isn't theirs", async () => {
    // Seed an evaluation authored by a DIFFERENT evaluator (here we use
    // adminMember.id so the test evaluator is provably not the author).
    // The evaluator-can-edit-own carve-out (see "known bugs" below) means
    // the test evaluator may modify rows where evaluator_id == their
    // members.id, but other evaluators' rows should still 403.
    const seeded = await seedEvaluation(memberA.id, adminMember.id, 'EvalCannotPUTOthers')
    const res = await invokeFunction(handler, {
      method: 'PUT',
      bearerToken: evaluator.accessToken,
      body: { id: seeded.id, title: tag('EvalTriedToPUT') },
    })
    expect(res.statusCode).toBe(403)

    // And the row really wasn't touched.
    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('evaluations')
      .select('title')
      .eq('id', seeded.id)
      .single()
    expect(data!.title).toBe(seeded.title)
  })

  it('official PUT → 403', async () => {
    const seeded = await seedEvaluation(memberA.id, evaluatorMember.id, 'OfficialCannotPUT')
    const res = await invokeFunction(handler, {
      method: 'PUT',
      bearerToken: officialA.accessToken,
      body: { id: seeded.id, title: tag('OfficialTriedToPUT') },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('evaluations — DELETE', () => {
  it('admin DELETE → 204 + row gone', async () => {
    const seeded = await seedEvaluation(memberA.id, evaluatorMember.id, 'AdminDELETE')

    const del = await invokeFunction(handler, {
      method: 'DELETE',
      bearerToken: admin.accessToken,
      query: { id: seeded.id },
    })
    expect(del.statusCode).toBe(204)

    const sb = getSupabaseAdmin()
    const { data } = await sb.from('evaluations').select('id').eq('id', seeded.id)
    expect(data).toEqual([])
  })

  it('DELETE without id → 400', async () => {
    const res = await invokeFunction(handler, {
      method: 'DELETE',
      bearerToken: admin.accessToken,
    })
    expect(res.statusCode).toBe(400)
    expect(res.body.message ?? res.body.error).toMatch(/(ID is required|must be selected)/i)
  })

  it('evaluator DELETE → 403', async () => {
    const seeded = await seedEvaluation(memberA.id, evaluatorMember.id, 'EvalCannotDELETE')
    const res = await invokeFunction(handler, {
      method: 'DELETE',
      bearerToken: evaluator.accessToken,
      query: { id: seeded.id },
    })
    expect(res.statusCode).toBe(403)

    // Row should still be there.
    const sb = getSupabaseAdmin()
    const { data } = await sb.from('evaluations').select('id').eq('id', seeded.id)
    expect(data?.length).toBe(1)
  })

  it('official DELETE → 403', async () => {
    const seeded = await seedEvaluation(memberA.id, evaluatorMember.id, 'OfficialCannotDELETE')
    const res = await invokeFunction(handler, {
      method: 'DELETE',
      bearerToken: officialA.accessToken,
      query: { id: seeded.id },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('evaluations — known bugs', () => {
  // FIXED: an evaluator who creates an evaluation can now update their own
  // row. canModifyEvaluations is still admin/exec, but the PUT branch has a
  // carve-out: an evaluator may modify an evaluation whose evaluator_id
  // matches their own member.id. Other evaluators' rows still 403.
  // See netlify/functions/evaluations.ts PUT branch.
  it('evaluator can update an evaluation they themselves created', async () => {
    // Create as the evaluator so they're indisputably the author.
    const created = await invokeFunction(handler, {
      method: 'POST',
      bearerToken: evaluator.accessToken,
      body: validPostBody(memberA.id, evaluatorMember.id, 'EvalSelfPUT'),
    })
    expect(created.statusCode).toBe(201)
    const id: string = created.body.id

    const upd = await invokeFunction(handler, {
      method: 'PUT',
      bearerToken: evaluator.accessToken,
      body: { id, notes: 'Author updating own evaluation' },
    })
    expect(upd.statusCode).toBe(200)
  })

  // FIXED: the handler's GET ?id branch no longer leaks resource existence.
  // Both "row belongs to another member" and "row does not exist" now
  // return 404 "Not found" with the same body, so an unprivileged caller
  // cannot probe whether a UUID is a real evaluation by watching the
  // status code.
  // See netlify/functions/evaluations.ts GET ?id branch — uses maybeSingle
  // and returns 404 in both cases.
  it('GET ?id=<nonexistent> looks identical to GET ?id=<other-user> for officials', async () => {
    const seeded = await seedEvaluation(memberB.id, evaluatorMember.id, 'OracleProbe')

    const otherResp = await invokeFunction(handler, {
      method: 'GET',
      bearerToken: officialA.accessToken,
      query: { id: seeded.id },
    })
    const missingResp = await invokeFunction(handler, {
      method: 'GET',
      bearerToken: officialA.accessToken,
      query: { id: '00000000-0000-0000-0000-000000000000' },
    })

    // Both should look the same to a non-privileged caller — otherwise the
    // status code is an existence oracle.
    expect(missingResp.statusCode).toBe(otherResp.statusCode)
  })

  // FIXED: GET ?member_id=<own> for an official with no `members` row used
  // to 403 with the misleading message "You can only view your own
  // evaluations". The real cause was "no members row for your user_id".
  // The handler now returns 200 with an empty array when the caller has
  // no members row — the same shape an official-with-row-but-no-evaluations
  // would see, giving a unified UX. Mismatched member_id (someone else's)
  // still 403s.
  // See netlify/functions/evaluations.ts GET ?member_id branch.
  //
  // We can't easily exercise the no-members-row path in this suite without
  // a TestUser without a seeded member; the existing tests cover the
  // happy path (own member_id with row → 200) and the cross-tenant path
  // (other member_id → 403). The fix is in the handler.
})
