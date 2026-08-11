/**
 * Integration tests for the accept-invite proxy.
 *
 * Flow: admin invites a member -> a row in `invite_tokens` (never expires) ->
 * the user clicks the email link, hits <site>/accept-invite?token=xxx ->
 * the page calls this function, which validates the token, generates a
 * fresh Supabase magic link, and atomically marks the token used.
 *
 * We seed `invite_tokens` rows directly via the admin Supabase client and
 * tag the email's local-part with `${E2E_TAG.toLowerCase()}-...@example.test`
 * so cleanupInviteTokensRows() / cleanupMembersRows() match them.
 */
import { randomBytes } from 'crypto'
import { handler } from '@/netlify/functions/accept-invite'
import { invokeFunction } from './helpers/invokeFunction'
import { E2E_TAG, getSupabaseAdmin } from './helpers/supabase'
import {
  cleanupInviteTokensRows,
  cleanupMembersRows,
} from './helpers/cleanup'

interface SeededInvite {
  tokenId: string
  token: string
  email: string
}

/** Build a tagged email address that matches both the invite_tokens
 *  cleanup pattern and the auth-user/members cleanup pattern. */
function tagEmail(suffix: string): string {
  return `${E2E_TAG.toLowerCase()}-${Date.now()}-${Math.floor(Math.random() * 1e6)}-${suffix}@example.test`
}

/** Fresh 64-char hex token, matching the production generator. */
function genToken(): string {
  return randomBytes(32).toString('hex')
}

async function seedInvite(opts: {
  email?: string
  used?: boolean
  withMember?: boolean
  memberStatus?: string
} = {}): Promise<SeededInvite> {
  const sb = getSupabaseAdmin()
  const email = (opts.email ?? tagEmail('invitee')).toLowerCase()
  const token = genToken()

  const { data, error } = await sb
    .from('invite_tokens')
    .insert({
      token,
      email,
      name: `${E2E_TAG} Invitee`,
      role: 'official',
      used_at: opts.used ? new Date().toISOString() : null,
    })
    .select('id')
    .single()
  if (error || !data) {
    throw new Error(`seedInvite failed: ${error?.message ?? 'unknown'}`)
  }

  if (opts.withMember !== false) {
    // members.email is unique — ignore the race where a previous test left a
    // matching row by upserting on email.
    const { error: memErr } = await sb.from('members').upsert(
      {
        email,
        name: `${E2E_TAG} Invitee`,
        role: 'official',
        status: opts.memberStatus ?? 'active',
      },
      { onConflict: 'email' }
    )
    if (memErr) {
      throw new Error(`seedInvite member upsert failed: ${memErr.message}`)
    }
  }

  return { tokenId: data.id as string, token, email }
}

async function fetchToken(tokenId: string) {
  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from('invite_tokens')
    .select('id, used_at, email')
    .eq('id', tokenId)
    .single()
  if (error) throw new Error(`fetchToken failed: ${error.message}`)
  return data
}

describe('accept-invite', () => {
  beforeAll(async () => {
    // Sweep orphans from any previous failed run.
    await cleanupInviteTokensRows()
    await cleanupMembersRows()
  }, 30_000)

  afterAll(async () => {
    // Handler may create auth users via generateLink. Clean those up too.
    const sb = getSupabaseAdmin()
    const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 })
    const stale = (data?.users ?? []).filter((u) =>
      u.email?.toLowerCase().endsWith('@example.test') &&
      u.email?.toLowerCase().startsWith(`${E2E_TAG.toLowerCase()}-`)
    )
    for (const u of stale) {
      await sb.auth.admin.deleteUser(u.id).catch(() => {})
    }
    await cleanupInviteTokensRows()
    await cleanupMembersRows()
  })

  describe('input validation', () => {
    it('returns 400 when no token is provided in body or query', async () => {
      const res = await invokeFunction(handler, { method: 'POST', body: {} })
      expect(res.statusCode).toBe(400)
      expect(res.body.message ?? res.body.error).toMatch(/invite token/i)
    })

    it('returns 400 when GET has no query token', async () => {
      const res = await invokeFunction(handler, { method: 'GET' })
      expect(res.statusCode).toBe(400)
      expect(res.body.message ?? res.body.error).toMatch(/invite token/i)
    })

    it('returns 200 for OPTIONS preflight', async () => {
      const res = await invokeFunction(handler, { method: 'OPTIONS' })
      expect(res.statusCode).toBe(200)
    })
  })

  describe('invalid tokens', () => {
    it('returns 404 for a token that does not exist', async () => {
      const res = await invokeFunction(handler, {
        method: 'POST',
        body: { token: genToken() },
      })
      expect(res.statusCode).toBe(404)
      expect(res.body.message ?? res.body.error).toMatch(/(invite|invalid|not valid)/i)
    })

    it('returns 404 for a non-existent token via GET query', async () => {
      const res = await invokeFunction(handler, {
        method: 'GET',
        query: { token: genToken() },
      })
      expect(res.statusCode).toBe(404)
    })
  })

  describe('already used / consumed tokens', () => {
    it('returns 400 when the token has already been redeemed', async () => {
      const invite = await seedInvite({ used: true })
      const res = await invokeFunction(handler, {
        method: 'POST',
        body: { token: invite.token },
      })
      expect(res.statusCode).toBe(400)
      expect(res.body.alreadyUsed).toBe(true)
      expect(res.body.message ?? res.body.error).toMatch(/already/i)
    })

    it('refuses to redeem the same token twice (state transition is durable)', async () => {
      const invite = await seedInvite()

      // First redemption succeeds.
      const first = await invokeFunction(handler, {
        method: 'POST',
        body: { token: invite.token },
      })
      expect(first.statusCode).toBe(200)

      // The token row should now be marked used.
      const after = await fetchToken(invite.tokenId)
      expect(after.used_at).toBeTruthy()

      // Second redemption is rejected.
      const second = await invokeFunction(handler, {
        method: 'POST',
        body: { token: invite.token },
      })
      expect(second.statusCode).toBe(400)
      expect(second.body.alreadyUsed).toBe(true)
    })
  })

  describe('member-row gating', () => {
    it('returns 404 when no matching member row exists for the invite email', async () => {
      const invite = await seedInvite({ withMember: false })
      const res = await invokeFunction(handler, {
        method: 'POST',
        body: { token: invite.token },
      })
      expect(res.statusCode).toBe(404)
      // Response body is intentionally identical to the "token not found"
      // branch — see the information-disclosure test below.
      expect(res.body.message ?? res.body.error).toMatch(/(invite|invalid|not valid)/i)
    })

    it('returns 403 when the member exists but is inactive', async () => {
      const invite = await seedInvite({ memberStatus: 'inactive' })
      const res = await invokeFunction(handler, {
        method: 'POST',
        body: { token: invite.token },
      })
      expect(res.statusCode).toBe(403)
      expect(res.body.message ?? res.body.error).toMatch(/(inactive|not.*active)/i)
    })
  })

  describe('happy path', () => {
    it('redeems a valid unused token and returns a redirect URL (POST body)', async () => {
      const invite = await seedInvite()
      const res = await invokeFunction(handler, {
        method: 'POST',
        body: { token: invite.token },
      })
      expect(res.statusCode).toBe(200)
      expect(res.body.success).toBe(true)
      expect(typeof res.body.redirectUrl).toBe('string')
      // generateLink returns an action_link pointing at the Supabase auth
      // verify endpoint. Don't pin host — just sanity-check it's a URL.
      expect(res.body.redirectUrl).toMatch(/^https?:\/\//)
    })

    it('also redeems a valid token via GET query (parity with POST)', async () => {
      const invite = await seedInvite()
      const res = await invokeFunction(handler, {
        method: 'GET',
        query: { token: invite.token },
      })
      expect(res.statusCode).toBe(200)
      expect(res.body.success).toBe(true)
      expect(typeof res.body.redirectUrl).toBe('string')

      const after = await fetchToken(invite.tokenId)
      expect(after.used_at).toBeTruthy()
    })

    it('marks the token used and links the auth user back to the member', async () => {
      const invite = await seedInvite()
      const res = await invokeFunction(handler, {
        method: 'POST',
        body: { token: invite.token },
      })
      expect(res.statusCode).toBe(200)

      const after = await fetchToken(invite.tokenId)
      expect(after.used_at).toBeTruthy()

      // The handler updates members.user_id with the freshly created auth
      // user's id. Verify that linkage landed.
      const sb = getSupabaseAdmin()
      const { data: member } = await sb
        .from('members')
        .select('user_id, email')
        .eq('email', invite.email)
        .single()
      expect(member?.user_id).toBeTruthy()
    })
  })

  describe('concurrency', () => {
    it('atomic claim: two simultaneous redemptions yield exactly one success', async () => {
      const invite = await seedInvite()
      const [a, b] = await Promise.all([
        invokeFunction(handler, { method: 'POST', body: { token: invite.token } }),
        invokeFunction(handler, { method: 'POST', body: { token: invite.token } }),
      ])
      const successes = [a, b].filter((r) => r.statusCode === 200)
      const rejections = [a, b].filter((r) => r.statusCode === 400)
      expect(successes.length).toBe(1)
      expect(rejections.length).toBe(1)
      expect(rejections[0].body.alreadyUsed).toBe(true)
    })
  })

  describe('information disclosure', () => {
    // The "token does not exist" and "token exists but member row missing"
    // branches both return an identical 404 body so a caller holding a
    // list of candidate tokens cannot distinguish the two cases and
    // confirm which tokens are real. See the design note at the top of
    // accept-invite.ts.
    it(
      'does not leak whether a token exists via different error messages',
      async () => {
        const garbage = await invokeFunction(handler, {
          method: 'POST',
          body: { token: genToken() },
        })
        const realButNoMember = await seedInvite({ withMember: false })
        const seededRes = await invokeFunction(handler, {
          method: 'POST',
          body: { token: realButNoMember.token },
        })
        // Both invalid-input outcomes should look identical to a caller.
        expect(seededRes.statusCode).toBe(garbage.statusCode)
        expect(seededRes.body.error).toBe(garbage.body.error)
        expect(seededRes.body.message).toBe(garbage.body.message)
      }
    )
  })

  describe('expiration semantics', () => {
    // FIXED: invite_tokens.expires_at landed via migration. accept-invite
    // now refuses any token whose expires_at is in the past, returning
    // the same generic 404 body as the not-found / bad-token branches
    // to preserve the existence-oracle protection.
    it(
      'should reject tokens whose expires_at is in the past',
      async () => {
        const sb = getSupabaseAdmin()
        const email = tagEmail('stale')
        const token = genToken()
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

        const { data } = await sb
          .from('invite_tokens')
          .insert({
            token,
            email,
            name: `${E2E_TAG} Stale`,
            role: 'official',
            used_at: null,
            expires_at: yesterday,
          })
          .select('id')
          .single()
        await sb.from('members').upsert(
          {
            email,
            name: `${E2E_TAG} Stale`,
            role: 'official',
            status: 'active',
          },
          { onConflict: 'email' }
        )

        const res = await invokeFunction(handler, {
          method: 'POST',
          body: { token },
        })
        void data
        expect(res.statusCode).toBe(404)
      }
    )
  })
})
