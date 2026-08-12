/**
 * Cleanup helpers for the email_history / app_logs / audit_logs tables
 * exercised by `admin-history.test.ts`. These tables don't have a
 * "title" / "name" column matching the standard cleanup convention, so
 * each one matches on a different text field that the tests guarantee
 * to tag with E2E_TAG.
 *
 * Kept out of `cleanup.ts` (per the test author's instructions) so this
 * agent doesn't risk modifying the shared helper concurrently with
 * other agents.
 */
import { getSupabaseAdmin, E2E_TAG } from './supabase'

const PATTERN = `%${E2E_TAG}%`

/**
 * `app_logs` and `audit_logs` are swept with ILIKE rather than LIKE, and that
 * is not cosmetic. Most tagged rows in those two tables are not seeded — they
 * are what the Logger writes while a handler runs, and the tag reaches them
 * through a test user's address, which is lower-cased (`e2e-test-…`). A
 * case-sensitive sweep left every one of those behind, run after run, while
 * `logs.ts` searches them with ILIKE and finds them all. The suite's own
 * assertion is "page 1 of 50, newest first", and the seeded INFO row is
 * timestamped a minute in the past, so about sixty seconds' worth of
 * uncollected rows is enough to push it off the page — a failure that arrives
 * days later and looks like a filter bug.
 */

/** email_history: tag is on `subject`. */
export async function cleanupEmailHistoryRows(): Promise<void> {
  const sb = getSupabaseAdmin()
  const { error } = await sb
    .from('email_history')
    .delete()
    .like('subject', PATTERN)
  if (error) {
    console.warn('cleanup email_history.subject failed:', error.message)
  }
}

/** app_logs: tag is on `message`, in either case — see the note above. */
export async function cleanupAppLogsRows(): Promise<void> {
  const sb = getSupabaseAdmin()
  const { error } = await sb
    .from('app_logs')
    .delete()
    .ilike('message', PATTERN)
  if (error) {
    console.warn('cleanup app_logs.message failed:', error.message)
  }
}

/** audit_logs: tag is on `description`, in either case. */
export async function cleanupAuditLogsRows(): Promise<void> {
  const sb = getSupabaseAdmin()
  const { error } = await sb
    .from('audit_logs')
    .delete()
    .ilike('description', PATTERN)
  if (error) {
    console.warn('cleanup audit_logs.description failed:', error.message)
  }
}

export async function cleanupAdminHistoryRows(): Promise<void> {
  await Promise.all([
    cleanupEmailHistoryRows(),
    cleanupAppLogsRows(),
    cleanupAuditLogsRows(),
  ])
}
