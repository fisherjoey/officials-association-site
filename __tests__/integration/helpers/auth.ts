import { createClient } from '@supabase/supabase-js'
import { getSupabaseAdmin, E2E_TAG } from './supabase'
import { toPrincipal, type Capability, type StructuralRole } from '@/lib/roles'

/**
 * The names tests ask for. Deliberately still includes the retired flat names
 * (`official`, `evaluator`, `mentor`) — they are resolved through
 * `toPrincipal()`, so `createTestUser('evaluator')` now produces a plain member
 * who holds the evaluator capability, which is what "an evaluator" means under
 * the split model and what the ~40 existing call sites here should keep meaning.
 */
export type TestRole = 'admin' | 'executive' | 'evaluator' | 'mentor' | 'official' | 'member'

export interface TestUser {
  id: string
  email: string
  password: string
  /** What the caller asked for, verbatim. Kept for test-name readability. */
  role: TestRole
  /** The rung that name resolves to. This is what goes in `members.role`. */
  structuralRole: StructuralRole
  /** The grants that name resolves to. This is what goes in `capabilities`. */
  capabilities: Capability[]
  accessToken: string
  /** `members.id` of the roster row that gives this user their rung. */
  memberId: string | null
}

export interface CreateTestUserOptions {
  /** Extra capability grants on top of whatever the role name resolves to. */
  capabilities?: Capability[]
  /**
   * Skip the roster row. Produces a signed-in account with no rung at all,
   * which is what a self-signup looks like before it registers. Only reach for
   * this when that state is the thing under test.
   */
  roster?: false
}

/**
 * Create a fresh Supabase user with the given role, put them on the roster at
 * that rung, sign them in, and return an access token. Caller is responsible
 * for `deleteTestUser` — or use `withTestUser` which scopes that for you.
 *
 * The roster row is not decoration. `getPrincipal()` resolves a caller's rung
 * and grants from `members.role` and `members.capabilities` and from nowhere
 * else, so an auth user without a row is nobody as far as every handler is
 * concerned, whatever its metadata says. Creating the row here is what makes
 * `createTestUser('admin')` mean "an admin".
 */
export async function createTestUser(
  role: TestRole,
  extraCapabilities: Capability[] | CreateTestUserOptions = []
): Promise<TestUser> {
  const options: CreateTestUserOptions = Array.isArray(extraCapabilities)
    ? { capabilities: extraCapabilities }
    : extraCapabilities

  const admin = getSupabaseAdmin()
  const principal = toPrincipal({ role, capabilities: options.capabilities ?? [] })
  const structuralRole = principal.role ?? 'member'
  const capabilities = [...principal.capabilities]
  const email = `${E2E_TAG.toLowerCase()}-${role}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.test`
  const password = `Test_Password_${Math.random().toString(36).slice(2, 10)}!1A`

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    // Metadata carries the name only. Neither bag is read by the role
    // resolvers any more — see getPrincipal() in _shared/handler.ts — so
    // stamping a role in here would describe a privilege the user does not
    // have and would quietly weaken every test that asserts a refusal.
    user_metadata: { full_name: `E2E ${role}`, first_name: 'E2E', last_name: role },
  })
  if (createErr || !created.user) {
    throw new Error(`Failed to create test user: ${createErr?.message ?? 'unknown'}`)
  }

  let memberId: string | null = null
  if (options.roster !== false) {
    const { data: member, error: memberErr } = await admin
      .from('members')
      .insert({
        user_id: created.user.id,
        email,
        name: `E2E ${role}`,
        role: structuralRole,
        capabilities,
        status: 'active',
      })
      .select('id')
      .single()
    if (memberErr || !member) {
      await admin.auth.admin.deleteUser(created.user.id).catch(() => {})
      throw new Error(`Failed to seed roster row: ${memberErr?.message ?? 'unknown'}`)
    }
    memberId = member.id
  }

  // Use a fresh anon client to sign in — the admin client should not be
  // used for password sign-in.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!anon) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required to sign in test users')
  }
  const client = createClient(url, anon, { auth: { persistSession: false } })

  const { data: signin, error: signinErr } = await client.auth.signInWithPassword({ email, password })
  if (signinErr || !signin.session) {
    if (memberId) await admin.from('members').delete().eq('id', memberId)
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {})
    throw new Error(`Failed to sign in test user: ${signinErr?.message ?? 'unknown'}`)
  }

  return {
    id: created.user.id,
    email,
    password,
    role,
    structuralRole,
    capabilities,
    accessToken: signin.session.access_token,
    memberId,
  }
}

export async function deleteTestUser(user: { id: string }): Promise<void> {
  const admin = getSupabaseAdmin()
  // Roster row first. `members.user_id` is ON DELETE SET NULL, so deleting the
  // auth user alone leaves an orphan row that the next run's email-prefix
  // cleanup has to find — and that a `user_id` lookup never will.
  const { error: memberErr } = await admin.from('members').delete().eq('user_id', user.id)
  if (memberErr) {
    console.warn('deleteTestUser roster cleanup failed:', memberErr.message)
  }
  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) {
    console.warn('deleteTestUser failed:', error.message)
  }
}

/**
 * Run `fn` with a freshly minted test user that's torn down afterwards
 * regardless of test outcome. Reduces boilerplate.
 */
export async function withTestUser<T>(
  role: TestRole,
  fn: (user: TestUser) => Promise<T>
): Promise<T> {
  const user = await createTestUser(role)
  try {
    return await fn(user)
  } finally {
    await deleteTestUser(user)
  }
}

/**
 * Sweep any test users that previous runs failed to clean up.
 * Recognizes them by the E2E_TAG prefix in the email local-part.
 */
export async function cleanupOrphanedTestUsers(): Promise<void> {
  const admin = getSupabaseAdmin()
  // Supabase admin listUsers is paginated; one page is plenty for a single
  // tag — cleanup runs every test session so we'd never have thousands.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (error || !data) return
  const stale = data.users.filter((u) => u.email?.toLowerCase().startsWith(`${E2E_TAG.toLowerCase()}-`))
  for (const u of stale) {
    await admin.auth.admin.deleteUser(u.id).catch(() => {})
  }
}
