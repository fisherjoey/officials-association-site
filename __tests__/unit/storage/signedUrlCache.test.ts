/**
 * Who the memo in `lib/fileDownload.ts` belongs to.
 *
 * A signed URL is a bearer token minted for one member, and the single-page app
 * outlives members: `logout()` in `contexts/AuthContext.tsx` signs out with no
 * reload and no navigation, so the page, the browser-client singleton and this
 * module's `Map` all survive into whoever signs in next. On a shared rink or
 * office machine that is two people and one tab.
 *
 * The key used to be `bucket/path|disposition|ttl` — every part of which the
 * second member's click matches exactly — and `resolveFileUrl()` consulted it
 * before it looked at the client at all. So the second member hit the first
 * member's slot and was handed a live link to a file the storage policy refuses
 * them, without a request ever reaching Supabase to be refused.
 *
 * These tests count mints, which is the only thing that separates a cache hit
 * from a fresh round trip. It cannot be done by comparing URLs: a real storage
 * token signs `{url, scope, iat, exp}` and names nobody, so two members signing
 * the same object in the same second get the same string either way. That the
 * refusal is real against live policies is proved in
 * `__tests__/integration/signed-downloads.test.ts`; what is proved here is that
 * the question reaches storage at all.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { clearSignedUrlCache, resolveFileUrl } from '@/lib/fileDownload'

const REF = 'storage://evaluations/1730000000000-report.pdf'

interface FakeClient {
  client: SupabaseClient
  /** How many times this client has actually asked storage to sign something. */
  mints: () => number
  /** Change who the client's session says is signed in. `null` for nobody. */
  signIn: (userId: string | null) => void
}

/**
 * A Supabase client the size of what `resolveFileUrl` touches: a session, and
 * a bucket that signs. `createSignedUrl` stamps each answer with a counter so a
 * memoised URL is distinguishable from a freshly minted one.
 */
function fakeClient(userId: string | null = null): FakeClient {
  let current = userId
  let mints = 0

  const client = {
    auth: {
      getSession: async () => ({
        data: { session: current ? { user: { id: current } } : null },
        error: null,
      }),
    },
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string) => {
          mints += 1
          return {
            data: { signedUrl: `https://stack.test/sign/${bucket}/${path}?token=${mints}` },
            error: null,
          }
        },
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://stack.test/public/${bucket}/${path}` },
        }),
      }),
    },
  } as unknown as SupabaseClient

  return {
    client,
    mints: () => mints,
    signIn: (next: string | null) => {
      current = next
    },
  }
}

beforeEach(() => {
  clearSignedUrlCache()
})

describe('one member, one tab', () => {
  it('mints once and reuses the link', async () => {
    const tab = fakeClient('member-a')

    const first = await resolveFileUrl(REF, { client: tab.client })
    const second = await resolveFileUrl(REF, { client: tab.client })

    expect(second).toBe(first)
    expect(tab.mints()).toBe(1)
  })

  it('still keeps a download link and a preview link apart', async () => {
    const tab = fakeClient('member-a')

    const preview = await resolveFileUrl(REF, { client: tab.client })
    const download = await resolveFileUrl(REF, { client: tab.client, download: true })

    expect(download).not.toBe(preview)
    expect(tab.mints()).toBe(2)
  })
})

describe('a second member signing in on the same tab', () => {
  it('does not get the link the first member minted', async () => {
    const tab = fakeClient('member-a')

    const forA = await resolveFileUrl(REF, { client: tab.client, download: 'report.pdf' })
    expect(tab.mints()).toBe(1)

    // Sign-out then sign-in, with nothing else torn down — no reload, same
    // client object, same module-level cache.
    tab.signIn(null)
    tab.signIn('member-b')

    const forB = await resolveFileUrl(REF, { client: tab.client, download: 'report.pdf' })

    // The request reached storage, which is where a refusal can happen.
    expect(tab.mints()).toBe(2)
    expect(forB).not.toBe(forA)
  })

  it('does not get it while signed out either', async () => {
    const tab = fakeClient('member-a')

    await resolveFileUrl(REF, { client: tab.client })
    tab.signIn(null)
    await resolveFileUrl(REF, { client: tab.client })

    expect(tab.mints()).toBe(2)
  })

  it('serves the first member their own link again when they come back', async () => {
    const tab = fakeClient('member-a')

    const first = await resolveFileUrl(REF, { client: tab.client })
    tab.signIn('member-b')
    await resolveFileUrl(REF, { client: tab.client })
    tab.signIn('member-a')
    const again = await resolveFileUrl(REF, { client: tab.client })

    // Scoped to an identity, not poisoned by a stranger: two mints, not three.
    expect(again).toBe(first)
    expect(tab.mints()).toBe(2)
  })
})

describe('two callers holding different tokens on sessionless clients', () => {
  // The shape the integration suite drives five members with, and the shape a
  // server-side caller would have: `createClient(..., { global: { headers } })`
  // keeps no session, so `getSession()` truthfully answers "none" for both.
  it('do not share a slot', async () => {
    const one = fakeClient(null)
    const two = fakeClient(null)

    await resolveFileUrl(REF, { client: one.client })
    await resolveFileUrl(REF, { client: two.client })

    expect(one.mints()).toBe(1)
    expect(two.mints()).toBe(1)
  })
})

describe('a client that cannot answer who is signed in', () => {
  it('still resolves, and does not share a slot with a client that can', async () => {
    // The unconfigured stub from lib/api/client throws on every property
    // access. Reading the session must not turn that into a crash before the
    // mint has had its chance to report the real problem.
    const throwing = {
      auth: {
        get getSession(): never {
          throw new Error('Supabase is not configured')
        },
      },
      storage: {
        from: (bucket: string) => ({
          createSignedUrl: async (path: string) => ({
            data: { signedUrl: `https://stack.test/sign/${bucket}/${path}?token=stub` },
            error: null,
          }),
        }),
      },
    } as unknown as SupabaseClient

    await expect(resolveFileUrl(REF, { client: throwing })).resolves.toContain('token=stub')

    const tab = fakeClient('member-a')
    expect(await resolveFileUrl(REF, { client: tab.client })).toContain('token=1')
  })
})

describe('clearing the cache', () => {
  it('drops every memoised link', async () => {
    const tab = fakeClient('member-a')

    await resolveFileUrl(REF, { client: tab.client })
    clearSignedUrlCache()
    await resolveFileUrl(REF, { client: tab.client })

    expect(tab.mints()).toBe(2)
  })
})

describe('the public bucket', () => {
  it('never reaches the memo, because it is never signed', async () => {
    const tab = fakeClient('member-a')

    const url = await resolveFileUrl('storage://email-images/banner.png', { client: tab.client })

    expect(url).toBe('https://stack.test/public/email-images/banner.png')
    expect(tab.mints()).toBe(0)
  })
})
