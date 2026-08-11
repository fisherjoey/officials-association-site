import { handler } from '@/netlify/functions/osa-webhook'
import { buildOSAPayload } from '@/lib/forms/osaPayload'
import { invokeFunction } from './helpers/invokeFunction'
import { cleanupOSARows, getSupabaseAdmin, tag } from './helpers/supabase'
import {
  exhibitionFixture,
  leagueFixture,
  multiLeagueFixture,
  tournamentFixture,
} from './helpers/osaFixture'
import { mockMicrosoftGraph, type MockGraphHandle } from './helpers/mockGraph'

const DEAD_INBOX = process.env.OSA_TEST_DEAD_INBOX || 'osa-e2e-deadinbox@example.test'

describe('osa-webhook', () => {
  let graph: MockGraphHandle

  beforeAll(() => {
    // Force the dead-inbox routing for the duration of this file. The
    // handler reads these at call time so they need to be set before
    // invokeFunction is called.
    process.env.OSA_SCHEDULER_EMAIL = DEAD_INBOX
    process.env.OSA_TREASURER_EMAIL = DEAD_INBOX
    process.env.OSA_SENDER_EMAIL = DEAD_INBOX
    // Required for the handler's "service configured" guard to pass.
    process.env.MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID || 'test-tenant'
    process.env.MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || 'test-client'
    process.env.MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET || 'test-secret'
  })

  beforeEach(() => {
    graph = mockMicrosoftGraph()
  })

  afterEach(() => {
    graph.restore()
  })

  afterAll(async () => {
    await cleanupOSARows()
  })

  it('accepts a single Exhibition Game submission and persists it', async () => {
    const orgName = tag('Exhibition')
    const payload = buildOSAPayload(
      exhibitionFixture({ organizationName: orgName, contactEmail: DEAD_INBOX })
    )

    const res = await invokeFunction(handler, { method: 'POST', body: payload })

    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({
      success: true,
      eventCount: 1,
      results: { client: true, scheduler: true },
    })
    expect(res.body.submissionGroupId).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.body.submissionIds).toHaveLength(1)

    const sb = getSupabaseAdmin()
    const { data: rows } = await sb
      .from('osa_submissions')
      .select('id, organization_name, event_type, submission_group_id, event_index')
      .eq('organization_name', orgName)
    expect(rows).toHaveLength(1)
    expect(rows![0].event_type).toBe('Exhibition Game(s)')
    expect(rows![0].submission_group_id).toBe(res.body.submissionGroupId)
  })

  it('accepts a League submission', async () => {
    const orgName = tag('League')
    const payload = buildOSAPayload(
      leagueFixture({ organizationName: orgName, contactEmail: DEAD_INBOX })
    )

    const res = await invokeFunction(handler, { method: 'POST', body: payload })

    expect(res.statusCode).toBe(200)
    expect(res.body.success).toBe(true)

    const sb = getSupabaseAdmin()
    const { data: rows } = await sb
      .from('osa_submissions')
      .select('event_type, league_name, league_days_of_week')
      .eq('organization_name', orgName)
    expect(rows![0].event_type).toBe('League')
    expect(rows![0].league_name).toBe('E2E Test League')
    expect(rows![0].league_days_of_week).toBe('Monday, Wednesday')
  })

  it('accepts a Tournament submission', async () => {
    const orgName = tag('Tournament')
    const payload = buildOSAPayload(
      tournamentFixture({ organizationName: orgName, contactEmail: DEAD_INBOX })
    )

    const res = await invokeFunction(handler, { method: 'POST', body: payload })
    expect(res.statusCode).toBe(200)

    const sb = getSupabaseAdmin()
    const { data: rows } = await sb
      .from('osa_submissions')
      .select('event_type, tournament_name, tournament_number_of_games')
      .eq('organization_name', orgName)
    expect(rows![0].event_type).toBe('Tournament')
    expect(rows![0].tournament_name).toBe('E2E Test Tournament')
    expect(rows![0].tournament_number_of_games).toBe(12)
  })

  it('persists multi-event submissions as separate rows under one group', async () => {
    const orgName = tag('Multi')
    const payload = buildOSAPayload(
      multiLeagueFixture({ organizationName: orgName, contactEmail: DEAD_INBOX })
    )

    const res = await invokeFunction(handler, { method: 'POST', body: payload })
    expect(res.statusCode).toBe(200)
    expect(res.body.eventCount).toBe(2)
    expect(res.body.submissionIds).toHaveLength(2)

    const sb = getSupabaseAdmin()
    const { data: rows } = await sb
      .from('osa_submissions')
      .select('event_index, league_name, submission_group_id')
      .eq('organization_name', orgName)
      .order('event_index', { ascending: true })

    expect(rows).toHaveLength(2)
    expect(rows![0].league_name).toBe('E2E League A')
    expect(rows![1].league_name).toBe('E2E League B')
    expect(rows![0].submission_group_id).toBe(rows![1].submission_group_id)
  })

  it('routes outbound mail to the dead inbox via env override', async () => {
    const orgName = tag('Routing')
    const payload = buildOSAPayload(
      exhibitionFixture({ organizationName: orgName, contactEmail: DEAD_INBOX })
    )

    await invokeFunction(handler, { method: 'POST', body: payload })

    // Should send to the contact (dead inbox), CC the scheduler (also dead),
    // and a separate scheduler-notification email also to the dead inbox.
    expect(graph.sends.length).toBeGreaterThanOrEqual(2)
    const allTos = graph.sends.flatMap((s) => [...s.toRecipients, ...s.ccRecipients])
    const distinct = new Set(allTos)
    // Every recipient must be the dead inbox — i.e. nothing escaped.
    distinct.forEach((addr) => expect(addr).toBe(DEAD_INBOX))

    const subjects = graph.sends.map((s) => s.subject)
    expect(subjects.some((s) => s.startsWith('Confirmation of booking'))).toBe(true)
    expect(subjects.some((s) => s.startsWith('New OSA Request'))).toBe(true)
  })

  it('is idempotent: replaying the same submission returns duplicate=true and does not insert again', async () => {
    const orgName = tag('Idempotent')
    // Pin submissionTime so the deterministic group-id hash matches on replay.
    const submissionTime = new Date().toISOString()
    const fixture = exhibitionFixture({ organizationName: orgName, contactEmail: DEAD_INBOX })
    const payload = buildOSAPayload(fixture, { submissionTime })

    const first = await invokeFunction(handler, { method: 'POST', body: payload })
    expect(first.statusCode).toBe(200)
    expect(first.body.success).toBe(true)
    expect(first.body.duplicate).toBeUndefined()

    const second = await invokeFunction(handler, { method: 'POST', body: payload })
    expect(second.statusCode).toBe(200)
    expect(second.body.duplicate).toBe(true)
    expect(second.body.submissionGroupId).toBe(first.body.submissionGroupId)

    const sb = getSupabaseAdmin()
    const { data: rows } = await sb
      .from('osa_submissions')
      .select('id')
      .eq('organization_name', orgName)
    expect(rows).toHaveLength(1)
  })

  it('rejects non-POST methods', async () => {
    const res = await invokeFunction(handler, { method: 'GET' })
    expect(res.statusCode).toBe(405)
  })

  it('rejects payloads with no events array and no eventType', async () => {
    const res = await invokeFunction(handler, { method: 'POST', body: { organizationName: 'x' } })
    expect(res.statusCode).toBe(400)
    expect(res.body.message ?? res.body.error).toMatch(/(Invalid form data|missing event)/i)
  })

  it('rejects payloads missing required fields', async () => {
    const res = await invokeFunction(handler, {
      method: 'POST',
      body: { events: [{ eventIndex: 1, eventType: 'League' }] },
    })
    expect(res.statusCode).toBe(400)
    expect(res.body.message ?? res.body.error).toMatch(/(Missing required|are all required|are required|missing)/i)
  })
})
