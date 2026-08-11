/**
 * Cleanup helpers for every table agents may write to. Each function
 * deletes rows matching the E2E_TAG (`E2E-TEST`) on the table's most
 * obvious text column.
 *
 * If you need a new cleanup function, add it here — don't modify
 * supabase.ts. Then have your test call it in both beforeAll (to sweep
 * orphans) and afterAll (to clean up its own rows).
 */
import { getSupabaseAdmin, E2E_TAG } from './supabase'

const PATTERN = `%${E2E_TAG}%`

async function deleteByLike(
  table: string,
  column: string,
  pattern: string = PATTERN
): Promise<void> {
  const sb = getSupabaseAdmin()
  const { error } = await sb.from(table).delete().like(column, pattern)
  if (error) {
    // eslint-disable-next-line no-console
    console.warn(`cleanup ${table}.${column} failed:`, error.message)
  }
}

// Tables matched by `title`
export const cleanupAnnouncementsRows = () => deleteByLike('announcements', 'title')
export const cleanupCalendarEventsRows = () => deleteByLike('calendar_events', 'title')
export const cleanupNewslettersRows = () => deleteByLike('newsletters', 'title')
export const cleanupSchedulerUpdatesRows = () => deleteByLike('scheduler_updates', 'title')
export const cleanupRuleModificationsRows = () => deleteByLike('rule_modifications', 'title')
export const cleanupResourcesRows = () => deleteByLike('resources', 'title')
export const cleanupPublicNewsRows = () => deleteByLike('public_news', 'title')
export const cleanupPublicResourcesRows = () => deleteByLike('public_resources', 'title')
export const cleanupPublicTrainingRows = () => deleteByLike('public_training_events', 'title')

// Tables matched by `name`
export const cleanupOfficialsRows = () => deleteByLike('officials', 'name')
export const cleanupExecutiveTeamRows = () => deleteByLike('executive_team', 'name')

// Email history rows — bulk-email tests tag the subject with E2E_TAG so we
// match by the `subject` column.
export const cleanupEmailHistoryRows = () => deleteByLike('email_history', 'subject')

// member_activities — match on `notes` (the schema has no `description`
// column despite earlier draft schemas suggesting otherwise). Cascade-delete
// from `members` ON DELETE CASCADE handles the bulk of test cleanup; this
// catches anything inserted with a recognizable note text.
export const cleanupMemberActivitiesRows = () => deleteByLike('member_activities', 'notes')

// Tables matched by `page_name`
export const cleanupPublicPagesRows = () => deleteByLike('public_pages', 'page_name')

// Tables matched by `email` (invites are keyed by email)
export const cleanupInviteTokensRows = () => deleteByLike('invite_tokens', 'email', `${E2E_TAG.toLowerCase()}-%@example.test`)

// Members rows tied to test users — match the `email` column the same way
// as auth users (E2E-TEST-... prefix in the local part).
export const cleanupMembersRows = async (): Promise<void> => {
  const sb = getSupabaseAdmin()
  const { error } = await sb
    .from('members')
    .delete()
    .like('email', `${E2E_TAG.toLowerCase()}-%@example.test`)
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('cleanup members.email failed:', error.message)
  }
}

// Evaluations are tied to a member_id; clean by joining through tagged
// member emails. We do this in two steps because Supabase delete doesn't
// support join filters.
export const cleanupEvaluationsRows = async (): Promise<void> => {
  const sb = getSupabaseAdmin()
  // Title-based cleanup (preferred — most tests should tag the title).
  const { error: titleErr } = await sb.from('evaluations').delete().like('title', PATTERN)
  if (titleErr) {
    // eslint-disable-next-line no-console
    console.warn('cleanup evaluations.title failed:', titleErr.message)
  }
}

/**
 * Convenience: run every cleanup helper. Slow — only use this in a
 * one-off cleanup script, not on every test file.
 */
export async function cleanupEverything(): Promise<void> {
  await Promise.all([
    cleanupAnnouncementsRows(),
    cleanupCalendarEventsRows(),
    cleanupNewslettersRows(),
    cleanupSchedulerUpdatesRows(),
    cleanupRuleModificationsRows(),
    cleanupResourcesRows(),
    cleanupPublicNewsRows(),
    cleanupPublicResourcesRows(),
    cleanupPublicTrainingRows(),
    cleanupOfficialsRows(),
    cleanupExecutiveTeamRows(),
    cleanupMemberActivitiesRows(),
    cleanupPublicPagesRows(),
    cleanupInviteTokensRows(),
    cleanupEvaluationsRows(),
    cleanupMembersRows(),
    cleanupEmailHistoryRows(),
  ])
}
