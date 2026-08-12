/**
 * Downloads from the private buckets, end to end.
 *
 * Subject: `lib/fileDownload.ts` — the code that turns the reference a row
 * stores into a URL a browser can fetch. `storage-policies.test.ts` already
 * proves the policies in `20260810001400_storage_policies.sql` say the right
 * things; this file proves the application asks them the right question, and
 * that what comes back actually serves bytes.
 *
 * Every mint here goes through the shipped `resolveFileUrl()` with a real
 * member's JWT, and every assertion about a link is made by fetching it. A
 * signed URL that parses but 400s would pass a mock and fail a member.
 *
 * Deliberately no `cleanupOrphanedTestUsers()` in `beforeAll`: that sweep
 * deletes every `E2E-TEST-…` user in the project, including ones another suite
 * is mid-way through using. This suite removes exactly what it created.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { E2E_TAG, getSupabaseAdmin } from './helpers/supabase'
import { createTestUser, deleteTestUser, type TestUser } from './helpers/auth'
import {
  SIGNED_URL_TTL_SECONDS,
  clearSignedUrlCache,
  resolveFileUrl,
} from '@/lib/fileDownload'
import { toStorageRef } from '@/lib/storageRefs'

let adminUser: TestUser
let m1: TestUser
let m2: TestUser
let m1C: SupabaseClient
let m2C: SupabaseClient
let adminC: SupabaseClient
let anonC: SupabaseClient

/** Every object this suite writes, so teardown can remove it as service role. */
const written: { bucket: string; path: string }[] = []

function key(name: string): string {
  return `${E2E_TAG}-${Date.now()}-${Math.floor(Math.random() * 1e6)}-${name}`
}

function clientFor(token?: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
  })
}

/**
 * `is_admin_or_executive()` answers from `public.members.role`, not the JWT,
 * and `createTestUser` only sets the JWT — so the row has to exist or the user
 * is a plain caller no matter what its token says. `structuralRole` is what
 * goes in the column; the flat names the helper accepts (`official`) are the
 * retired spelling and the check constraint rejects them.
 */
async function linkMemberRow(user: TestUser): Promise<void> {
  const sb = getSupabaseAdmin()
  const { error } = await sb.from('members').insert({
    user_id: user.id,
    email: user.email,
    name: `E2E ${user.role}`,
    role: user.structuralRole,
  })
  if (error) throw new Error(`linkMemberRow failed for ${user.role}: ${error.message}`)
}

/** Put known bytes in a bucket as the service role, bypassing the policies. */
async function seed(bucket: string, path: string, body: string): Promise<void> {
  const sb = getSupabaseAdmin()
  const { error } = await sb.storage
    .from(bucket)
    .upload(path, Buffer.from(body), { contentType: 'text/plain' })
  if (error) throw new Error(`seed ${bucket}/${path} failed: ${error.message}`)
  written.push({ bucket, path })
}

/** Upload as a member, through the policies, the way the portal does. */
async function uploadAs(c: SupabaseClient, bucket: string, path: string, body: string) {
  const res = await c.storage
    .from(bucket)
    .upload(path, new Blob([body], { type: 'text/plain' }))
  if (!res.error) written.push({ bucket, path })
  return res
}

/** Read the storage token's own claims — the source of truth on expiry. */
function tokenClaims(signedUrl: string): { exp: number; iat: number } {
  const token = new URL(signedUrl).searchParams.get('token')
  if (!token) throw new Error(`no token in ${signedUrl}`)
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'))
  return payload
}

beforeAll(async () => {
  ;[adminUser, m1, m2] = await Promise.all([
    createTestUser('admin'),
    createTestUser('official'),
    createTestUser('official'),
  ])
  await linkMemberRow(adminUser)
  await linkMemberRow(m1)
  await linkMemberRow(m2)
  adminC = clientFor(adminUser.accessToken)
  m1C = clientFor(m1.accessToken)
  m2C = clientFor(m2.accessToken)
  anonC = clientFor()
}, 60_000)

afterAll(async () => {
  const sb = getSupabaseAdmin()
  const byBucket = new Map<string, string[]>()
  for (const w of written) {
    byBucket.set(w.bucket, [...(byBucket.get(w.bucket) ?? []), w.path])
  }
  for (const [bucket, paths] of byBucket) {
    await sb.storage.from(bucket).remove(paths).catch(() => {})
  }
  await sb
    .from('members')
    .delete()
    .in('user_id', [adminUser, m1, m2].filter(Boolean).map((u) => u.id))
  await Promise.all([adminUser, m1, m2].filter(Boolean).map((u) => deleteTestUser(u)))
}, 60_000)

beforeEach(() => {
  // Each test mints for itself; a link cached under another member's session
  // would make the negative cases lie.
  clearSignedUrlCache()
})

describe('a member who is allowed to read the object', () => {
  it('gets a link that serves the bytes', async () => {
    const path = key('shelf.txt')
    const body = 'the shared shelf'
    await seed('portal-resources', path, body)

    const url = await resolveFileUrl(toStorageRef('portal-resources', path), { client: m1C })

    expect(url).toContain('/storage/v1/object/sign/portal-resources/')
    const res = await fetch(url)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe(body)
  })

  it('gets one for a newsletter the same way', async () => {
    const path = key('march.txt')
    await seed('newsletters', path, 'newsletter bytes')

    const url = await resolveFileUrl(toStorageRef('newsletters', path), { client: m1C })
    const res = await fetch(url)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('newsletter bytes')
  })

  it('gets one for their own evaluation attachment', async () => {
    const path = key('own-eval.txt')
    expect((await uploadAs(m1C, 'evaluations', path, 'my evaluation')).error).toBeNull()

    const url = await resolveFileUrl(toStorageRef('evaluations', path), { client: m1C })
    const res = await fetch(url)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('my evaluation')
  })

  it('asking to download names the saved file rather than displaying it', async () => {
    const path = key('rulebook.txt')
    await seed('portal-resources', path, 'rulebook bytes')

    const url = await resolveFileUrl(toStorageRef('portal-resources', path), {
      client: m1C,
      download: 'Rulebook 2026.txt',
    })
    const res = await fetch(url)
    expect(res.status).toBe(200)
    // Storage percent-encodes the name in both filename parameters.
    expect(res.headers.get('content-disposition')).toContain('attachment')
    expect(res.headers.get('content-disposition')).toContain('Rulebook%202026.txt')
  })

  it('resolves a row still holding the old public URL, without a data migration', async () => {
    const path = key('legacy.txt')
    await seed('portal-resources', path, 'written before signed downloads')

    // Exactly what `getPublicUrl()` wrote into `resources.file_url` before
    // this change — and what returns 400 if you fetch it directly.
    const { data: legacy } = m1C.storage.from('portal-resources').getPublicUrl(path)
    expect((await fetch(legacy.publicUrl)).ok).toBe(false)

    const url = await resolveFileUrl(legacy.publicUrl, { client: m1C })
    expect(url).toContain('/storage/v1/object/sign/portal-resources/')
    const res = await fetch(url)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('written before signed downloads')
  })
})

describe('a member who is not allowed to read the object', () => {
  it('cannot mint a link to another member’s evaluation', async () => {
    const path = key('their-eval.txt')
    expect((await uploadAs(m2C, 'evaluations', path, 'not for m1')).error).toBeNull()

    await expect(
      resolveFileUrl(toStorageRef('evaluations', path), { client: m1C })
    ).rejects.toThrow(/couldn’t open that file/)

    // The owner and an admin still can — the refusal is the policy, not a bug.
    expect((await resolveFileUrl(toStorageRef('evaluations', path), { client: m2C }))).toContain(
      '/object/sign/evaluations/'
    )
    clearSignedUrlCache()
    expect((await resolveFileUrl(toStorageRef('evaluations', path), { client: adminC }))).toContain(
      '/object/sign/evaluations/'
    )
  })

  it('cannot mint a link with no session at all', async () => {
    const path = key('anon.txt')
    await seed('portal-resources', path, 'members only')

    await expect(
      resolveFileUrl(toStorageRef('portal-resources', path), { client: anonC })
    ).rejects.toThrow(/couldn’t open that file/)
  })
})

describe('email-images', () => {
  it('stays an unsigned public link that anyone holding it can fetch', async () => {
    const path = key('banner.txt')
    await seed('email-images', path, 'header image bytes')

    const url = await resolveFileUrl(toStorageRef('email-images', path), { client: m1C })

    expect(url).toContain('/storage/v1/object/public/email-images/')
    expect(url).not.toContain('token=')

    // No session, no anon key, the way a recipient's mail client arrives.
    const res = await fetch(url)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('header image bytes')
  })

  it('leaves a URL already sitting in a sent email exactly as it is', async () => {
    const path = key('sent.txt')
    await seed('email-images', path, 'already mailed')
    const { data } = m1C.storage.from('email-images').getPublicUrl(path)

    expect(await resolveFileUrl(data.publicUrl, { client: m1C })).toBe(data.publicUrl)
  })
})

describe('expiry', () => {
  it('is the five minutes the module documents, read off the token itself', async () => {
    const path = key('ttl.txt')
    await seed('portal-resources', path, 'ttl check')

    const url = await resolveFileUrl(toStorageRef('portal-resources', path), { client: m1C })
    const { exp, iat } = tokenClaims(url)

    expect(SIGNED_URL_TTL_SECONDS).toBe(300)
    expect(exp - iat).toBe(SIGNED_URL_TTL_SECONDS)
  })

  it('honours a shorter lifetime, and the link is dead once it passes', async () => {
    const path = key('short.txt')
    await seed('portal-resources', path, 'expires immediately')

    const url = await resolveFileUrl(toStorageRef('portal-resources', path), {
      client: m1C,
      ttlSeconds: 1,
    })
    expect((await fetch(url)).status).toBe(200)

    await new Promise((r) => setTimeout(r, 2000))
    expect((await fetch(url)).ok).toBe(false)
  })
})

describe('the memo', () => {
  it('reuses a live link instead of minting a second one', async () => {
    const path = key('memo.txt')
    await seed('portal-resources', path, 'memo')
    const ref = toStorageRef('portal-resources', path)

    const first = await resolveFileUrl(ref, { client: m1C })
    const second = await resolveFileUrl(ref, { client: m1C })
    expect(second).toBe(first)

    // A download link is a different URL for the same object, so it does not
    // come out of the same slot.
    const attachment = await resolveFileUrl(ref, { client: m1C, download: true })
    expect(attachment).not.toBe(first)
  })
})
