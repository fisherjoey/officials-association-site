/**
 * What a stored file reference is.
 *
 * `resources.file_url`, `newsletters.file_url` and `evaluations.file_url` hold
 * a reference to an object, not a link to it:
 *
 *     storage://portal-resources/1730000000000-rulebook.pdf
 *
 * Four of the five buckets are private (see
 * `supabase/migrations/20260810001400_storage_policies.sql`), and for a private
 * bucket there is no URL that works without a session — the
 * `/storage/v1/object/public/…` route is served only for buckets flagged
 * public and answers 400 for everything else. A link therefore has to be
 * signed, and a signed link expires, so storing one would move the breakage
 * rather than fix it. Bucket plus object path is the part that does not go
 * stale; the link gets minted on read, by `lib/fileDownload.ts`, with the
 * reader's own JWT and against the same policies a download runs.
 *
 * This module is deliberately free of imports: both the browser (via
 * `lib/fileDownload.ts` and `lib/fileUpload.ts`) and the service-role upload
 * path in `netlify/functions/upload-file.ts` need to agree on the format.
 */

/** Scheme for a stored object reference. Deliberately not a fetchable URL. */
export const STORAGE_REF_SCHEME = 'storage://'

/** Served without a session; `getPublicUrl()` is the correct link for these. */
export const PUBLIC_BUCKETS = ['email-images'] as const

/** RLS is the whole access model; downloads have to be signed. */
export const PRIVATE_BUCKETS = [
  'portal-resources',
  'newsletters',
  'training-materials',
  'evaluations',
] as const

export interface StorageObjectRef {
  bucket: string
  path: string
}

export function isPublicBucket(bucket: string): boolean {
  return (PUBLIC_BUCKETS as readonly string[]).includes(bucket)
}

export function isPrivateBucket(bucket: string): boolean {
  return (PRIVATE_BUCKETS as readonly string[]).includes(bucket)
}

/** Build the value a row should store for an object in a private bucket. */
export function toStorageRef(bucket: string, path: string): string {
  return `${STORAGE_REF_SCHEME}${bucket}/${path}`
}

/**
 * Storage-api serves objects under `/storage/v1/object/<route>/<bucket>/<path>`
 * where route is `public`, `sign` or `authenticated`. Query and fragment are
 * dropped — on a `sign` URL that is the expired token we would be replacing.
 */
const OBJECT_ROUTE = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?#]+)\/([^?#]+)/

/**
 * Read a stored value as a storage location, or `null` if it is not one.
 *
 * Three shapes are recognised, because the same column also holds pasted
 * external links for `link` and `video` resources:
 *
 *   storage://<bucket>/<path>       what uploads write now
 *   …/storage/v1/object/public/…    rows written before signed downloads
 *   …/storage/v1/object/sign/…      landed; the bucket and path are read back
 *                                   out so the link can be re-minted
 *
 * `null` means "not ours" — an external link, an empty column, a data URI —
 * and callers pass those through untouched. Recognising the old URL shape on
 * read is the entire migration story: nothing has to be rewritten in the
 * database, and an expired signed URL sitting in a row still resolves.
 */
export function parseStorageRef(value: string | null | undefined): StorageObjectRef | null {
  if (!value || typeof value !== 'string') return null

  if (value.startsWith(STORAGE_REF_SCHEME)) {
    const rest = value.slice(STORAGE_REF_SCHEME.length)
    const slash = rest.indexOf('/')
    if (slash <= 0 || slash === rest.length - 1) return null
    return { bucket: rest.slice(0, slash), path: rest.slice(slash + 1) }
  }

  const match = value.match(OBJECT_ROUTE)
  if (!match) return null
  const [, bucket, encodedPath] = match
  return { bucket, path: safeDecode(encodedPath) }
}

function safeDecode(path: string): string {
  try {
    return decodeURIComponent(path)
  } catch {
    // A stray `%` in a filename is not worth failing a download over.
    return path
  }
}

/** The name a browser should save an object as, absent a better one. */
export function fileNameFromRef(value: string | null | undefined): string | undefined {
  const ref = parseStorageRef(value)
  if (!ref) return undefined
  return ref.path.split('/').pop() || undefined
}

/**
 * Does this value need a round trip to Supabase before it can be fetched?
 * Lets a component render a plain `<a href>` for everything that does not.
 */
export function needsSignedUrl(value: string | null | undefined): boolean {
  const ref = parseStorageRef(value)
  return ref !== null && !isPublicBucket(ref.bucket)
}
