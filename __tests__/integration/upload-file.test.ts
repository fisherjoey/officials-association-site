/**
 * upload-file integration tests.
 *
 * The handler is `netlify/functions/upload-file.ts` — a multipart/form-data
 * uploader that writes into Supabase Storage. The bucket is selected from
 * the `path` form field:
 *   - includes 'email-images'  -> 'email-images'      (admin/executive)
 *   - includes 'newsletter'    -> 'newsletters'       (admin/executive)
 *   - includes 'training'      -> 'training-materials'(admin/executive)
 *   - anything else / missing  -> 'portal-resources'  (any signed-in user)
 *
 * Auth: any authenticated user can upload to portal-resources; admin or
 * executive only for the other three buckets. There is a 10MB hard limit
 * enforced mid-stream — the handler comment notes this used to leave a
 * partial blob in storage, so we explicitly assert NO file is uploaded
 * when the limit fires.
 *
 * Bugs we probe (not fix) per PATTERN.md:
 *   - filename sanitization vs path traversal
 *   - extension/content-type mismatch
 *   - role gate on privileged buckets via every path keyword
 */
import { handler } from '@/netlify/functions/upload-file'
import { invokeFunction } from './helpers/invokeFunction'
import { E2E_TAG, getSupabaseAdmin } from './helpers/supabase'
import {
  buildMultipart,
  cleanupUploadBuckets,
  objectExists,
  removeUploaded,
  UPLOAD_BUCKETS,
} from './helpers/storage'
import {
  cleanupOrphanedTestUsers,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from './helpers/auth'

let admin: TestUser
let official: TestUser
let executive: TestUser

beforeAll(async () => {
  await cleanupOrphanedTestUsers()
  await cleanupUploadBuckets()
  ;[admin, executive, official] = await Promise.all([
    createTestUser('admin'),
    createTestUser('executive'),
    createTestUser('official'),
  ])
}, 30_000)

afterAll(async () => {
  await Promise.all(
    [admin, executive, official]
      .filter(Boolean)
      .map((u) => deleteTestUser(u))
  )
  await cleanupUploadBuckets()
})

/** Track everything we upload so we can guarantee teardown even on failure. */
const uploaded: { bucket: string; path: string }[] = []
afterEach(async () => {
  while (uploaded.length) {
    const u = uploaded.pop()!
    await removeUploaded(u.bucket, u.path)
  }
})

const BOUNDARY = '----E2EBoundary' + Math.random().toString(36).slice(2)

function multipartHeaders(boundary = BOUNDARY): Record<string, string> {
  return { 'content-type': `multipart/form-data; boundary=${boundary}` }
}

/**
 * Drive invokeFunction with a multipart/form-data body. invokeFunction
 * stringifies raw bodies via String(buffer) (utf-8) and the handler's
 * Buffer.from(event.body) round-trips utf-8 too — fine for ASCII test
 * payloads, which is everything we send.
 */
async function postUpload(
  body: Buffer,
  opts: { bearerToken?: string; boundary?: string; contentType?: string } = {}
) {
  const headers = opts.contentType
    ? { 'content-type': opts.contentType }
    : multipartHeaders(opts.boundary ?? BOUNDARY)
  return invokeFunction(handler, {
    method: 'POST',
    rawBody: true,
    body: body.toString('binary') as unknown as string, // see note below
    headers,
    bearerToken: opts.bearerToken,
  })
}

// NOTE on body encoding: we tested invokeFunction's String(buffer) round
// trip and it works for ASCII; passing buffer.toString('binary') is
// equivalent for ASCII content but more explicit. Keep file payloads
// ASCII-only.

describe('upload-file', () => {
  it('rejects non-POST', async () => {
    const res = await invokeFunction(handler, { method: 'GET' })
    expect(res.statusCode).toBe(405)
  })

  it('preflight OPTIONS returns 204', async () => {
    const res = await invokeFunction(handler, { method: 'OPTIONS' })
    expect(res.statusCode).toBe(204)
  })

  it('rejects POST without auth header (401)', async () => {
    const body = buildMultipart(BOUNDARY, [
      {
        name: 'file',
        filename: `${E2E_TAG}-noauth.txt`,
        contentType: 'text/plain',
        data: 'no auth here',
      },
    ])
    const res = await postUpload(body)
    expect(res.statusCode).toBe(401)
  })

  it('rejects POST with bogus bearer token (401)', async () => {
    const body = buildMultipart(BOUNDARY, [
      {
        name: 'file',
        filename: `${E2E_TAG}-badtoken.txt`,
        contentType: 'text/plain',
        data: 'bad auth',
      },
    ])
    const res = await postUpload(body, { bearerToken: 'not-a-real-jwt' })
    expect(res.statusCode).toBe(401)
  })

  it('happy path: official uploads to portal-resources, file lands and URL is returned', async () => {
    const filename = `${E2E_TAG}-happy-${Date.now()}.txt`
    // ASCII-only — invokeFunction stringifies raw bodies via toString()
    // which is utf-8; non-ASCII bytes would expand and the handler's
    // reported size would no longer match Buffer.byteLength of the source.
    const content = `hello from e2e ${Date.now()}`
    const body = buildMultipart(BOUNDARY, [
      // No `path` field at all -> portal-resources (the catch-all)
      {
        name: 'file',
        filename,
        contentType: 'text/plain',
        data: content,
      },
    ])

    const res = await postUpload(body, { bearerToken: official.accessToken })
    expect(res.statusCode).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.bucket).toBe('portal-resources')
    expect(typeof res.body.path).toBe('string')
    expect(res.body.path).toContain(E2E_TAG)
    expect(res.body.url).toContain('/storage/v1/object/public/portal-resources/')
    expect(res.body.size).toBe(Buffer.byteLength(content))

    const path: string = res.body.path
    uploaded.push({ bucket: 'portal-resources', path })

    // Verify the object actually exists in storage.
    const exists = await objectExists('portal-resources', path)
    expect(exists).toBe(true)

    // And that the bytes round-tripped — download and compare.
    const sb = getSupabaseAdmin()
    const { data: blob, error: dlErr } = await sb.storage
      .from('portal-resources')
      .download(path)
    expect(dlErr).toBeNull()
    const text = blob ? await blob.text() : ''
    expect(text).toBe(content)
  })

  it('happy path: admin can upload to a privileged bucket via path=newsletter', async () => {
    const filename = `${E2E_TAG}-newsletter-${Date.now()}.txt`
    const body = buildMultipart(BOUNDARY, [
      { name: 'path', data: 'newsletter/2025-01' },
      {
        name: 'file',
        filename,
        contentType: 'text/plain',
        data: 'admin newsletter content',
      },
    ])
    const res = await postUpload(body, { bearerToken: admin.accessToken })
    expect(res.statusCode).toBe(200)
    expect(res.body.bucket).toBe('newsletters')
    uploaded.push({ bucket: 'newsletters', path: res.body.path })
    expect(await objectExists('newsletters', res.body.path)).toBe(true)
  })

  it('executive can upload to email-images bucket', async () => {
    const filename = `${E2E_TAG}-email-${Date.now()}.png`
    // 1x1 PNG-shaped header bytes; we send via ASCII-safe text since the
    // handler doesn't validate file magic. Content here is irrelevant.
    const body = buildMultipart(BOUNDARY, [
      { name: 'path', data: 'email-images/banner' },
      {
        name: 'file',
        filename,
        contentType: 'image/png',
        data: 'fake-png-bytes-but-handler-doesnt-check',
      },
    ])
    const res = await postUpload(body, { bearerToken: executive.accessToken })
    expect(res.statusCode).toBe(200)
    expect(res.body.bucket).toBe('email-images')
    uploaded.push({ bucket: 'email-images', path: res.body.path })
  })

  it.each(['email-images', 'newsletter', 'training'])(
    'official is forbidden from privileged path "%s" (403)',
    async (pathKeyword) => {
      const filename = `${E2E_TAG}-priv-${pathKeyword}-${Date.now()}.txt`
      const body = buildMultipart(BOUNDARY, [
        { name: 'path', data: `${pathKeyword}/blocked` },
        {
          name: 'file',
          filename,
          contentType: 'text/plain',
          data: 'official should be blocked',
        },
      ])
      const res = await postUpload(body, {
        bearerToken: official.accessToken,
      })
      expect(res.statusCode).toBe(403)
      expect(res.body.message ?? res.body.error).toMatch(/(forbidden|insufficient|permission)/i)
    }
  )

  it('returns 400 when the body is missing entirely', async () => {
    const res = await invokeFunction(handler, {
      method: 'POST',
      bearerToken: official.accessToken,
      headers: multipartHeaders(),
    })
    expect(res.statusCode).toBe(400)
  })

  // FIXED: when an unsupported Content-Type is supplied, `busboy({...})` throws
  // synchronously ("Unsupported content type: ..."). The handler now wraps
  // the constructor in try/catch and returns a clean 400 instead of letting
  // the exception escape (which used to surface as a Netlify 502).
  it(
    'non-multipart Content-Type returns a clean 400 instead of throwing',
    async () => {
      const res = await postUpload(Buffer.from('{"not":"multipart"}'), {
        bearerToken: official.accessToken,
        contentType: 'application/json',
      })
      expect(res.statusCode).toBe(400)
      expect(res.body.success).not.toBe(true)
    }
  )

  it('multipart with no file field returns 400 "No file received"', async () => {
    const body = buildMultipart(BOUNDARY, [
      // a field with no filename is treated as a regular form field, not a
      // file; busboy will not call the file handler.
      { name: 'path', data: 'portal-resources' },
    ])
    const res = await postUpload(body, { bearerToken: official.accessToken })
    expect(res.statusCode).toBe(400)
    expect(res.body.message ?? res.body.error).toMatch(/no file/i)
  })

  it('over-size file is rejected with 413 and leaves NOTHING in storage', async () => {
    // Build a payload just over 10MB. ASCII filler so the buffer survives
    // the utf-8 round trip in invokeFunction. The handler aborts the
    // upload mid-stream once fileSize > 10MB; the regression we are
    // guarding against is the partial-buffer-still-uploaded bug noted in
    // the handler's own comment.
    const ELEVEN_MB = 11 * 1024 * 1024
    const big = Buffer.alloc(ELEVEN_MB, 'a')
    const filename = `${E2E_TAG}-toobig-${Date.now()}.txt`

    const body = buildMultipart(BOUNDARY, [
      {
        name: 'file',
        filename,
        contentType: 'text/plain',
        data: big,
      },
    ])

    const res = await postUpload(body, { bearerToken: official.accessToken })
    expect(res.statusCode).toBe(413)
    expect(res.body.message ?? res.body.error).toMatch(/too large/i)

    // The big test: nothing was written. Sweep all buckets for any object
    // whose name contains our unique filename suffix.
    const sb = getSupabaseAdmin()
    for (const bucket of UPLOAD_BUCKETS) {
      const { data } = await sb.storage.from(bucket).list('', {
        limit: 1000,
        search: filename,
      })
      const matches = (data ?? []).filter((o) => o.name.includes(filename))
      if (matches.length) {
        // Defensive cleanup so a regression doesn't leak across tests.
        await sb.storage
          .from(bucket)
          .remove(matches.map((m) => m.name))
      }
      expect(matches).toEqual([])
    }
  }, 60_000)

  it('a file at exactly 10MB is accepted (boundary check)', async () => {
    const TEN_MB = 10 * 1024 * 1024
    const body10mb = Buffer.alloc(TEN_MB, 'b')
    const filename = `${E2E_TAG}-10mb-${Date.now()}.txt`

    const body = buildMultipart(BOUNDARY, [
      {
        name: 'file',
        filename,
        contentType: 'text/plain',
        data: body10mb,
      },
    ])

    const res = await postUpload(body, { bearerToken: official.accessToken })
    // The handler trips on fileSize > 10MB strict, so 10MB exactly should
    // be allowed. If this ever flips to 413 the size check has drifted.
    expect(res.statusCode).toBe(200)
    if (res.statusCode === 200) {
      uploaded.push({ bucket: 'portal-resources', path: res.body.path })
      expect(res.body.size).toBe(TEN_MB)
    }
  }, 60_000)

  // ---- Bug probes (it.failing — they fail loud once a fix lands) ----

  // FIXED: the handler now validates that .pdf uploads actually start with
  // the %PDF- magic-byte prefix and that declared MIME types match the
  // filename extension for the common types. A .pdf filename with EXE-
  // shaped bytes is rejected with a 4xx.
  it(
    'rejects mismatched extension vs file bytes (extension validation)',
    async () => {
      const filename = `${E2E_TAG}-mismatch-${Date.now()}.pdf`
      const body = buildMultipart(BOUNDARY, [
        {
          name: 'file',
          filename,
          contentType: 'application/pdf',
          // Not a PDF. Real PDFs start with %PDF-.
          data: 'MZ\x90\x00 not a pdf, looks like a windows EXE header',
        },
      ])
      const res = await postUpload(body, { bearerToken: admin.accessToken })
      expect(res.statusCode).toBeGreaterThanOrEqual(400)
      if (res.statusCode === 200) {
        uploaded.push({ bucket: 'portal-resources', path: res.body.path })
      }
    }
  )

  // Filename with slashes — busboy strips the directory component before
  // it reaches our handler, so '../../../etc/passwd' is reduced to
  // 'passwd'. Documents the layered defense: even if the handler regex
  // missed slashes, busboy's parsing already drops them.
  it('strips directory components from filenames (busboy + regex)', async () => {
    const filename = `${E2E_TAG}-../../../etc/passwd`
    const body = buildMultipart(BOUNDARY, [
      {
        name: 'file',
        filename,
        contentType: 'text/plain',
        data: 'traversal test',
      },
    ])
    const res = await postUpload(body, { bearerToken: official.accessToken })
    expect(res.statusCode).toBe(200)
    const path: string = res.body.path
    uploaded.push({ bucket: 'portal-resources', path })
    expect(path).not.toContain('/')
    expect(path).not.toContain('..')
  })

  // FIXED: the handler now collapses runs of '.' to a single dot and
  // strips leading dots after the existing character-allowlist pass, so a
  // filename like 'foo..bar.txt' becomes 'foo.bar.txt' in storage. Defense
  // in depth against any future code path that joins this string into a
  // filesystem/storage path.
  it(
    'collapses repeated dots in filenames so ".." sequences never appear in storage paths',
    async () => {
      const filename = `${E2E_TAG}-foo..bar.txt`
      const body = buildMultipart(BOUNDARY, [
        {
          name: 'file',
          filename,
          contentType: 'text/plain',
          data: 'dotdot test',
        },
      ])
      const res = await postUpload(body, {
        bearerToken: official.accessToken,
      })
      expect(res.statusCode).toBe(200)
      const path: string = res.body.path
      uploaded.push({ bucket: 'portal-resources', path })
      expect(path).not.toMatch(/\.\./)
    }
  )
})
