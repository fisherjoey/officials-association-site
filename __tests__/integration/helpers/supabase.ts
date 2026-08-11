import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null = null

/**
 * Returns a Supabase client authenticated with the service role key.
 * Used by tests to clean up rows they create. Do not use this in handler
 * code; this is for test setup/teardown only.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Supabase admin requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  }
  cached = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return cached
}

/**
 * Recognizable prefix for any string field that tests use to tag rows they
 * create. Cleanup matches on this prefix so a test run can blast its own
 * rows without touching real data.
 */
export const E2E_TAG = 'E2E-TEST'

/** Build a unique tagged value, e.g. `E2E-TEST-1730000000000-org`. */
export function tag(suffix: string): string {
  return `${E2E_TAG}-${Date.now()}-${suffix}`
}

/** Delete osa_submissions rows whose organization_name starts with E2E_TAG. */
export async function cleanupOSARows(): Promise<void> {
  const sb = getSupabaseAdmin()
  const { error } = await sb
    .from('osa_submissions')
    .delete()
    .like('organization_name', `${E2E_TAG}%`)
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('OSA cleanup failed:', error.message)
  }
}

/** Delete contact_submissions rows tagged by tests. The handler prefixes
 *  the saved subject with `[Contact Form] ` so we match anywhere. */
export async function cleanupContactRows(): Promise<void> {
  const sb = getSupabaseAdmin()
  const { error } = await sb
    .from('contact_submissions')
    .delete()
    .like('subject', `%${E2E_TAG}%`)
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('contact_submissions cleanup failed:', error.message)
  }
}

/** Delete app_logs rows older than the run, just for the e2e correlation ids. */
export async function cleanupLogsForCorrelation(correlationIds: string[]): Promise<void> {
  if (correlationIds.length === 0) return
  const sb = getSupabaseAdmin()
  const { error } = await sb.from('app_logs').delete().in('correlation_id', correlationIds)
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('app_logs cleanup failed:', error.message)
  }
}
