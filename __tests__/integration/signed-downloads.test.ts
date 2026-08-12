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
import { canViewAllEvaluations, toPrincipal } from '@/lib/roles'

let adminUser: TestUser
let m1: TestUser
let m2: TestUser
/** Writes the report. Two of them, because the gap is between evaluators. */
let ev1: TestUser
let ev2: TestUser
let m1C: SupabaseClient
let m2C: SupabaseClient
let ev1C: SupabaseClient
let ev2C: SupabaseClient
let adminC: SupabaseClient
let anonC: SupabaseClient

/** `members.id` for each user, needed to write an `evaluations` row. */
const memberIds = new Map<string, string>()

/** Every object this suite writes, so teardown can remove it as service role. */
const written: { bucket: string; path: string }[] = []
/** Every `evaluations` row this suite writes. */
const evaluationIds: string[] = []

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
  const { data, error } = await sb
    .from('members')
    .insert({
      user_id: user.id,
      email: user.email,
      name: `E2E ${user.role}`,
      role: user.structuralRole,
      // `has_capability()` reads this column, not the JWT, for the same reason
      // `is_admin_or_executive()` reads `role` — a policy cannot see a token.
      capabilities: user.capabilities,
    })
    .select('id')
    .single()
  if (error) throw new Error(`linkMemberRow failed for ${user.role}: ${error.message}`)
  memberIds.set(user.id, data.id)
}

/** Write the row the portal renders a download button on, as service role. */
async function seedEvaluation(subject: TestUser, evaluator: TestUser, ref: string, fileName: string) {
  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from('evaluations')
    .insert({
      member_id: memberIds.get(subject.id),
      evaluator_id: memberIds.get(evaluator.id),
      file_url: ref,
      file_name: fileName,
    })
    .select('id')
    .single()
  if (error) throw new Error(`seedEvaluation failed: ${error.message}`)
  evaluationIds.push(data.id)
  return data.id as string
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
  ;[adminUser, m1, m2, ev1, ev2] = await Promise.all([
    createTestUser('admin'),
    createTestUser('official'),
    createTestUser('official'),
    createTestUser('evaluator'),
    createTestUser('evaluator'),
  ])
  await linkMemberRow(adminUser)
  await linkMemberRow(m1)
  await linkMemberRow(m2)
  await linkMemberRow(ev1)
  await linkMemberRow(ev2)
  adminC = clientFor(adminUser.accessToken)
  m1C = clientFor(m1.accessToken)
  m2C = clientFor(m2.accessToken)
  ev1C = clientFor(ev1.accessToken)
  ev2C = clientFor(ev2.accessToken)
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
  if (evaluationIds.length) await sb.from('evaluations').delete().in('id', evaluationIds)
  const users = [adminUser, m1, m2, ev1, ev2].filter(Boolean)
  await sb
    .from('members')
    .delete()
    .in('user_id', users.map((u) => u.id))
  await Promise.all(users.map((u) => deleteTestUser(u)))
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

/**
 * The table and the bucket used to disagree, and the portal renders its
 * download button from the table's answer.
 * `evaluations_select_capability_or_subject` grants the ROW to the subject, to
 * admin/executive and to anyone holding the `evaluator` capability;
 * `evaluations_select_owner_or_admin` (0014) granted the OBJECT only to the
 * uploader plus admin/executive, so two of those readers saw a button that
 * could not work.
 *
 * 0016 closes it by making both policies call one predicate,
 * `public.can_read_evaluation()`, and giving the object policy a way to reach
 * it: `evaluations.file_url` already holds `storage://evaluations/<key>`, so a
 * policy on `storage.objects` can follow that reference backwards from `name`.
 *
 * What these tests are for is the sentence in the README that replaced the
 * known gap: whoever can see the row can open the file, and whoever cannot see
 * the row cannot. Both halves are asserted by fetching the URL, because a mint
 * that succeeds and a fetch that 403s would be a fix that is not one.
 */
describe('an evaluation attachment', () => {
  let ref: string
  let path: string

  beforeAll(async () => {
    path = key('report.txt')
    // Through the policies, as the portal does it: the evaluator uploads, so
    // the evaluator owns the object.
    expect((await uploadAs(ev1C, 'evaluations', path, 'the report')).error).toBeNull()
    ref = toStorageRef('evaluations', path)
    await seedEvaluation(m1, ev1, ref, 'report.txt')
  }, 60_000)

  it('opens for the evaluator who uploaded it', async () => {
    const url = await resolveFileUrl(ref, { client: ev1C })
    const res = await fetch(url)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('the report')
  })

  it('opens for an admin', async () => {
    const url = await resolveFileUrl(ref, { client: adminC })
    expect((await fetch(url)).status).toBe(200)
  })

  it('opens for the official it is about', async () => {
    // The row the portal renders the button from.
    const { data, error: rowError } = await m1C.from('evaluations').select('id').eq('file_url', ref)
    expect(rowError).toBeNull()
    expect(data).toHaveLength(1)

    const url = await resolveFileUrl(ref, { client: m1C })
    expect(url).toContain('/object/sign/evaluations/')
    const res = await fetch(url)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('the report')
  })

  it('opens for a second evaluator, who did not upload it', async () => {
    // The capability the application checks before rendering the button.
    expect(canViewAllEvaluations(toPrincipal({ role: 'member', capabilities: ev2.capabilities })))
      .toBe(true)

    const { data, error: rowError } = await ev2C.from('evaluations').select('id').eq('file_url', ref)
    expect(rowError).toBeNull()
    expect(data).toHaveLength(1)

    const url = await resolveFileUrl(ref, { client: ev2C })
    const res = await fetch(url)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('the report')
  })

  it('saves under the name the portal asks for, for the subject too', async () => {
    const url = await resolveFileUrl(ref, { client: m1C, download: 'My Evaluation.txt' })
    const res = await fetch(url)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toContain('attachment')
    expect(res.headers.get('content-disposition')).toContain('My%20Evaluation.txt')
    expect(await res.text()).toBe('the report')
  })

  it('is not listed, and does not open, for a member with no claim to the row', async () => {
    const { data } = await m2C.from('evaluations').select('id').eq('file_url', ref)
    expect(data).toHaveLength(0)

    // Refused at mint time, which is where it has to be refused: there is no
    // URL to hand out and nothing for the portal to follow.
    await expect(resolveFileUrl(ref, { client: m2C })).rejects.toThrow(/couldn’t open that file/)
  })

  it('resolves for the subject through a row still holding the old public URL', async () => {
    // An adopter who ran the portal before signed downloads landed has rows
    // whose file_url is a `/object/public/…` link. `evaluation_object_key()`
    // reads the key back out of that shape too, so the subject reaches those
    // files without anything being rewritten in the database.
    const legacyPath = key('legacy-report.txt')
    expect((await uploadAs(ev1C, 'evaluations', legacyPath, 'the legacy report')).error).toBeNull()
    const { data: legacy } = ev1C.storage.from('evaluations').getPublicUrl(legacyPath)
    await seedEvaluation(m1, ev1, legacy.publicUrl, 'legacy-report.txt')

    const url = await resolveFileUrl(legacy.publicUrl, { client: m1C })
    expect(url).toContain('/object/sign/evaluations/')
    const res = await fetch(url)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('the legacy report')
  })

  it('stays owner-only while no evaluation row points at it', async () => {
    // The window between the upload and the row, and the resting state of any
    // stray object a member drops in the bucket. 0014's guarantee — a member
    // who uploads can only ever read back what they uploaded — is what this is.
    const stray = key('stray.txt')
    expect((await uploadAs(m2C, 'evaluations', stray, 'no row points here')).error).toBeNull()
    const strayRef = toStorageRef('evaluations', stray)

    expect(await resolveFileUrl(strayRef, { client: m2C })).toContain('/object/sign/evaluations/')
    clearSignedUrlCache()
    // Holding the evaluator capability is not a key to the bucket. It is a key
    // to the evaluations, and this object is not one.
    await expect(resolveFileUrl(strayRef, { client: ev2C })).rejects.toThrow(
      /couldn’t open that file/
    )
    await expect(resolveFileUrl(strayRef, { client: m1C })).rejects.toThrow(
      /couldn’t open that file/
    )
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

  it('does not serve a five minute link to a caller that asked for a one second one', async () => {
    const path = key('ttl-key.txt')
    await seed('portal-resources', path, 'ttl key')
    const ref = toStorageRef('portal-resources', path)

    const long = await resolveFileUrl(ref, { client: m1C })
    const short = await resolveFileUrl(ref, { client: m1C, ttlSeconds: 1 })

    const longClaims = tokenClaims(long)
    const shortClaims = tokenClaims(short)
    expect(longClaims.exp - longClaims.iat).toBe(SIGNED_URL_TTL_SECONDS)
    expect(shortClaims.exp - shortClaims.iat).toBe(1)
  })

  it('goes back to storage when the caller asks it to forget', async () => {
    const path = key('remint.txt')
    await seed('portal-resources', path, 'remint')
    const ref = toStorageRef('portal-resources', path)

    expect(await resolveFileUrl(ref, { client: m1C })).toContain('/object/sign/')

    // Pull the object out from under the memo. A memoised answer still comes
    // back; `forceRefresh` has to ask storage again, and storage now says no.
    // That is what a `<video>` does when a range request is refused.
    await getSupabaseAdmin().storage.from('portal-resources').remove([path])

    expect(await resolveFileUrl(ref, { client: m1C })).toContain('/object/sign/')
    await expect(resolveFileUrl(ref, { client: m1C, forceRefresh: true })).rejects.toThrow(
      /couldn’t open that file/
    )
  })
})

/**
 * One tab, two members, no reload.
 *
 * `logout()` in `contexts/AuthContext.tsx` calls `supabase.auth.signOut()` and
 * navigates nowhere. The SPA stays mounted, the browser-client singleton
 * survives, and so does the module-level memo in `lib/fileDownload.ts`. On a
 * shared rink or office machine the next member signs in on top of that, which
 * is the sequence driven below — not reasoned about, driven: one client object
 * with its own session storage, a real sign-out and a real sign-in between the
 * two downloads.
 *
 * The memo used to key on bucket, path, disposition and TTL, all four of which
 * the second member's click matches exactly. So the second member hit the first
 * member's slot and was handed a live link to a file storage would have refused
 * them.
 */
describe('the memo across a sign-out and a sign-in in the same tab', () => {
  let ref: string

  beforeAll(async () => {
    const path = key('handover.txt')
    expect((await uploadAs(ev1C, 'evaluations', path, 'the handover report')).error).toBeNull()
    ref = toStorageRef('evaluations', path)
    await seedEvaluation(m1, ev1, ref, 'handover.txt')
  }, 60_000)

  /**
   * One browser tab: a client that keeps its session, in a store of its own,
   * the way `createBrowserClient()` keeps one in the page. Everything else in
   * this suite injects a bearer header and holds no session at all, which is a
   * different shape and cannot express a logout.
   */
  function tabClient(): SupabaseClient {
    const store = new Map<string, string>()
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storage: {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => void store.set(k, v),
            removeItem: (k: string) => void store.delete(k),
          },
        },
      }
    )
  }

  async function signIn(tab: SupabaseClient, user: TestUser): Promise<void> {
    const { error } = await tab.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    })
    if (error) throw new Error(`sign-in failed for ${user.role}: ${error.message}`)
  }

  it('hands the second member nothing the first member minted', async () => {
    const tab = tabClient()

    // The evaluator who wrote the report downloads it. Same options the portal
    // sends, so this is the exact cache slot the next click would land in.
    await signIn(tab, ev1)
    const evaluatorUrl = await resolveFileUrl(ref, { client: tab, download: 'handover.txt' })
    expect((await fetch(evaluatorUrl)).status).toBe(200)

    // Logout as the portal does it: no reload, no navigation. The memo is still
    // in memory with that link in it.
    await tab.auth.signOut()
    expect((await tab.auth.getSession()).data.session).toBeNull()

    // A member with no claim to the row signs in on the same tab and presses
    // the same button.
    await signIn(tab, m2)
    await expect(
      resolveFileUrl(ref, { client: tab, download: 'handover.txt' })
    ).rejects.toThrow(/couldn’t open that file/)

    // And the link the first member got is still not reachable through any
    // call this member can make — the refusal above is a refusal, not a
    // different URL that happens to work.
    await expect(resolveFileUrl(ref, { client: tab })).rejects.toThrow(/couldn’t open that file/)

    // The subject signs in on the same tab and does get their own report, so
    // what the middle member met was a scoped cache and not a jammed one.
    //
    // No assertion here that this URL differs from the evaluator's, and that is
    // worth saying rather than leaving as an omission: a storage token signs
    // `{url, scope, iat, exp}` and names nobody, so two members minting for the
    // same object in the same second get the same string whether it came from
    // the memo or from a fresh round trip. Comparing them proves nothing in
    // either direction. What discriminates is the refusal above, and the mint
    // counting in `__tests__/unit/storage/signedUrlCache.test.ts`.
    await tab.auth.signOut()
    await signIn(tab, m1)
    expect((await tab.auth.getSession()).data.session?.user.id).toBe(m1.id)

    const subjectUrl = await resolveFileUrl(ref, { client: tab, download: 'handover.txt' })
    const res = await fetch(subjectUrl)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('the handover report')

    await tab.auth.signOut()
  }, 60_000)
})
