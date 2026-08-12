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
import { cleanupEvaluationsRows, cleanupMembersRows } from './helpers/cleanup'
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

/** An address in the shape the cleanup helpers recognise. */
function strangerEmail(label: string): string {
  return `${E2E_TAG.toLowerCase()}-${label}-${Date.now()}-${Math.floor(
    Math.random() * 100000
  )}@example.test`
}

/**
 * Sign up through the public anon endpoint, exactly as the login page does.
 *
 * Passing an address is the interesting case rather than a convenience: local
 * Supabase ships with `enable_confirmations = false`, so signing up at an
 * address proves nothing about controlling the mailbox behind it.
 */
async function signUpStranger(address?: string): Promise<Attacker> {
  const email = address ?? strangerEmail('stranger')
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

/**
 * The roster row is the only source of privilege now, which makes every write
 * that reaches it a privilege write. The two suites below are the two ways an
 * account could reach one without an admin: put a grant in the row on the way
 * in, or point an existing privileged row at yourself.
 */
describe('a self-signup cannot smuggle a capability past the guard', () => {
  let smuggler: Attacker
  let victim: TestUser
  let evaluationId: string

  beforeAll(async () => {
    smuggler = await signUpStranger()
    victim = await createTestUser('member')

    const { data, error } = await getSupabaseAdmin()
      .from('evaluations')
      .insert({
        member_id: victim.memberId,
        evaluation_date: '2026-01-01',
        file_url: 'https://example.test/e2e-evaluation.pdf',
        file_name: 'e2e-evaluation.pdf',
        title: `${E2E_TAG} evaluation of somebody else`,
        notes: `${E2E_TAG}-CONFIDENTIAL notes about ${victim.email}`,
      })
      .select('id')
      .single()
    if (error || !data) {
      throw new Error(`could not seed the victim evaluation: ${error?.message}`)
    }
    evaluationId = data.id
  }, 60_000)

  afterAll(async () => {
    if (smuggler) {
      await getSupabaseAdmin().from('members').delete().eq('user_id', smuggler.id)
      await getSupabaseAdmin().auth.admin.deleteUser(smuggler.id).catch(() => {})
    }
    if (victim) await deleteTestUser(victim)
    await cleanupEvaluationsRows()
  })

  /**
   * `capabilities` is a `text[]`, and the guard on the non-admin POST used to
   * ask whether the caller had sent an array. A string is not an array, so it
   * walked past — and PostgREST's `json_populate_record` then cast the array
   * literal into the column, because the function holds the service-role key
   * and the guard trigger in migration 0015 never sees a service-role write.
   */
  it('refuses a registration carrying a capability as an array literal', async () => {
    const res = await invokeFunction(membersHandler, {
      method: 'POST',
      bearerToken: smuggler.token,
      body: {
        email: smuggler.email,
        name: `${E2E_TAG} Smuggler`,
        user_id: smuggler.id,
        skipInvite: true,
        capabilities: '{evaluator}',
      },
    })
    // eslint-disable-next-line no-console
    console.log(`[capability smuggle] POST /members -> ${res.statusCode}`)

    const { data } = await getSupabaseAdmin()
      .from('members')
      .select('role, capabilities')
      .eq('user_id', smuggler.id)
      .maybeSingle()
    // eslint-disable-next-line no-console
    console.log(`[capability smuggle] roster row -> ${JSON.stringify(data)}`)

    expect(res.statusCode).toBe(403)
    expect(data).toBeNull()
  })

  it('so the whole evaluations table stays shut', async () => {
    const res = await invokeFunction(evaluationsHandler, {
      method: 'GET',
      bearerToken: smuggler.token,
    })
    // eslint-disable-next-line no-console
    console.log(`[capability smuggle] GET /evaluations -> ${res.statusCode}`)
    expect(res.statusCode).toBe(403)
  })

  it("and somebody else's evaluation does not answer by id", async () => {
    const res = await invokeFunction(evaluationsHandler, {
      method: 'GET',
      query: { id: evaluationId },
      bearerToken: smuggler.token,
    })
    // eslint-disable-next-line no-console
    console.log(
      `[capability smuggle] GET /evaluations?id -> ${res.statusCode} ${res.rawBody.slice(0, 140)}`
    )
    expect(res.statusCode).toBe(404)
    expect(res.rawBody).not.toContain('CONFIDENTIAL')
  })

  it('refuses the other shapes the same cast accepts', async () => {
    for (const capabilities of ['evaluator', '{evaluator,scheduler}', { 0: 'evaluator' }] as const) {
      const res = await invokeFunction(membersHandler, {
        method: 'POST',
        bearerToken: smuggler.token,
        body: {
          email: smuggler.email,
          name: `${E2E_TAG} Smuggler`,
          user_id: smuggler.id,
          skipInvite: true,
          capabilities,
        },
      })
      // eslint-disable-next-line no-console
      console.log(`[capability smuggle] capabilities=${JSON.stringify(capabilities)} -> ${res.statusCode}`)
      expect(res.statusCode).toBe(403)
    }
  })

  it('refuses a rung sent as something other than a plain string', async () => {
    const res = await invokeFunction(membersHandler, {
      method: 'POST',
      bearerToken: smuggler.token,
      body: {
        email: smuggler.email,
        name: `${E2E_TAG} Smuggler`,
        user_id: smuggler.id,
        skipInvite: true,
        role: ['admin'],
      },
    })
    // eslint-disable-next-line no-console
    console.log(`[capability smuggle] role=["admin"] -> ${res.statusCode}`)
    expect(res.statusCode).toBe(403)
  })
})

describe('an account cannot bind itself to a privileged roster row', () => {
  let claimant: Attacker
  let privilegedRowId: string
  const seededEmail = strangerEmail('unlinked-admin')

  beforeAll(async () => {
    // The shape `POST /members` leaves whenever an admin creates a member with
    // `skipInvite` before an auth user exists, and the shape a bulk roster
    // import leaves behind: a real rung, no `user_id`.
    const { data, error } = await getSupabaseAdmin()
      .from('members')
      .insert({
        email: seededEmail,
        name: `${E2E_TAG} Unlinked Admin`,
        role: 'admin',
        status: 'active',
      })
      .select('id')
      .single()
    if (error || !data) {
      throw new Error(`could not seed the unlinked admin row: ${error?.message}`)
    }
    privilegedRowId = data.id

    // Signing up at the address is the whole precondition, and with Supabase
    // email confirmations off — the local default — it needs no mailbox.
    claimant = await signUpStranger(seededEmail)
  }, 60_000)

  afterAll(async () => {
    if (claimant) {
      await getSupabaseAdmin().auth.admin.deleteUser(claimant.id).catch(() => {})
    }
    await getSupabaseAdmin().from('members').delete().eq('email', seededEmail)
  })

  it('refuses the PUT that points the row at the caller', async () => {
    const res = await invokeFunction(membersHandler, {
      method: 'PUT',
      bearerToken: claimant.token,
      body: { id: privilegedRowId, user_id: claimant.id },
    })
    // eslint-disable-next-line no-console
    console.log(`[row claim] PUT /members -> ${res.statusCode}`)

    const { data } = await getSupabaseAdmin()
      .from('members')
      .select('user_id, role')
      .eq('id', privilegedRowId)
      .single()
    // eslint-disable-next-line no-console
    console.log(`[row claim] roster row -> ${JSON.stringify(data)}`)

    expect(res.statusCode).toBe(403)
    expect(data!.user_id).toBeNull()
  })

  it('so the admin tables still refuse them', async () => {
    const res = await invokeFunction(contactSubmissionsHandler, {
      method: 'GET',
      bearerToken: claimant.token,
    })
    // eslint-disable-next-line no-console
    console.log(`[row claim] GET /contact-submissions -> ${res.statusCode}`)
    expect(res.statusCode).toBe(403)
  })

  it('and an admin can still link the row by hand', async () => {
    const res = await invokeFunction(membersHandler, {
      method: 'PUT',
      bearerToken: realAdmin.accessToken,
      body: { id: privilegedRowId, user_id: claimant.id },
    })
    // eslint-disable-next-line no-console
    console.log(`[row claim] admin PUT /members -> ${res.statusCode}`)
    expect(res.statusCode).toBe(200)
    expect(res.body.user_id).toBe(claimant.id)
  })
})

describe('the linking a registration is supposed to do still works', () => {
  let registrant: Attacker
  let rowId: string
  const seededEmail = strangerEmail('unlinked-member')

  beforeAll(async () => {
    const { data, error } = await getSupabaseAdmin()
      .from('members')
      .insert({
        email: seededEmail,
        name: `${E2E_TAG} Unlinked Member`,
        role: 'member',
        status: 'active',
      })
      .select('id')
      .single()
    if (error || !data) {
      throw new Error(`could not seed the unlinked member row: ${error?.message}`)
    }
    rowId = data.id
    registrant = await signUpStranger(seededEmail)
  }, 60_000)

  afterAll(async () => {
    if (registrant) {
      await getSupabaseAdmin().auth.admin.deleteUser(registrant.id).catch(() => {})
    }
    await getSupabaseAdmin().from('members').delete().eq('email', seededEmail)
  })

  /**
   * `components/portal/MemberRegistration.tsx` looks the row up by email and
   * PUTs its own `user_id` onto it. The row is at the default rung with no
   * grants, so the claim hands out nothing the account could not have got by
   * registering a fresh row.
   */
  it('claims an unlinked row that grants nothing above the default', async () => {
    const res = await invokeFunction(membersHandler, {
      method: 'PUT',
      bearerToken: registrant.token,
      body: {
        id: rowId,
        user_id: registrant.id,
        phone: '555-0100',
        role: 'member',
        email: seededEmail,
        status: 'active',
      },
    })
    // eslint-disable-next-line no-console
    console.log(`[registration] PUT /members -> ${res.statusCode}`)
    expect(res.statusCode).toBe(200)
    expect(res.body.user_id).toBe(registrant.id)
    expect(res.body.phone).toBe('555-0100')
  })

  it('leaves them a plain member afterwards', async () => {
    const res = await invokeFunction(membersHandler, {
      method: 'GET',
      query: { user_id: registrant.id },
      bearerToken: registrant.token,
    })
    expect(res.statusCode).toBe(200)
    expect(res.body.role).toBe('member')
    expect(res.body.capabilities).toEqual([])

    const shut = await invokeFunction(contactSubmissionsHandler, {
      method: 'GET',
      bearerToken: registrant.token,
    })
    // eslint-disable-next-line no-console
    console.log(`[registration] GET /contact-submissions -> ${shut.statusCode}`)
    expect(shut.statusCode).toBe(403)
  })
})

describe('an admin creating and linking a member still works end to end', () => {
  const memberEmail = strangerEmail('admin-created')
  let createdId: string
  let account: Attacker

  afterAll(async () => {
    if (account) {
      await getSupabaseAdmin().auth.admin.deleteUser(account.id).catch(() => {})
    }
    await getSupabaseAdmin().from('members').delete().eq('email', memberEmail)
  })

  it('creates the member at a rung with a grant', async () => {
    const res = await invokeFunction(membersHandler, {
      method: 'POST',
      bearerToken: realAdmin.accessToken,
      body: {
        email: memberEmail,
        name: `${E2E_TAG} Admin Created`,
        role: 'executive',
        capabilities: ['evaluator'],
        skipInvite: true,
      },
    })
    // eslint-disable-next-line no-console
    console.log(`[admin create] POST /members -> ${res.statusCode}`)
    expect(res.statusCode).toBe(201)
    expect(res.body.role).toBe('executive')
    expect(res.body.capabilities).toEqual(['evaluator'])
    createdId = res.body.id
  })

  it('links it to the account once that account exists', async () => {
    account = await signUpStranger(memberEmail)

    const res = await invokeFunction(membersHandler, {
      method: 'PUT',
      bearerToken: realAdmin.accessToken,
      body: { id: createdId, user_id: account.id },
    })
    // eslint-disable-next-line no-console
    console.log(`[admin create] admin PUT /members -> ${res.statusCode}`)
    expect(res.statusCode).toBe(200)

    // The rung arrives with the link, on a token minted before it existed —
    // the principal comes off the roster on every request, not off the JWT.
    const reads = await invokeFunction(membersHandler, {
      method: 'GET',
      bearerToken: account.token,
    })
    // eslint-disable-next-line no-console
    console.log(`[admin create] linked executive GET /members -> ${reads.statusCode}`)
    expect(reads.statusCode).toBe(200)
    expect(Array.isArray(reads.body)).toBe(true)
  })
})
