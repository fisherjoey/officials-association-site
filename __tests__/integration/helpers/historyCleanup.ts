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

/** email_history: tag is on `subject`. */
export async function cleanupEmailHistoryRows(): Promise<void> {
  const sb = getSupabaseAdmin()
  const { error } = await sb
    .from('email_history')
    .delete()
    .like('subject', PATTERN)
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('cleanup email_history.subject failed:', error.message)
  }
}

/** app_logs: tag is on `message`. */
export async function cleanupAppLogsRows(): Promise<void> {
  const sb = getSupabaseAdmin()
  const { error } = await sb
    .from('app_logs')
    .delete()
    .like('message', PATTERN)
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('cleanup app_logs.message failed:', error.message)
  }
}

/** audit_logs: tag is on `description`. */
export async function cleanupAuditLogsRows(): Promise<void> {
  const sb = getSupabaseAdmin()
  const { error } = await sb
    .from('audit_logs')
    .delete()
    .like('description', PATTERN)
  if (error) {
    // eslint-disable-next-line no-console
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
