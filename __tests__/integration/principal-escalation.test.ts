/**
 * The escalation this repo shipped with, run as a test rather than described.
 *
 * `getPrincipal()` used to read the caller's rung from `app_metadata.role` and
 * fall back to `user_metadata.role`. `app_metadata` is server-controlled;
 * `user_metadata` is whatever the account last sent to `PUT /auth/v1/user`. So
 * three ordinary calls — sign up, write your own metadata, refresh — turned a
 * stranger into an administrator of every Netlify Function, because the
 * functions hold the service-role key and RLS never gets a say about them.
 *
 * Every request below goes through the real handler with a real token. The
 * attacker is a genuine self-signup through the anon client, not a fixture: if
 * signup is open, this is the exact sequence available to anyone who finds the
 * site.
 *
 * Run against a live stack:
 *
 *   npx supabase start
 *   npx supabase db reset
 *   npx jest --config jest.config.integration.js __tests__/integration/principal-escalation.test.ts
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { handler as contactSubmissionsHandler } from '@/netlify/functions/contact-submissions'
import { handler as logsHandler } from '@/netlify/functions/logs'
import { handler as membersHandler } from '@/netlify/functions/members'
import { handler as evaluationsHandler } from '@/netlify/functions/evaluations'

import { invokeFunction } from './helpers/invokeFunction'
import {
  cleanupOrphanedTestUsers,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from './helpers/auth'
import { cleanupMembersRows } from './helpers/cleanup'
import { getSupabaseAdmin, E2E_TAG } from './helpers/supabase'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * A self-signup with a session, holding nothing but the anon key — the state
 * every new account is in before an admin has looked at it.
 */
interface Attacker {
  id: string
  email: string
  client: SupabaseClient
  token: string
}

let attacker: Attacker
let realAdmin: TestUser

/** Sign up through the public anon endpoint, exactly as the login page does. */
async function signUpStranger(): Promise<Attacker> {
  const email = `${E2E_TAG.toLowerCase()}-stranger-${Date.now()}-${Math.floor(
    Math.random() * 100000
  )}@example.test`
  const password = `Stranger_${Math.random().toString(36).slice(2, 10)}!1A`

  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await client.auth.signUp({ email, password })
  if (error || !data.session || !data.user) {
    throw new Error(`self-signup failed: ${error?.message ?? 'no session returned'}`)
  }

  return { id: data.user.id, email, client, token: data.session.access_token }
}

/**
 * The attack itself: write your own role into `user_metadata`, then refresh so
 * the new claim is on the token. This is `PUT /auth/v1/user` with the account's
 * own bearer token — no admin key, no privileged endpoint.
 */
async function claimRole(who: Attacker, role: string): Promise<string> {
  const { error } = await who.client.auth.updateUser({ data: { role } })
  if (error) throw new Error(`PUT /auth/v1/user failed: ${error.message}`)

  const { data, error: refreshError } = await who.client.auth.refreshSession()
  if (refreshError || !data.session) {
    throw new Error(`token refresh failed: ${refreshError?.message ?? 'no session'}`)
  }

  who.token = data.session.access_token
  return who.token
}

/** Confirm the write landed, so a refusal below is the resolver and not a no-op. */
async function storedUserMetadataRole(userId: string): Promise<unknown> {
  const { data, error } = await getSupabaseAdmin().auth.admin.getUserById(userId)
  if (error) throw new Error(`getUserById failed: ${error.message}`)
  return data.user?.user_metadata?.role
}

beforeAll(async () => {
  if (!ANON_KEY) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY is required — this suite signs up through the public endpoint'
    )
  }
  await cleanupOrphanedTestUsers()
  await cleanupMembersRows()

  realAdmin = await createTestUser('admin')
  attacker = await signUpStranger()
}, 60_000)

afterAll(async () => {
  if (attacker) {
    await getSupabaseAdmin().from('members').delete().eq('user_id', attacker.id)
    await getSupabaseAdmin().auth.admin.deleteUser(attacker.id).catch(() => {})
  }
  if (realAdmin) await deleteTestUser(realAdmin)
  await cleanupMembersRows()
})

describe('a self-signup cannot name its own rung', () => {
  it('accepts the metadata write — the account really is telling the server it is an admin', async () => {
    await claimRole(attacker, 'admin')
    expect(await storedUserMetadataRole(attacker.id)).toBe('admin')
  })

  it.each([
    ['contact-submissions', contactSubmissionsHandler],
    ['logs', logsHandler],
    ['members (unscoped roster read)', membersHandler],
  ])('%s refuses the self-declared admin', async (name, handler) => {
    const res = await invokeFunction(handler, {
      method: 'GET',
      bearerToken: attacker.token,
    })
    // eslint-disable-next-line no-console
    console.log(`[escalation probe] ${name} -> ${res.statusCode}`)
    expect(res.statusCode).toBe(403)
  })
})

describe('a self-signup cannot grant itself a capability either', () => {
  it('claims the evaluator grant through the same call', async () => {
    await claimRole(attacker, 'evaluator')
    expect(await storedUserMetadataRole(attacker.id)).toBe('evaluator')
  })

  it('evaluations refuses the whole-table read', async () => {
    const res = await invokeFunction(evaluationsHandler, {
      method: 'GET',
      bearerToken: attacker.token,
    })
    // eslint-disable-next-line no-console
    console.log(`[escalation probe] evaluations -> ${res.statusCode}`)
    expect(res.statusCode).toBe(403)
  })
})

describe('the rungs that live in the roster still work', () => {
  it('an admin whose role is in members.role reads the admin-only tables', async () => {
    for (const [name, handler] of [
      ['contact-submissions', contactSubmissionsHandler],
      ['logs', logsHandler],
    ] as const) {
      const res = await invokeFunction(handler, {
        method: 'GET',
        bearerToken: realAdmin.accessToken,
      })
      // eslint-disable-next-line no-console
      console.log(`[real admin] ${name} -> ${res.statusCode}`)
      expect(res.statusCode).toBe(200)
    }
  })
})

describe('a signed-in user with no members row', () => {
  it('resolves to no role rather than to the bottom rung', async () => {
    // Nothing has created a roster row for the attacker, and the metadata
    // claim above is now ignored. An unscoped roster read is the cheapest
    // probe that separates "member" from "nobody": a plain member is refused
    // here too, so the assertion is only that it is not treated as privileged.
    const res = await invokeFunction(membersHandler, {
      method: 'GET',
      bearerToken: attacker.token,
    })
    expect(res.statusCode).toBe(403)
  })

  it('can still look itself up, which is what the registration screen does', async () => {
    const res = await invokeFunction(membersHandler, {
      method: 'GET',
      query: { user_id: attacker.id },
      bearerToken: attacker.token,
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toBeNull()
  })

  it('can still register itself onto the roster', async () => {
    const res = await invokeFunction(membersHandler, {
      method: 'POST',
      bearerToken: attacker.token,
      body: {
        email: attacker.email,
        name: `${E2E_TAG} Stranger`,
        user_id: attacker.id,
        skipInvite: true,
      },
    })
    expect(res.statusCode).toBe(201)

    const { data } = await getSupabaseAdmin()
      .from('members')
      .select('role, capabilities')
      .eq('user_id', attacker.id)
      .single()

    // Registration puts them on the bottom rung with no grants — the roster
    // row is what a role now means, and this is the only way to acquire one.
    expect(data!.role).toBe('member')
    expect(data!.capabilities).toEqual([])
  })

  it('and is still refused the admin tables afterwards', async () => {
    const res = await invokeFunction(contactSubmissionsHandler, {
      method: 'GET',
      bearerToken: attacker.token,
    })
    expect(res.statusCode).toBe(403)
  })
})
