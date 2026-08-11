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
}

/**
 * Create a fresh Supabase user with the given role, sign them in, and
 * return an access token. Caller is responsible for `deleteTestUser` —
 * or use `withTestUser` which scopes that for you.
 */
export async function createTestUser(
  role: TestRole,
  extraCapabilities: Capability[] = []
): Promise<TestUser> {
  const admin = getSupabaseAdmin()
  const principal = toPrincipal({ role, capabilities: extraCapabilities })
  const structuralRole = principal.role ?? 'member'
  const capabilities = [...principal.capabilities]
  const email = `${E2E_TAG.toLowerCase()}-${role}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.test`
  const password = `Test_Password_${Math.random().toString(36).slice(2, 10)}!1A`

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    // app_metadata carries the split shape, because that is what the function
    // layer resolves a caller's principal from. Capabilities are read from here
    // and never from user_metadata — see getPrincipal() in _shared/handler.ts.
    app_metadata: { role: structuralRole, capabilities },
    user_metadata: { full_name: `E2E ${role}`, first_name: 'E2E', last_name: role },
  })
  if (createErr || !created.user) {
    throw new Error(`Failed to create test user: ${createErr?.message ?? 'unknown'}`)
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
  }
}

export async function deleteTestUser(user: { id: string }): Promise<void> {
  const admin = getSupabaseAdmin()
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
