/**
 * Integration tests for the admin-only history endpoints:
 *   - /.netlify/functions/email-history
 *   - /.netlify/functions/logs (type=app | audit | client)
 *
 * Both are read-only GET endpoints gated to `admin`. We seed rows
 * directly via the service-role admin client (the handlers themselves
 * have no write path), then exercise each filter param. Rows are
 * tagged with E2E_TAG on a searchable text column and cleaned up in
 * `afterAll` via helpers/historyCleanup.ts.
 */
import { handler as emailHistoryHandler } from '@/netlify/functions/email-history'
import { handler as logsHandler } from '@/netlify/functions/logs'

import { invokeFunction } from './helpers/invokeFunction'
import { getSupabaseAdmin, tag, E2E_TAG } from './helpers/supabase'
import {
  cleanupAdminHistoryRows,
  cleanupEmailHistoryRows,
  cleanupAppLogsRows,
  cleanupAuditLogsRows,
} from './helpers/historyCleanup'
import {
  cleanupOrphanedTestUsers,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from './helpers/auth'

let admin: TestUser
let official: TestUser

beforeAll(async () => {
  await cleanupOrphanedTestUsers()
  await cleanupAdminHistoryRows()
  ;[admin, official] = await Promise.all([
    createTestUser('admin'),
    createTestUser('official'),
  ])
}, 30_000)

afterAll(async () => {
  await Promise.all([
    admin && deleteTestUser(admin),
    official && deleteTestUser(official),
  ])
  // Both handlers are pure reads, but the createHandler wrapper logs
  // request lifecycle events through the Logger. Give those a moment
  // to flush before we delete rows by message-prefix.
  await new Promise((r) => setTimeout(r, 300))
  await cleanupAdminHistoryRows()
})

// ---------------------------------------------------------------------------
// email-history
// ---------------------------------------------------------------------------

describe('email-history — GET /.netlify/functions/email-history', () => {
  // Per-row tags so each test can target its own seeded data.
  const SUBJECT_BULK = tag('Subject-Bulk-Sent')
  const SUBJECT_INVITE_FAILED = tag('Subject-Invite-Failed')
  const SUBJECT_RESET = tag('Subject-Reset-Sent')
  const SUBJECT_SEARCH_HIT = tag('Subject-SearchHit-Unique')

  const NOW = new Date()
  const HOUR = 3600 * 1000
  const SENT_RECENT = new Date(NOW.getTime() - 1 * HOUR).toISOString()
  const SENT_TODAY = new Date(NOW.getTime() - 2 * HOUR).toISOString()
  const SENT_YESTERDAY = new Date(NOW.getTime() - 30 * HOUR).toISOString()
  const SENT_LAST_WEEK = new Date(NOW.getTime() - 8 * 24 * HOUR).toISOString()

  beforeAll(async () => {
    const sb = getSupabaseAdmin()
    // Wipe just our own rows in case a previous run left some — avoids
    // the count-based assertions tripping on stale data.
    await cleanupEmailHistoryRows()

    const rows = [
      {
        email_type: 'bulk',
        subject: SUBJECT_BULK,
        recipient_email: 'bulk-target@example.test',
        recipient_count: 12,
        status: 'sent',
        created_at: SENT_RECENT,
      },
      {
        email_type: 'invite',
        subject: SUBJECT_INVITE_FAILED,
        recipient_email: 'invite-target@example.test',
        recipient_count: 1,
        status: 'failed',
        error_message: 'fake-failure-for-tests',
        created_at: SENT_TODAY,
      },
      {
        email_type: 'password_reset',
        subject: SUBJECT_RESET,
        recipient_email: 'reset-target@example.test',
        recipient_count: 1,
        status: 'sent',
        created_at: SENT_YESTERDAY,
      },
      {
        email_type: 'welcome',
        subject: SUBJECT_SEARCH_HIT,
        recipient_email: 'search-needle@example.test',
        recipient_count: 1,
        status: 'sent',
        created_at: SENT_LAST_WEEK,
      },
    ]
    const { error } = await sb.from('email_history').insert(rows)
    if (error) throw new Error(`Failed to seed email_history: ${error.message}`)
  })

  it('rejects unauthenticated GET with 401', async () => {
    const res = await invokeFunction(emailHistoryHandler, { method: 'GET' })
    expect(res.statusCode).toBe(401)
  })

  it('rejects non-admin GET with 403', async () => {
    const res = await invokeFunction(emailHistoryHandler, {
      method: 'GET',
      bearerToken: official.accessToken,
    })
    expect(res.statusCode).toBe(403)
  })

  it('GET with no filters returns our seeded rows in the page', async () => {
    const res = await invokeFunction(emailHistoryHandler, {
      method: 'GET',
      bearerToken: admin.accessToken,
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({
      pagination: { page: 1, pageSize: 50 },
    })
    const subjects = (res.body.emails as Array<{ subject: string }>).map((e) => e.subject)
    // Default order is created_at DESC, page size 50 — our most recent
    // tagged rows should land in the first page.
    expect(subjects).toEqual(expect.arrayContaining([SUBJECT_BULK, SUBJECT_INVITE_FAILED]))
  })

  it('GET ?email_type=bulk filters to bulk rows only', async () => {
    const res = await invokeFunction(emailHistoryHandler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      query: { email_type: 'bulk' },
    })
    expect(res.statusCode).toBe(200)
    const ours = (res.body.emails as Array<{ subject: string; email_type: string }>)
      .filter((r) => r.subject.startsWith(E2E_TAG))
    expect(ours.length).toBeGreaterThan(0)
    for (const row of ours) {
      expect(row.email_type).toBe('bulk')
    }
    // The non-bulk seed rows must not appear under this filter.
    const subs = ours.map((r) => r.subject)
    expect(subs).toContain(SUBJECT_BULK)
    expect(subs).not.toContain(SUBJECT_INVITE_FAILED)
    expect(subs).not.toContain(SUBJECT_RESET)
  })

  it('GET ?status=failed filters to failed rows only', async () => {
    const res = await invokeFunction(emailHistoryHandler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      query: { status: 'failed' },
    })
    expect(res.statusCode).toBe(200)
    const ours = (res.body.emails as Array<{ subject: string; status: string }>)
      .filter((r) => r.subject.startsWith(E2E_TAG))
    expect(ours.length).toBeGreaterThan(0)
    for (const row of ours) {
      expect(row.status).toBe('failed')
    }
    const subs = ours.map((r) => r.subject)
    expect(subs).toContain(SUBJECT_INVITE_FAILED)
    expect(subs).not.toContain(SUBJECT_BULK)
  })

  it('GET ?search=<E2E-TEST fragment> hits a tagged subject', async () => {
    // The handler ORs across subject / sent_by_email / recipient_email.
    // We seeded a subject with a unique "SearchHit-Unique" fragment.
    const fragment = SUBJECT_SEARCH_HIT.split('-Subject-')[1] // "SearchHit-Unique"
    const res = await invokeFunction(emailHistoryHandler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      query: { search: fragment },
    })
    expect(res.statusCode).toBe(200)
    const subs = (res.body.emails as Array<{ subject: string }>).map((r) => r.subject)
    expect(subs).toContain(SUBJECT_SEARCH_HIT)
  })

  it('GET ?startDate=...&endDate=... respects the range', async () => {
    // Window covers SENT_TODAY/SENT_RECENT but NOT SENT_LAST_WEEK or
    // SENT_YESTERDAY (we set yesterday to 30h ago, outside a 24h window).
    const start = new Date(NOW.getTime() - 6 * HOUR).toISOString()
    const end = new Date(NOW.getTime() + 1 * HOUR).toISOString()
    const res = await invokeFunction(emailHistoryHandler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      query: { startDate: start, endDate: end },
    })
    expect(res.statusCode).toBe(200)
    const ours = (res.body.emails as Array<{ subject: string; created_at: string }>)
      .filter((r) => r.subject.startsWith(E2E_TAG))
    const subs = ours.map((r) => r.subject)
    expect(subs).toEqual(expect.arrayContaining([SUBJECT_BULK, SUBJECT_INVITE_FAILED]))
    expect(subs).not.toContain(SUBJECT_RESET)
    expect(subs).not.toContain(SUBJECT_SEARCH_HIT)
    for (const row of ours) {
      expect(row.created_at >= start).toBe(true)
      expect(row.created_at <= end).toBe(true)
    }
  })

  // FIXED: the search param was interpolated directly into a Postgres
  // ILIKE pattern via supabase-js .or() with no escaping of the `%` /
  // `_` wildcards or the comma/parenthesis that .or() uses as a
  // delimiter. The handler now strips those characters via
  // escapeIlikeTerm() before interpolation.
  // netlify/functions/email-history.ts:escapeIlikeTerm
  it('GET ?search=% is escaped, not interpolated as a wildcard', async () => {
    const res = await invokeFunction(emailHistoryHandler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      query: { search: '%' },
    })
    expect(res.statusCode).toBe(200)
    // A literal "%" appears nowhere in our seeded subjects, so a
    // properly-escaped search should return zero of our tagged rows.
    const ours = (res.body.emails as Array<{ subject: string }>)
      .filter((r) => r.subject.startsWith(E2E_TAG))
    expect(ours.length).toBe(0)
  })

  // FIXED: pageSize was clamped via Math.min but page was not
  // validated. NaN / 0 / negative pages round-tripped into negative
  // offsets. The handler now rejects non-finite or <1 pages with 400.
  // netlify/functions/email-history.ts (page validation block)
  it('GET ?page=0 returns 400 instead of a negative offset', async () => {
    const res = await invokeFunction(emailHistoryHandler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      query: { page: '0' },
    })
    expect(res.statusCode).toBe(400)
  })

  // FIXED: unknown filter values used to fall straight through into a
  // Postgres `eq` filter (returning zero rows silently). The handler
  // now validates `status` against VALID_STATUSES and returns 400.
  // netlify/functions/email-history.ts (VALID_STATUSES check)
  it('GET ?status=<unknown> returns 400 not silent zero rows', async () => {
    const res = await invokeFunction(emailHistoryHandler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      query: { status: 'totally-not-a-real-status' },
    })
    expect(res.statusCode).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// logs
// ---------------------------------------------------------------------------

describe('logs — GET /.netlify/functions/logs', () => {
  const APP_INFO_MSG = tag('App-Info-Login')
  const APP_ERROR_MSG = tag('App-Error-Email-Send')
  const AUDIT_DESC = tag('Audit-Created-Member')

  beforeAll(async () => {
    const sb = getSupabaseAdmin()
    await Promise.all([cleanupAppLogsRows(), cleanupAuditLogsRows()])

    const appRows = [
      {
        level: 'INFO',
        source: 'server',
        category: 'auth',
        function_name: 'login',
        action: 'login',
        message: APP_INFO_MSG,
        user_email: 'logger-test@example.test',
        timestamp: new Date(Date.now() - 60 * 1000).toISOString(),
      },
      {
        level: 'ERROR',
        source: 'server',
        category: 'email',
        function_name: 'send-email',
        action: 'send_email',
        message: APP_ERROR_MSG,
        user_email: 'logger-test@example.test',
        timestamp: new Date().toISOString(),
      },
    ]
    const { error: appErr } = await sb.from('app_logs').insert(appRows)
    if (appErr) throw new Error(`Failed to seed app_logs: ${appErr.message}`)

    const { error: auditErr } = await sb.from('audit_logs').insert([
      {
        action: 'CREATE',
        entity_type: 'member',
        entity_id: 'fake-member-id',
        actor_id: admin.id,
        actor_email: admin.email,
        actor_role: 'admin',
        description: AUDIT_DESC,
        timestamp: new Date().toISOString(),
      },
    ])
    if (auditErr) throw new Error(`Failed to seed audit_logs: ${auditErr.message}`)
  })

  it('rejects unauthenticated GET with 401', async () => {
    const res = await invokeFunction(logsHandler, { method: 'GET' })
    expect(res.statusCode).toBe(401)
  })

  it('rejects non-admin GET with 403', async () => {
    const res = await invokeFunction(logsHandler, {
      method: 'GET',
      bearerToken: official.accessToken,
    })
    expect(res.statusCode).toBe(403)
  })

  it('GET ?type=app returns app_logs rows', async () => {
    // Scope to our seeded rows — other test files run concurrently and
    // their Logger calls bury our messages past page 1 of 50.
    const res = await invokeFunction(logsHandler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      query: { type: 'app', search: E2E_TAG },
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({
      pagination: { page: 1, pageSize: 50 },
    })
    expect(Array.isArray(res.body.logs)).toBe(true)
    const messages = (res.body.logs as Array<{ message: string }>).map((l) => l.message)
    expect(messages).toEqual(expect.arrayContaining([APP_INFO_MSG, APP_ERROR_MSG]))
  })

  it('GET ?type=audit returns audit_logs shape', async () => {
    const res = await invokeFunction(logsHandler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      query: { type: 'audit' },
    })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.body.logs)).toBe(true)
    expect(res.body).toMatchObject({
      pagination: { page: 1, pageSize: 50 },
    })
    const ours = (res.body.logs as Array<{ description: string | null; action: string }>)
      .filter((r) => r.description?.startsWith(E2E_TAG))
    expect(ours.length).toBeGreaterThan(0)
    // audit_logs have an `action` field, not `level`.
    expect(ours[0]).toHaveProperty('action')
    expect(ours.map((r) => r.description)).toContain(AUDIT_DESC)
  })

  it('GET ?type=app&level=INFO filter respected', async () => {
    const res = await invokeFunction(logsHandler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      query: { type: 'app', level: 'INFO', search: E2E_TAG },
    })
    expect(res.statusCode).toBe(200)
    const ours = (res.body.logs as Array<{ message: string; level: string }>)
      .filter((r) => r.message.startsWith(E2E_TAG))
    expect(ours.length).toBeGreaterThan(0)
    for (const row of ours) {
      expect(row.level).toBe('INFO')
    }
    const messages = ours.map((r) => r.message)
    expect(messages).toContain(APP_INFO_MSG)
    expect(messages).not.toContain(APP_ERROR_MSG)
  })

  // FIXED: the handler used to pass `?level=info` (lowercase) directly
  // into `.eq('level', 'info')` against the CHECK-constrained column
  // whose values are uppercase ('INFO'/'WARN'/'ERROR'), matching zero
  // rows. The handler now uppercases level and validates it against
  // VALID_LEVELS. netlify/functions/logs.ts (level normalization)
  it('GET ?level=info (lowercase) matches INFO rows', async () => {
    const res = await invokeFunction(logsHandler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      // Scope to our seeded rows; other parallel test files spam app_logs.
      query: { type: 'app', level: 'info', search: E2E_TAG },
    })
    expect(res.statusCode).toBe(200)
    const ours = (res.body.logs as Array<{ message: string }>)
      .filter((r) => r.message.startsWith(E2E_TAG))
    const messages = ours.map((r) => r.message)
    expect(messages).toContain(APP_INFO_MSG)
  })

  it('GET ?source=server&action=send_email combined filter', async () => {
    const res = await invokeFunction(logsHandler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      query: { type: 'app', source: 'server', action: 'send_email' },
    })
    expect(res.statusCode).toBe(200)
    const ours = (res.body.logs as Array<{ message: string; source: string; action: string }>)
      .filter((r) => r.message.startsWith(E2E_TAG))
    expect(ours.length).toBeGreaterThan(0)
    for (const row of ours) {
      expect(row.source).toBe('server')
      // FIXED: the handler now applies `?action=` on both type=app and
      // type=audit branches, so this row.action will be 'send_email'.
      // The strict assertion lives in the test below; this lower-bar
      // assertion is preserved as a regression canary.
      expect(typeof row.action).toBe('string')
    }
    expect(ours.map((r) => r.message)).toContain(APP_ERROR_MSG)
  })

  // FIXED: with type=app, the `action` query param was silently
  // ignored because the handler only applied it on the type==='audit'
  // branch. app_logs has its own `action` column (see
  // supabase/migrations/add-logging-tables.sql) — the handler now
  // applies the filter on both branches.
  // netlify/functions/logs.ts (action filter on app branch)
  it('GET ?type=app&action=<x> filters by action on app_logs', async () => {
    const res = await invokeFunction(logsHandler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      query: { type: 'app', action: 'login' },
    })
    expect(res.statusCode).toBe(200)
    const ours = (res.body.logs as Array<{ message: string; action: string }>)
      .filter((r) => r.message.startsWith(E2E_TAG))
    expect(ours.length).toBeGreaterThan(0)
    for (const row of ours) {
      expect(row.action).toBe('login')
    }
    const messages = ours.map((r) => r.message)
    expect(messages).toContain(APP_INFO_MSG)
    expect(messages).not.toContain(APP_ERROR_MSG)
  })

  // FIXED: same shape as the email-history handler — the search param
  // was interpolated raw into ILIKE without escaping % or _. The
  // handler now strips wildcards / .or() delimiters via
  // escapeIlikeTerm() before interpolation.
  // netlify/functions/logs.ts (escapeIlikeTerm)
  it('GET ?type=app&search=% is escaped, not wildcarded', async () => {
    const res = await invokeFunction(logsHandler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      query: { type: 'app', search: '%' },
    })
    expect(res.statusCode).toBe(200)
    const ours = (res.body.logs as Array<{ message: string }>)
      .filter((r) => r.message.startsWith(E2E_TAG))
    expect(ours.length).toBe(0)
  })

  // FIXED: the docstring listed 'client' as a valid `?type=`, but the
  // handler treated anything not 'audit' as 'app', silently aliasing
  // client to app_logs. Client logs actually live in app_logs with
  // source='client' (see netlify/functions/client-logs.ts) — there is
  // no separate `client_logs` table — so the handler now 400s on
  // unknown types. netlify/functions/logs.ts (VALID_TYPES check)
  it('GET ?type=client is either a real table or rejected with 400', async () => {
    const res = await invokeFunction(logsHandler, {
      method: 'GET',
      bearerToken: admin.accessToken,
      query: { type: 'client' },
    })
    // Either a 400 (preferred) or a distinct, non-app payload.
    if (res.statusCode === 200) {
      const ours = (res.body.logs as Array<{ message?: string }>)
        .filter((r) => r.message?.startsWith(E2E_TAG))
      // Our app_logs seeds must NOT show up under ?type=client.
      expect(ours.length).toBe(0)
    } else {
      expect(res.statusCode).toBe(400)
    }
  })
})
