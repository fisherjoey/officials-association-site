/**
 * Test helpers for the upload-file Netlify function.
 *
 * Two responsibilities:
 *  1. Build raw multipart/form-data bodies the way a browser would, so we
 *     can drive the busboy parser inside the handler.
 *  2. Sweep / clean up any objects we drop into Supabase Storage. The
 *     E2E_TAG prefix is the marker — anything starting with it in any of
 *     the four buckets the handler writes to is a test orphan.
 *
 * Per the project's PATTERN.md: never modify shared helpers from another
 * agent — add a new file (this one). The buckets list lives here so the
 * upload-file test is the only suite that touches them.
 */
import { getSupabaseAdmin, E2E_TAG } from './supabase'

export const UPLOAD_BUCKETS = [
  'portal-resources',
  'newsletters',
  'training-materials',
  'email-images',
] as const
export type UploadBucket = (typeof UPLOAD_BUCKETS)[number]

export interface MultipartField {
  name: string
  filename?: string
  contentType?: string
  data: Buffer | string
}

/**
 * Build a multipart/form-data body. Returns the raw buffer; callers wrap
 * it in invokeFunction with `rawBody: true` and the matching Content-Type
 * header (boundary included). For our test data we use ASCII-only file
 * payloads so the buffer survives the toString() / Buffer.from() round
 * trip that invokeFunction does on raw bodies.
 */
export function buildMultipart(
  boundary: string,
  fields: MultipartField[]
): Buffer {
  const parts: Buffer[] = []
  for (const f of fields) {
    const headers = [`Content-Disposition: form-data; name="${f.name}"`]
    if (f.filename !== undefined) {
      headers[0] += `; filename="${f.filename}"`
    }
    if (f.contentType) {
      headers.push(`Content-Type: ${f.contentType}`)
    }
    parts.push(Buffer.from(`--${boundary}\r\n${headers.join('\r\n')}\r\n\r\n`))
    parts.push(typeof f.data === 'string' ? Buffer.from(f.data) : f.data)
    parts.push(Buffer.from('\r\n'))
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`))
  return Buffer.concat(parts)
}

/** Sweep any leftover E2E objects from every bucket the handler writes to. */
export async function cleanupUploadBuckets(): Promise<void> {
  const sb = getSupabaseAdmin()
  for (const bucket of UPLOAD_BUCKETS) {
    // The handler uploads to the bucket root with a `${timestamp}-${name}`
    // key. We stuff E2E_TAG into the filename so list+filter is enough.
    const { data, error } = await sb.storage.from(bucket).list('', {
      limit: 1000,
      search: E2E_TAG,
    })
    if (error) {
      // eslint-disable-next-line no-console
      console.warn(`storage list ${bucket} failed:`, error.message)
      continue
    }
    const stale = (data ?? [])
      .map((o) => o.name)
      .filter((name) => name.includes(E2E_TAG))
    if (stale.length === 0) continue
    const { error: rmError } = await sb.storage.from(bucket).remove(stale)
    if (rmError) {
      // eslint-disable-next-line no-console
      console.warn(`storage remove ${bucket} failed:`, rmError.message)
    }
  }
}

/** Remove a specific object from a bucket. Best-effort. */
export async function removeUploaded(
  bucket: string,
  path: string
): Promise<void> {
  if (!path) return
  const sb = getSupabaseAdmin()
  const { error } = await sb.storage.from(bucket).remove([path])
  if (error) {
    // eslint-disable-next-line no-console
    console.warn(`storage remove ${bucket}/${path} failed:`, error.message)
  }
}

/** HEAD-style existence check — uses the storage list filter to confirm. */
export async function objectExists(
  bucket: string,
  path: string
): Promise<boolean> {
  const sb = getSupabaseAdmin()
  // Path is `${timestamp}-${safeFilename}` at the bucket root.
  const { data, error } = await sb.storage.from(bucket).list('', {
    limit: 1,
    search: path,
  })
  if (error) return false
  return (data ?? []).some((o) => o.name === path)
}
