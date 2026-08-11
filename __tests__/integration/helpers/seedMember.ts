/**
 * Seed a `members` table row tied to an auth user. Several portal
 * functions (members PUT, evaluations, member_activities) require the
 * caller to have an existing members row keyed by user_id or email.
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
    role: overrides.role ?? user.role,
    status: overrides.status ?? 'active',
  }
  if (overrides.rank !== undefined) insert.rank = overrides.rank
  if (overrides.certification_level !== undefined) {
    insert.certification_level = overrides.certification_level
  }

  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from('members')
    .insert(insert)
    .select('id, user_id, email, name')
    .single()
  if (error) throw new Error(`seedMember failed: ${error.message}`)
  return data as SeededMember
}

export async function deleteMember(memberId: string): Promise<void> {
  const sb = getSupabaseAdmin()
  await sb.from('members').delete().eq('id', memberId)
}
