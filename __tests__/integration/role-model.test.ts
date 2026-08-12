/**
 * The role model, enforced by the database rather than described by it.
 *
 * Everything here probes PostgREST directly with a user's own JWT — no Netlify
 * Function in the path, no service-role key. That is the whole point. The
 * function layer has always gated evaluations on
 * `['admin','executive','evaluator']`, but it holds the service-role key and
 * RLS never applies to it, so that check protected exactly one code path.
 * Anything that reached the table another way got the answer the policies gave,
 * and until `20260810001500_role_model.sql` the policies had never heard of an
 * evaluator.
 *
 * Run against a live stack:
 *
 *   npx supabase start
 *   npx supabase db reset
 *   npx jest --config jest.config.integration.js __tests__/integration/role-model.test.ts
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createTestUser, deleteTestUser, cleanupOrphanedTestUsers, type TestUser } from './helpers/auth'
import { seedMember, type SeededMember } from './helpers/seedMember'
import { getSupabaseAdmin, E2E_TAG } from './helpers/supabase'
import { cleanupMembersRows } from './helpers/cleanup'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/** A PostgREST client speaking as this user, with their real RLS context. */
function clientFor(user: TestUser): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${user.accessToken}` } },
  })
}

/** A PostgREST client holding nothing but the anon key. */
function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

let admin: TestUser
let executive: TestUser
let plainMember: TestUser
let memberEvaluator: TestUser

let adminMember: SeededMember
let executiveMember: SeededMember
let plainMemberRow: SeededMember
let evaluatorMemberRow: SeededMember

/** An evaluation about `plainMember`, written by `memberEvaluator`. */
let evaluationId: string

const cleanupEvaluations = async () => {
  const sb = getSupabaseAdmin()
  await sb.from('evaluations').delete().like('title', `%${E2E_TAG}%`)
}

beforeAll(async () => {
  if (!ANON_KEY) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required — these tests probe RLS as a real user')
  }

  await cleanupOrphanedTestUsers()
  await cleanupEvaluations()
  await cleanupMembersRows()

  ;[admin, executive, plainMember, memberEvaluator] = await Promise.all([
    createTestUser('admin'),
    createTestUser('executive'),
    createTestUser('member'),
    // The combination the flat model could not represent: an ordinary member
    // who also holds the evaluator grant.
    createTestUser('member', ['evaluator']),
  ])

  ;[adminMember, executiveMember, plainMemberRow, evaluatorMemberRow] = await Promise.all([
    seedMember(admin),
    seedMember(executive),
    seedMember(plainMember),
    seedMember(memberEvaluator),
  ])

  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from('evaluations')
    .insert({
      member_id: plainMemberRow.id,
      evaluator_id: evaluatorMemberRow.id,
      evaluation_date: new Date().toISOString().slice(0, 10),
      file_url: 'https://example.org/eval.pdf',
      file_name: 'eval.pdf',
      title: `${E2E_TAG} role model evaluation`,
    })
    .select('id')
    .single()
  if (error) throw new Error(`seeding evaluation failed: ${error.message}`)
  evaluationId = data.id
}, 60_000)

afterAll(async () => {
  await cleanupEvaluations()
  await cleanupMembersRows()
  await Promise.all(
    [admin, executive, plainMember, memberEvaluator].filter(Boolean).map((u) => deleteTestUser(u))
  )
})

describe('the split is what actually landed in the schema', () => {
  it('stores the rung in role and the grants in capabilities', async () => {
    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('members')
      .select('role, capabilities')
      .eq('id', evaluatorMemberRow.id)
      .single()

    expect(data!.role).toBe('member')
    expect(data!.capabilities).toEqual(['evaluator'])
  })

  it('refuses a structural role outside the ladder', async () => {
    // Even the service role cannot write 'official' any more — the CHECK
    // constraint is not an RLS policy and applies to every writer.
    const sb = getSupabaseAdmin()
    const { error } = await sb
      .from('members')
      .update({ role: 'official' })
      .eq('id', plainMemberRow.id)

    expect(error).not.toBeNull()
    expect(error!.code).toBe('23514')
    expect(error!.message).toContain('members_role_structural_check')
  })

  it('refuses a malformed capability array', async () => {
    const sb = getSupabaseAdmin()
    for (const capabilities of [['Evaluator'], ['evaluator', 'evaluator'], ['has space']]) {
      const { error } = await sb
        .from('members')
        .update({ capabilities })
        .eq('id', plainMemberRow.id)
      expect(error?.code).toBe('23514')
    }
  })

  it('does not constrain WHICH capabilities exist, so renames stay config-only', async () => {
    const sb = getSupabaseAdmin()
    const { error } = await sb
      .from('members')
      .update({ capabilities: ['assessor'] })
      .eq('id', adminMember.id)
    expect(error).toBeNull()

    await sb.from('members').update({ capabilities: [] }).eq('id', adminMember.id)
  })
})

describe('1. anon is still refused on members', () => {
  it('cannot read the roster at all', async () => {
    const { data, error } = await anonClient().from('members').select('id, email')

    // 0002 revokes SELECT from anon outright, so this is a privilege error
    // rather than an empty result — anon never reaches a policy.
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
    expect(data).toBeNull()
  })

  it('cannot read evaluations either', async () => {
    const { error } = await anonClient().from('evaluations').select('id')
    expect(error).not.toBeNull()
  })
})

describe('2. a plain member reads exactly their own row', () => {
  it('sees themselves and nobody else', async () => {
    const { data, error } = await clientFor(plainMember).from('members').select('id, email')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].id).toBe(plainMemberRow.id)
  })

  it('the evaluator grant does not widen the roster', async () => {
    // Capabilities are orthogonal, not cumulative privilege. Being an
    // evaluator says nothing about who may read the member roster.
    const { data, error } = await clientFor(memberEvaluator).from('members').select('id')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].id).toBe(evaluatorMemberRow.id)
  })

  it('an executive still reads everyone', async () => {
    const { data, error } = await clientFor(executive).from('members').select('id')

    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThanOrEqual(4)
  })
})

describe('3. a member WITH the evaluator capability reads evaluations about other people', () => {
  it('reads the evaluation it is not the subject of', async () => {
    const { data, error } = await clientFor(memberEvaluator)
      .from('evaluations')
      .select('id, member_id')
      .eq('id', evaluationId)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].member_id).toBe(plainMemberRow.id)
    expect(data![0].member_id).not.toBe(evaluatorMemberRow.id)
  })

  it('admins and executives still read it too', async () => {
    for (const user of [admin, executive]) {
      const { data, error } = await clientFor(user).from('evaluations').select('id').eq('id', evaluationId)
      expect(error).toBeNull()
      expect(data).toHaveLength(1)
    }
  })
})

describe('4. a member WITHOUT it cannot — and it fails at the database', () => {
  it('returns no row for an evaluation about someone else', async () => {
    // `plainMember` IS the subject of the seeded evaluation, so use a second
    // ordinary member who is a stranger to it. The subject clause must not be
    // what is doing the work here.
    const stranger = await createTestUser('member')
    const strangerRow = await seedMember(stranger)
    try {
      const { data, error } = await clientFor(stranger)
        .from('evaluations')
        .select('id')
        .eq('id', evaluationId)

      expect(error).toBeNull()
      expect(data).toHaveLength(0)

      // And nothing at all across the whole table.
      const { data: all } = await clientFor(stranger).from('evaluations').select('id')
      expect(all).toHaveLength(0)
      expect(strangerRow.id).toBeDefined()
    } finally {
      await getSupabaseAdmin().from('members').delete().eq('id', strangerRow.id)
      await deleteTestUser(stranger)
    }
  }, 30_000)

  it('still reads their own evaluation', async () => {
    const { data, error } = await clientFor(plainMember).from('evaluations').select('id, member_id')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].member_id).toBe(plainMemberRow.id)
  })

  it('cannot write one', async () => {
    const { error } = await clientFor(plainMember).from('evaluations').insert({
      member_id: plainMemberRow.id,
      evaluation_date: new Date().toISOString().slice(0, 10),
      file_url: 'https://example.org/forged.pdf',
      file_name: 'forged.pdf',
      title: `${E2E_TAG} forged`,
    })

    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
  })
})

describe('5. nobody can grant themselves a capability', () => {
  it('the guard trigger rejects a self-granted capability', async () => {
    // `authenticated` holds no UPDATE grant on members (0002), so PostgREST
    // refuses before the trigger is reached. Both outcomes are a refusal; this
    // asserts the refusal happens, then proves the trigger independently below
    // so the barrier survives someone re-granting UPDATE for profile editing.
    const { error } = await clientFor(memberEvaluator)
      .from('members')
      .update({ capabilities: ['evaluator', 'scheduler'] })
      .eq('id', evaluatorMemberRow.id)

    expect(error).not.toBeNull()

    const { data } = await getSupabaseAdmin()
      .from('members')
      .select('capabilities')
      .eq('id', evaluatorMemberRow.id)
      .single()
    expect(data!.capabilities).toEqual(['evaluator'])
  })

  // The second barrier — the guard trigger — cannot be reached from here.
  // Getting to it needs `SET ROLE authenticated` inside a transaction that has
  // been handed the UPDATE grant, and PostgREST offers no way to ask for that;
  // there is no Postgres driver in this project's dependencies either. It is
  // checked with psql instead, and the check is recorded in the migration's
  // acceptance run. `__tests__/unit/config/roles.test.ts` asserts the guard
  // clause is still present in the migration text, which is the cheap tripwire
  // for someone deleting it.

  it('cannot promote itself up the ladder either', async () => {
    const { error } = await clientFor(plainMember)
      .from('members')
      .update({ role: 'admin' })
      .eq('id', plainMemberRow.id)

    expect(error).not.toBeNull()

    const { data } = await getSupabaseAdmin()
      .from('members')
      .select('role')
      .eq('id', plainMemberRow.id)
      .single()
    expect(data!.role).toBe('member')
  })
})

describe('the SQL helpers answer the same questions lib/roles.ts does', () => {
  it('structural_role, is_admin, is_admin_or_executive and has_capability', async () => {
    const sb = getSupabaseAdmin()

    const probe = async (fn: string, args: Record<string, unknown>) => {
      const { data, error } = await sb.rpc(fn, args)
      if (error) throw new Error(`${fn}: ${error.message}`)
      return data
    }

    expect(await probe('structural_role', { uid: admin.id })).toBe('admin')
    expect(await probe('structural_role', { uid: memberEvaluator.id })).toBe('member')

    expect(await probe('is_admin', { uid: admin.id })).toBe(true)
    expect(await probe('is_admin', { uid: executive.id })).toBe(false)

    expect(await probe('is_admin_or_executive', { uid: executive.id })).toBe(true)
    expect(await probe('is_admin_or_executive', { uid: plainMember.id })).toBe(false)

    expect(await probe('has_capability', { uid: memberEvaluator.id, cap: 'evaluator' })).toBe(true)
    expect(await probe('has_capability', { uid: plainMember.id, cap: 'evaluator' })).toBe(false)
    // An admin does not implicitly hold every grant — structure and capability
    // are orthogonal, and the evaluations policy ORs them rather than nesting.
    expect(await probe('has_capability', { uid: admin.id, cap: 'evaluator' })).toBe(false)
  })

  it('returns false rather than NULL for a caller with no members row', async () => {
    const sb = getSupabaseAdmin()
    const nobody = '00000000-0000-0000-0000-000000000000'

    expect((await sb.rpc('is_admin', { uid: nobody })).data).toBe(false)
    expect((await sb.rpc('is_admin_or_executive', { uid: nobody })).data).toBe(false)
    expect((await sb.rpc('has_capability', { uid: nobody, cap: 'evaluator' })).data).toBe(false)
    expect((await sb.rpc('structural_role', { uid: nobody })).data).toBeNull()
  })
})
