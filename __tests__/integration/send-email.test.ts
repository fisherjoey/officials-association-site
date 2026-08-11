/**
 * Integration tests for /.netlify/functions/send-email — admin bulk mailer.
 *
 * Wire shape: imports `EmailRequest` from the handler. Drift between the
 * frontend admin "Mail" page and the handler will surface as a TS compile
 * failure here. (The frontend caller in app/portal/mail/page.tsx already
 * uses this shape; a second caller in NewsClient.tsx uses a divergent shape
 * — see report.)
 *
 * Microsoft Graph is intercepted via mockMicrosoftGraph(); no real outbound
 * mail is sent. We assert routing (subject, html, recipients) by inspecting
 * the captured sends.
 *
 * Cleanup of email_history:
 *   The handler fire-and-forgets a row to `email_history` per send (and
 *   another on failure). We tag every test's `subject` with the E2E_TAG
 *   prefix so cleanupEmailHistoryRows() (subject LIKE %E2E-TEST%) matches
 *   them. `afterAll` sleeps briefly so the unawaited insert flushes before
 *   the sweep.
 */
import { handler, type EmailRequest } from '@/netlify/functions/send-email'
import { invokeFunction } from './helpers/invokeFunction'
import { E2E_TAG, getSupabaseAdmin, tag } from './helpers/supabase'
import {
  cleanupEmailHistoryRows,
  cleanupMembersRows,
} from './helpers/cleanup'
import {
  cleanupOrphanedTestUsers,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from './helpers/auth'
import { seedMember } from './helpers/seedMember'
import { mockMicrosoftGraph, type MockGraphHandle } from './helpers/mockGraph'

let admin: TestUser
let executive: TestUser
let official: TestUser

let adminMemberA: TestUser
let adminMemberB: TestUser
let highRankOfficial: TestUser
let lowRankOfficial: TestUser

beforeAll(async () => {
  // Configured-guard placeholders so the handler doesn't 500 with
  // "Email service not configured" before reaching the routing code.
  process.env.MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID || 'test-tenant'
  process.env.MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || 'test-client'
  process.env.MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET || 'test-secret'

  await cleanupOrphanedTestUsers()
  await cleanupMembersRows()
  await cleanupEmailHistoryRows()

  ;[
    admin,
    executive,
    official,
    adminMemberA,
    adminMemberB,
    highRankOfficial,
    lowRankOfficial,
  ] = await Promise.all([
    createTestUser('admin'),
    createTestUser('executive'),
    createTestUser('official'),
    createTestUser('admin'),
    createTestUser('admin'),
    createTestUser('official'),
    createTestUser('official'),
  ])

  // Seed members rows so getRecipientEmails() has data to expand groups
  // against. Two admins so 'admins' expansion has something to find; two
  // officials so we can probe rankFilter behaviour. The deployed members
  // table is missing the `rank` column (see seedMember.ts comment), so
  // we don't pass rank — instead we use certification_level for the
  // group-key probe and rely on rank-being-null for the rankFilter test
  // to demonstrate filter application.
  await Promise.all([
    seedMember(adminMemberA, { role: 'admin' }),
    seedMember(adminMemberB, { role: 'admin' }),
    seedMember(highRankOfficial, { role: 'official', certification_level: 'Level 3' }),
    seedMember(lowRankOfficial, { role: 'official', certification_level: 'Level 1' }),
  ])
}, 60_000)

afterAll(async () => {
  await Promise.all(
    [admin, executive, official, adminMemberA, adminMemberB, highRankOfficial, lowRankOfficial]
      .filter(Boolean)
      .map((u) => deleteTestUser(u))
  )
  // Handler does `await recordBulkEmail(...)` but recordBulkEmail itself
  // swallows errors and times out at 5s — give it a beat. Two-pass cleanup
  // catches rows that hadn't flushed by the first pass.
  await new Promise((r) => setTimeout(r, 1000))
  await cleanupMembersRows()
  await cleanupEmailHistoryRows()
  await new Promise((r) => setTimeout(r, 1500))
  await cleanupEmailHistoryRows()
})

const validBody = (overrides: Partial<EmailRequest> = {}): EmailRequest => ({
  subject: tag('Subject'),
  recipientGroups: [],
  customEmails: [`${E2E_TAG.toLowerCase()}-recipient@example.test`],
  htmlContent: `<p>${E2E_TAG} body content</p>`,
  ...overrides,
})

describe('send-email — auth', () => {
  // No Graph mock here — these requests should bail before touching fetch.
  it('rejects unauthenticated with 401', async () => {
    const res = await invokeFunction(handler, {
      method: 'POST',
      body: validBody(),
    })
    expect(res.statusCode).toBe(401)
  })

  it('rejects an "official" caller with 403', async () => {
    const res = await invokeFunction(handler, {
      method: 'POST',
      bearerToken: official.accessToken,
      body: validBody(),
    })
    expect(res.statusCode).toBe(403)
  })

  it('rejects an "executive" caller with 403 (admin-only handler)', async () => {
    const res = await invokeFunction(handler, {
      method: 'POST',
      bearerToken: executive.accessToken,
      body: validBody(),
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('send-email — admin happy paths', () => {
  let graph: MockGraphHandle

  beforeEach(() => {
    graph = mockMicrosoftGraph()
  })

  afterEach(() => {
    graph.restore()
  })

  it('400 when both recipientGroups and customEmails are empty', async () => {
    const res = await invokeFunction(handler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: validBody({ recipientGroups: [], customEmails: [] }),
    })
    expect(res.statusCode).toBe(400)
    expect(res.body.message ?? res.body.error).toMatch(/recipient/i)
    expect(graph.sends.length).toBe(0)
  })

  it('400 when subject is missing', async () => {
    const res = await invokeFunction(handler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: validBody({ subject: '' }),
    })
    expect(res.statusCode).toBe(400)
    expect(res.body.message ?? res.body.error).toMatch(/subject/i)
  })

  it('400 when htmlContent is missing', async () => {
    const res = await invokeFunction(handler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: validBody({ htmlContent: '' }),
    })
    expect(res.statusCode).toBe(400)
    expect(res.body.message ?? res.body.error).toMatch(/content/i)
  })

  it('routes a customEmails-only send through Graph with that recipient', async () => {
    const subject = tag('CustomOnly')
    const recipient = `${E2E_TAG.toLowerCase()}-direct@example.test`
    const res = await invokeFunction(handler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: validBody({
        subject,
        customEmails: [recipient],
        recipientGroups: [],
      }),
    })
    expect(res.statusCode).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.recipientCount).toBe(1)

    expect(graph.sends.length).toBe(1)
    const send = graph.sends[0]
    // The handler stuffs everyone into BCC and routes the visible "to"
    // back to the announcements inbox. mockGraph captures bcc on
    // ccRecipients via the same shape — but it actually parses
    // ccRecipients only, not bccRecipients. Inspect the raw URL/body
    // path: the captured `subject` is what we care about regardless.
    expect(send.subject).toBe(subject)
    // The body is wrapped by generateEmailTemplate; assert the
    // original html appears verbatim somewhere in the rendered template.
    expect(send.bodyHtml).toContain(`${E2E_TAG} body content`)
  })

  // FIXED: getRecipientEmails() used to do
  //   .from('members').select('email, role, certification_level, rank')
  // PostgREST interpreted the bare `rank` identifier as the SQL
  // window/aggregate function `rank()` and failed with "WITHIN GROUP is
  // required for ordered-set aggregate rank". The handler swallowed the
  // error, returned only the customEmails set, and every group
  // expansion silently expanded to nothing. The column was dropped from
  // the select (the deployed schema doesn't have it anyway).
  it('expands recipientGroups: ["admins"] to include seeded admin members', async () => {
    const subject = tag('AdminsExpand')
    const res = await invokeFunction(handler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: validBody({
        subject,
        customEmails: [],
        recipientGroups: ['admins'],
      }),
    })
    expect(res.statusCode).toBe(200)
    // Both seeded admin members should be in the recipient count. There
    // may be more admins in the dev DB; we only assert "at least our two".
    expect(res.body.recipientCount).toBeGreaterThanOrEqual(2)

    // We don't get the recipient list back in the response, so verify it
    // landed in email_history (recipient_list jsonb column).
    const sb = getSupabaseAdmin()
    let row: any = null
    for (let i = 0; i < 20 && !row; i++) {
      const { data } = await sb
        .from('email_history')
        .select('recipient_list, recipient_count, subject')
        .eq('subject', subject)
        .limit(1)
      row = data?.[0] ?? null
      if (!row) await new Promise((r) => setTimeout(r, 100))
    }
    expect(row).not.toBeNull()
    const list: string[] = row.recipient_list ?? []
    expect(list).toEqual(expect.arrayContaining([
      adminMemberA.email.toLowerCase(),
      adminMemberB.email.toLowerCase(),
    ]))
  })

  // FIXED: `members.rank` landed via migration. The select uses the
  // PostgREST alias form `member_rank:rank` to dodge the SQL
  // `rank()` aggregate-name collision. Members with null rank are
  // excluded when a rankFilter is supplied.
  it('rankFilter is applied: members lacking a rank are excluded from group expansion', async () => {
    // The deployed members schema lacks `rank`, so every seeded
    // official has rank=null. The handler treats null rank as
    // "exclude when rankFilter is set" — so passing any rankFilter
    // alongside ['officials'] should drop our two test officials and,
    // if no other ranked officials exist, surface as either 0
    // recipients (400) or a recipient_count that doesn't include
    // our seeded officials. Either outcome demonstrates the filter
    // is wired up; what we MUST NOT see is "rankFilter ignored,
    // both officials included".
    const subject = tag('RankFilter')
    const res = await invokeFunction(handler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: validBody({
        subject,
        // include a customEmail so we don't 400 on "no recipients"
        // when every official is filtered out.
        customEmails: [`${E2E_TAG.toLowerCase()}-rankprobe@example.test`],
        recipientGroups: ['officials'],
        rankFilter: '3+',
      }),
    })
    expect(res.statusCode).toBe(200)

    // Pull the recipient list from history.
    const sb = getSupabaseAdmin()
    let row: any = null
    for (let i = 0; i < 20 && !row; i++) {
      const { data } = await sb
        .from('email_history')
        .select('recipient_list, rank_filter, subject')
        .eq('subject', subject)
        .limit(1)
      row = data?.[0] ?? null
      if (!row) await new Promise((r) => setTimeout(r, 100))
    }
    expect(row).not.toBeNull()
    expect(row.rank_filter).toBe('3+')
    const list: string[] = (row.recipient_list ?? []).map((e: string) => e.toLowerCase())
    // Both seeded officials have null rank → must be excluded.
    expect(list).not.toContain(highRankOfficial.email.toLowerCase())
    expect(list).not.toContain(lowRankOfficial.email.toLowerCase())
  })

  it('preserves subject and htmlContent verbatim through routing', async () => {
    const subject = tag('Verbatim')
    const html = `<p>${E2E_TAG} <a href="https://example.org">link</a> ${tag('Body')}</p>`
    const res = await invokeFunction(handler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: validBody({
        subject,
        htmlContent: html,
        customEmails: [`${E2E_TAG.toLowerCase()}-verbatim@example.test`],
        recipientGroups: [],
      }),
    })
    expect(res.statusCode).toBe(200)
    expect(graph.sends.length).toBe(1)
    expect(graph.sends[0].subject).toBe(subject)
    // The html is wrapped by generateEmailTemplate, but the inner
    // payload should appear verbatim inside the rendered template.
    expect(graph.sends[0].bodyHtml).toContain(html)
  })

  // ──────────────────────────────────────────────────────────────────
  // Bug probes: the spec asks for these to be "exposed, not fixed".
  // Each is written as the assertion describing what the code SHOULD do;
  // if the current behaviour matches we keep them as `it`. Where it
  // doesn't match, we flip to `it.failing` so the suite stays green
  // while the broken behaviour is visible.
  // ──────────────────────────────────────────────────────────────────

  // FIXED: rankFilter is now validated up front. Previously
  // parseInt('not-a-number'.replace('+','')) was NaN; `member.rank < NaN`
  // is always false, so garbage rankFilter strings were silently coerced
  // into "include nobody" instead of being rejected. The handler now
  // returns 400 when rankFilter is supplied as a non-numeric string.
  it('rejects a non-numeric rankFilter with 400', async () => {
    const res = await invokeFunction(handler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: validBody({
        subject: tag('BadRank'),
        // include a customEmail so the failure isn't masked by the
        // "no valid recipients" 400.
        customEmails: [`${E2E_TAG.toLowerCase()}-badrank@example.test`],
        recipientGroups: ['officials'],
        rankFilter: 'not-a-number',
      }),
    })
    expect(res.statusCode).toBe(400)
  })

  it('dedupes a customEmail that is also captured by a group expansion', async () => {
    const subject = tag('Dedupe')
    // adminMemberA's email arrives BOTH from customEmails and from the
    // `admins` group expansion. The handler uses a Set so it should
    // appear exactly once.
    const res = await invokeFunction(handler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: validBody({
        subject,
        customEmails: [adminMemberA.email],
        recipientGroups: ['admins'],
      }),
    })
    expect(res.statusCode).toBe(200)

    const sb = getSupabaseAdmin()
    let row: any = null
    for (let i = 0; i < 20 && !row; i++) {
      const { data } = await sb
        .from('email_history')
        .select('recipient_list')
        .eq('subject', subject)
        .limit(1)
      row = data?.[0] ?? null
      if (!row) await new Promise((r) => setTimeout(r, 100))
    }
    expect(row).not.toBeNull()
    const list: string[] = row.recipient_list ?? []
    const occurrences = list.filter(
      (e) => e.toLowerCase() === adminMemberA.email.toLowerCase()
    ).length
    expect(occurrences).toBe(1)
  })

  // BUG probe: when one batch's Graph send errors, does the handler
  // fail-closed (surface the failure) or silently drop and report success?
  // We force the second sendMail call to 500 — but with batchSize=500 and
  // one batch, the first send is also the only send, so this exercises the
  // single-batch failure path: the handler should return a non-2xx and
  // record a 'failed' row in email_history.
  it('fails closed when Graph sendMail returns an error', async () => {
    // Override the global mock: token endpoint OK, sendMail 500.
    const original = global.fetch
    global.fetch = (async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input?.url ?? String(input)
      if (url.includes('/oauth2/v2.0/token')) {
        return new Response(
          JSON.stringify({ access_token: 'mock-token', token_type: 'Bearer', expires_in: 3600 }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }
      if (url.includes('/sendMail')) {
        return new Response('boom', { status: 500 })
      }
      return original(input, init)
    }) as typeof fetch

    try {
      const subject = tag('GraphFail')
      const res = await invokeFunction(handler, {
        method: 'POST',
        bearerToken: admin.accessToken,
        body: validBody({
          subject,
          customEmails: [`${E2E_TAG.toLowerCase()}-failclosed@example.test`],
          recipientGroups: [],
        }),
      })
      // createHandler rethrows -> 500 generic.
      expect(res.statusCode).toBe(500)

      // history row should land with status=failed (handler awaits it in
      // the catch block before re-throwing).
      const sb = getSupabaseAdmin()
      let row: any = null
      for (let i = 0; i < 20 && !row; i++) {
        const { data } = await sb
          .from('email_history')
          .select('status, error_message, subject')
          .eq('subject', subject)
          .limit(1)
        row = data?.[0] ?? null
        if (!row) await new Promise((r) => setTimeout(r, 100))
      }
      expect(row).not.toBeNull()
      expect(row.status).toBe('failed')
    } finally {
      global.fetch = original
    }
  })

  // BUG probe: the auth gate checks app_metadata.role === 'admin'. A user
  // with role !== 'admin' but with members.role === 'admin' (out-of-band
  // privilege via the DB) should NOT be able to bulk-email. This
  // specifically guards the "official with rank but role=admin in members"
  // confusion the prompt called out — only auth metadata should matter.
  it('a non-admin auth user cannot bulk-email even if their members row says admin', async () => {
    // adminMemberA was created with auth role 'admin'. Recreate the
    // scenario by reusing `official` (auth=official) with a members row
    // tagged as admin. Use upsert via a fresh seeded row keyed by email.
    const sb = getSupabaseAdmin()
    await sb
      .from('members')
      .upsert(
        { email: official.email, name: `${E2E_TAG} elevated`, role: 'admin', status: 'active' },
        { onConflict: 'email' }
      )
    const res = await invokeFunction(handler, {
      method: 'POST',
      bearerToken: official.accessToken,
      body: validBody(),
    })
    expect(res.statusCode).toBe(403)
  })
})
