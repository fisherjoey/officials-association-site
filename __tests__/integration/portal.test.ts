/**
 * Smoke tests for portal backend functions. We mint one admin and one
 * "official" (regular member) test user per file, then exercise each
 * endpoint:
 *   - returns 401 without an auth header
 *   - returns the right shape for an authenticated GET
 *   - returns 403 when an underprivileged user hits a write
 *
 * For the read-only smoke tests we don't need to assert on row content —
 * the endpoints are thin wrappers and what we want to catch is regressions
 * in the auth layer or the table SELECTs.
 */
import { handler as membersHandler } from '@/netlify/functions/members'
import { handler as calendarHandler } from '@/netlify/functions/calendar-events'
import { handler as evaluationsHandler } from '@/netlify/functions/evaluations'
import { handler as announcementsHandler } from '@/netlify/functions/announcements'
import { handler as newslettersHandler } from '@/netlify/functions/newsletters'
import { handler as schedulerUpdatesHandler } from '@/netlify/functions/scheduler-updates'
import { handler as ruleModificationsHandler } from '@/netlify/functions/rule-modifications'
import { handler as memberActivitiesHandler } from '@/netlify/functions/member-activities'
import { handler as officialsHandler } from '@/netlify/functions/officials'
import { handler as contactSubmissionsHandler } from '@/netlify/functions/contact-submissions'
import { handler as emailHistoryHandler } from '@/netlify/functions/email-history'
import { handler as logsHandler } from '@/netlify/functions/logs'
import { handler as osaSubmissionsHandler } from '@/netlify/functions/osa-submissions'

import { invokeFunction } from './helpers/invokeFunction'
import {
  cleanupOrphanedTestUsers,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from './helpers/auth'

import type { Handler } from '@netlify/functions'

let admin: TestUser
let official: TestUser

beforeAll(async () => {
  await cleanupOrphanedTestUsers()
  ;[admin, official] = await Promise.all([createTestUser('admin'), createTestUser('official')])
}, 30_000)

afterAll(async () => {
  await Promise.all([admin && deleteTestUser(admin), official && deleteTestUser(official)])
})

interface Spec {
  name: string
  handler: Handler
  /** read auth: 'authenticated' (any signed-in user can GET) or 'admin' */
  read: 'authenticated' | 'admin' | 'public'
}

// Authenticated-GET endpoints where any signed-in user can list/read
const AUTH_READ_SPECS: Spec[] = [
  { name: 'calendar-events', handler: calendarHandler, read: 'authenticated' },
  { name: 'announcements', handler: announcementsHandler, read: 'authenticated' },
  { name: 'newsletters', handler: newslettersHandler, read: 'authenticated' },
  { name: 'scheduler-updates', handler: schedulerUpdatesHandler, read: 'authenticated' },
  { name: 'rule-modifications', handler: ruleModificationsHandler, read: 'authenticated' },
  { name: 'member-activities', handler: memberActivitiesHandler, read: 'authenticated' },
  { name: 'officials', handler: officialsHandler, read: 'public' },
]

// Endpoints that require an "authenticated" auth level at the gateway but
// then do their own admin-vs-self filtering in the handler. Unscoped GET
// from a non-admin returns 403 by design.
const SELF_SCOPED_SPECS: Spec[] = [
  { name: 'members', handler: membersHandler, read: 'authenticated' },
  { name: 'evaluations', handler: evaluationsHandler, read: 'authenticated' },
]

// Admin-only endpoints (entire function, all methods)
const ADMIN_ONLY_SPECS: Spec[] = [
  { name: 'contact-submissions', handler: contactSubmissionsHandler, read: 'admin' },
  { name: 'email-history', handler: emailHistoryHandler, read: 'admin' },
  { name: 'logs', handler: logsHandler, read: 'admin' },
  { name: 'osa-submissions', handler: osaSubmissionsHandler, read: 'admin' },
]

describe('portal — authenticated reads', () => {
  it.each(AUTH_READ_SPECS.filter((s) => s.read === 'authenticated'))(
    '$name GET requires a bearer token',
    async ({ handler }) => {
      const res = await invokeFunction(handler, { method: 'GET' })
      expect(res.statusCode).toBe(401)
    }
  )

  it.each(AUTH_READ_SPECS)('$name GET succeeds for a regular signed-in member', async ({ handler }) => {
    const res = await invokeFunction(handler, { method: 'GET', bearerToken: official.accessToken })
    expect(res.statusCode).toBe(200)
  })
})

describe('portal — self-scoped endpoints (members, evaluations)', () => {
  it.each(SELF_SCOPED_SPECS)('$name unscoped GET is 403 for non-admin (handler-level gate)', async ({ handler }) => {
    const res = await invokeFunction(handler, { method: 'GET', bearerToken: official.accessToken })
    expect(res.statusCode).toBe(403)
  })

  it.each(SELF_SCOPED_SPECS)('$name unscoped GET is 200 for admin', async ({ handler }) => {
    const res = await invokeFunction(handler, { method: 'GET', bearerToken: admin.accessToken })
    expect(res.statusCode).toBe(200)
  })

  it('members GET ?email=<own email> is allowed for the owner', async () => {
    const res = await invokeFunction(membersHandler, {
      method: 'GET',
      query: { email: official.email },
      bearerToken: official.accessToken,
    })
    // Member row may or may not exist for the test user; what matters is
    // that the handler's self-scope check accepted the call rather than
    // 403'ing.
    expect(res.statusCode).toBe(200)
  })

  it('members GET ?email=<other user> is 403 for a non-admin', async () => {
    const res = await invokeFunction(membersHandler, {
      method: 'GET',
      query: { email: 'someone-else@example.test' },
      bearerToken: official.accessToken,
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('portal — admin-or-executive write gates', () => {
  // calendar-events POST requires admin_or_executive — an "official" should
  // be 403'd. We send an obviously invalid body since we only care about
  // the auth check firing first.
  const adminOrExecWrites: Array<{ name: string; handler: Handler }> = [
    { name: 'calendar-events', handler: calendarHandler },
    { name: 'announcements', handler: announcementsHandler },
    { name: 'newsletters', handler: newslettersHandler },
    { name: 'scheduler-updates', handler: schedulerUpdatesHandler },
    { name: 'rule-modifications', handler: ruleModificationsHandler },
    { name: 'member-activities', handler: memberActivitiesHandler },
    { name: 'officials', handler: officialsHandler },
  ]

  it.each(adminOrExecWrites)('$name POST is 403 for non-admin', async ({ handler }) => {
    const res = await invokeFunction(handler, {
      method: 'POST',
      body: { name: 'should not get past auth' },
      bearerToken: official.accessToken,
    })
    expect(res.statusCode).toBe(403)
  })

  it.each(adminOrExecWrites)('$name POST is 401 with no token', async ({ handler }) => {
    const res = await invokeFunction(handler, {
      method: 'POST',
      body: { name: 'should not get past auth' },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('portal — admin-only endpoints', () => {
  it.each(ADMIN_ONLY_SPECS)('$name GET is 401 with no token', async ({ handler }) => {
    const res = await invokeFunction(handler, { method: 'GET' })
    expect(res.statusCode).toBe(401)
  })

  it.each(ADMIN_ONLY_SPECS)('$name GET is 403 for non-admin', async ({ handler }) => {
    const res = await invokeFunction(handler, { method: 'GET', bearerToken: official.accessToken })
    expect(res.statusCode).toBe(403)
  })

  it.each(ADMIN_ONLY_SPECS)('$name GET is 200 for admin', async ({ handler }) => {
    const res = await invokeFunction(handler, { method: 'GET', bearerToken: admin.accessToken })
    expect(res.statusCode).toBe(200)
  })
})
