/**
 * Shape a `members` row tied to an auth user.
 *
 * `createTestUser` already puts every test user on the roster — it has to, now
 * that `getPrincipal()` reads the rung from there — so this helper's job is to
 * amend that row rather than to create one, and it returns the row's id, which
 * is what the callers that need an FK target (evaluations, member_activities)
 * were really after. It still inserts when the row is absent, so a caller that
 * built its user with `{ roster: false }` gets the old behaviour.
 */
import { getSupabaseAdmin } from './supabase'
import type { TestUser } from './auth'

export interface SeededMember {
  id: string
  user_id: string
  email: string
  name: string
}

export async function seedMember(
  user: TestUser,
  overrides: Partial<{
    name: string
    rank: number
    role: string
    capabilities: string[]
    status: string
    certification_level: string
  }> = {}
): Promise<SeededMember> {
  // The deployed members table is missing some columns that exist in
  // supabase/members-schema.sql (notably `rank`). Only set fields the
  // caller explicitly asked for, so the helper works against either
  // schema version.
  const insert: Record<string, unknown> = {
    user_id: user.id,
    email: user.email,
    name: overrides.name ?? `E2E ${user.role}`,
    // `user.role` is the name the test asked for and may be a retired flat
    // name like 'evaluator'. The split shape resolved at user-creation time is
    // what the CHECK constraint and the RLS helpers expect.
    role: overrides.role ?? user.structuralRole,
    capabilities: overrides.capabilities ?? user.capabilities,
    status: overrides.status ?? 'active',
  }
  if (overrides.rank !== undefined) insert.rank = overrides.rank
  if (overrides.certification_level !== undefined) {
    insert.certification_level = overrides.certification_level
  }

  const sb = getSupabaseAdmin()

  const { data: existing, error: lookupError } = await sb
    .from('members')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (lookupError) throw new Error(`seedMember lookup failed: ${lookupError.message}`)

  const query = existing
    ? sb.from('members').update(insert).eq('id', existing.id)
    : sb.from('members').insert(insert)

  const { data, error } = await query.select('id, user_id, email, name').single()
  if (error) throw new Error(`seedMember failed: ${error.message}`)
  return data as SeededMember
}

export async function deleteMember(memberId: string): Promise<void> {
  const sb = getSupabaseAdmin()
  await sb.from('members').delete().eq('id', memberId)
}
