/**
 * Storage RLS integration tests.
 *
 * Subject: `supabase/migrations/20260810001400_storage_policies.sql`, which
 * creates the five buckets and their `storage.objects` policies. Read the
 * comment at the top of that file first — it is where the access model is
 * written down, and these tests exist to keep the file and the database
 * saying the same thing.
 *
 * The posture under test:
 *
 *   email-images        public bucket. Bytes readable by URL with no session;
 *                       admin/executive write; nobody anonymous may enumerate.
 *   portal-resources    private. Any member reads and writes; only the
 *                       uploader (or admin/executive) changes or removes.
 *   newsletters         private. Any member reads, admin/executive writes.
 *   training-materials  private. Any member reads, admin/executive writes.
 *   evaluations         private. Uploader or admin/executive reads; any
 *                       member may upload. 0016 adds a third way in — whoever
 *                       can read the `evaluations` row that points at the
 *                       object — which needs a row to exist and so does not
 *                       show up here. Every object in this file is a bare
 *                       upload with no row behind it, which makes these the
 *                       tests for the floor 0016 leaves untouched. The widened
 *                       case is in signed-downloads.test.ts.
 *
 * These run against the browser path — a client holding the anon key and a
 * user JWT — because that is the only path these policies govern.
 * `netlify/functions/upload-file.ts` holds the service-role key and bypasses
 * RLS entirely; its own role gate is covered in upload-file.test.ts.
 *
 * The users come from `helpers/auth.ts` unmodified. `createTestUser` puts each
 * one on the roster at the rung its name asks for, which is what these policies
 * read: `is_admin_or_executive()` answers from `members.role`. This file used
 * to seed that row itself, because the helper stamped `app_metadata.role` and
 * the function layer read the metadata while the policies read the roster —
 * two sources for one question. There is one now.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { E2E_TAG, getSupabaseAdmin } from './helpers/supabase'
import {
  cleanupOrphanedTestUsers,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from './helpers/auth'

const BUCKETS = [
  'email-images',
  'portal-resources',
  'newsletters',
  'training-materials',
  'evaluations',
] as const

let adminUser: TestUser
let m1: TestUser
let m2: TestUser
let adminC: SupabaseClient
let m1C: SupabaseClient
let m2C: SupabaseClient
let anonC: SupabaseClient

/** Every object any test writes, so teardown can remove it as service role. */
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

/** Write an object as the service role, bypassing the policies under test. */
async function seed(bucket: string, path: string): Promise<void> {
  const sb = getSupabaseAdmin()
  const { error } = await sb.storage
    .from(bucket)
    .upload(path, Buffer.from(`seed ${bucket}/${path}`), { contentType: 'text/plain' })
  if (error) throw new Error(`seed ${bucket}/${path} failed: ${error.message}`)
  written.push({ bucket, path })
}

/** Does the object still exist, asked as the service role? */
async function existsAsAdmin(bucket: string, path: string): Promise<boolean> {
  const sb = getSupabaseAdmin()
  const { data, error } = await sb.storage.from(bucket).list('', { limit: 100, search: path })
  if (error) return false
  return (data ?? []).some((o) => o.name === path)
}

async function upload(c: SupabaseClient, bucket: string, path: string) {
  const res = await c.storage
    .from(bucket)
    .upload(path, new Blob([`payload ${bucket}/${path}`], { type: 'text/plain' }))
  if (!res.error) written.push({ bucket, path })
  return res
}

beforeAll(async () => {
  await cleanupOrphanedTestUsers()
  ;[adminUser, m1, m2] = await Promise.all([
    createTestUser('admin'),
    createTestUser('official'),
    createTestUser('official'),
  ])
  await linkMemberRow(adminUser, 'admin')
  // `member`, not `official`: 0015 closed members.role to the three structural
  // rungs and `official` is its retired spelling, so the insert is rejected by
  // members_role_structural_check. `createTestUser('official')` above still
  // reads fine — the helper resolves that name through toPrincipal() — but the
  // column takes the rung it resolves to.
  await linkMemberRow(m1, 'member')
  await linkMemberRow(m2, 'member')
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
  await Promise.all(
    [adminUser, m1, m2].filter(Boolean).map((u) => deleteTestUser(u))
  )
}, 60_000)

describe('buckets exist with the posture the migration documents', () => {
  it('creates all five, with email-images the only public one', async () => {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.storage.listBuckets()
    expect(error).toBeNull()
    const found = new Map((data ?? []).map((b) => [b.name, b]))
    for (const name of BUCKETS) {
      expect(found.has(name)).toBe(true)
    }
    expect(found.get('email-images')!.public).toBe(true)
    for (const name of BUCKETS.filter((b) => b !== 'email-images')) {
      expect(found.get(name)!.public).toBe(false)
    }
  })
})

describe('anonymous callers', () => {
  it('cannot list any bucket, public one included', async () => {
    for (const bucket of BUCKETS) {
      const { data } = await anonC.storage.from(bucket).list('', { limit: 100 })
      expect(data ?? []).toEqual([])
    }
  })

  it('cannot download from a private bucket by public URL', async () => {
    const path = key('anon-read.txt')
    await seed('portal-resources', path)
    const { data } = anonC.storage.from('portal-resources').getPublicUrl(path)
    const res = await fetch(data.publicUrl)
    expect(res.ok).toBe(false)
  })

  it('cannot download from a private bucket over the authenticated route', async () => {
    const path = key('anon-auth-read.txt')
    await seed('evaluations', path)
    const { data, error } = await anonC.storage.from('evaluations').download(path)
    expect(data).toBeNull()
    expect(error).not.toBeNull()
  })

  it('can fetch bytes from the public bucket by URL', async () => {
    const path = key('banner.txt')
    await seed('email-images', path)
    const { data } = anonC.storage.from('email-images').getPublicUrl(path)
    const res = await fetch(data.publicUrl)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('seed email-images')
  })

  it('cannot upload anywhere', async () => {
    for (const bucket of BUCKETS) {
      const { error } = await upload(anonC, bucket, key('anon-write.txt'))
      expect(error).not.toBeNull()
    }
  })
})

describe('a plain member', () => {
  it('reaches their own evaluations object and not another member’s', async () => {
    const mine = key('m1-eval.txt')
    const theirs = key('m2-eval.txt')
    expect((await upload(m1C, 'evaluations', mine)).error).toBeNull()
    expect((await upload(m2C, 'evaluations', theirs)).error).toBeNull()

    const { data: dl } = await m1C.storage.from('evaluations').download(mine)
    expect(dl).not.toBeNull()

    const { data: cross, error: crossErr } = await m1C.storage
      .from('evaluations')
      .download(theirs)
    expect(cross).toBeNull()
    expect(crossErr).not.toBeNull()

    const { data: listed } = await m1C.storage
      .from('evaluations')
      .list('', { limit: 100 })
    const names = (listed ?? []).map((o) => o.name)
    expect(names).toContain(mine)
    expect(names).not.toContain(theirs)
  })

  it('cannot delete another member’s object', async () => {
    const theirs = key('m2-doc.txt')
    expect((await upload(m2C, 'portal-resources', theirs)).error).toBeNull()
    await m1C.storage.from('portal-resources').remove([theirs])
    expect(await existsAsAdmin('portal-resources', theirs)).toBe(true)
  })

  it('can delete their own object', async () => {
    const mine = key('m1-doc.txt')
    expect((await upload(m1C, 'portal-resources', mine)).error).toBeNull()
    await m1C.storage.from('portal-resources').remove([mine])
    expect(await existsAsAdmin('portal-resources', mine)).toBe(false)
  })

  it('reads the shared shelf and the member-only publications', async () => {
    const shelf = key('shelf.txt')
    const news = key('nov.txt')
    const clinic = key('clinic.txt')
    await seed('portal-resources', shelf)
    await seed('newsletters', news)
    await seed('training-materials', clinic)

    expect((await m2C.storage.from('portal-resources').download(shelf)).data).not.toBeNull()
    expect((await m1C.storage.from('newsletters').download(news)).data).not.toBeNull()
    expect((await m1C.storage.from('training-materials').download(clinic)).data).not.toBeNull()
  })

  it('cannot write to the privileged buckets', async () => {
    for (const bucket of ['newsletters', 'training-materials', 'email-images']) {
      const { error } = await upload(m1C, bucket, key('sneaky.txt'))
      expect(error).not.toBeNull()
    }
  })

  it('cannot delete from the privileged buckets', async () => {
    const path = key('protected.txt')
    await seed('newsletters', path)
    await m1C.storage.from('newsletters').remove([path])
    expect(await existsAsAdmin('newsletters', path)).toBe(true)
  })
})

describe('an admin', () => {
  it('writes every privileged bucket', async () => {
    for (const bucket of ['newsletters', 'training-materials', 'email-images']) {
      const { error } = await upload(adminC, bucket, key('admin-write.txt'))
      expect(error).toBeNull()
    }
  })

  it('reads and removes a member’s evaluation file', async () => {
    const theirs = key('m1-eval-admin.txt')
    expect((await upload(m1C, 'evaluations', theirs)).error).toBeNull()

    const { data: dl } = await adminC.storage.from('evaluations').download(theirs)
    expect(dl).not.toBeNull()

    const { data: listed } = await adminC.storage
      .from('evaluations')
      .list('', { limit: 100 })
    expect((listed ?? []).map((o) => o.name)).toContain(theirs)

    await adminC.storage.from('evaluations').remove([theirs])
    expect(await existsAsAdmin('evaluations', theirs)).toBe(false)
  })

  it('removes a member’s object from the shared shelf', async () => {
    const theirs = key('m2-shelf.txt')
    expect((await upload(m2C, 'portal-resources', theirs)).error).toBeNull()
    await adminC.storage.from('portal-resources').remove([theirs])
    expect(await existsAsAdmin('portal-resources', theirs)).toBe(false)
  })

  it('still cannot enumerate the bucket list from the browser', async () => {
    const { data } = await adminC.storage.listBuckets()
    expect(data ?? []).toEqual([])
  })
})
