/**
 * Turning a stored file reference into something a browser can actually fetch.
 *
 * The counterpart to `lib/fileUpload.ts`. Upload persists a reference to an
 * object (`lib/storageRefs.ts` defines the format and says why); this module
 * mints the URL for it at the moment a component needs one.
 *
 * The policies in `supabase/migrations/20260810001400_storage_policies.sql`
 * already decide who may read a given object, and `createSignedUrl` runs the
 * same SELECT policy a download would — a member who cannot read the object
 * cannot mint a link to it either. So this file adds no access rules of its
 * own. It is only the code that asks.
 *
 * `email-images` stays on `getPublicUrl()`. Those images are embedded in
 * outgoing mail and the person reading that mail in Gmail has no Supabase
 * session, so a signed link there would expire into a broken image in every
 * message the association has ever sent.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { AppError } from './errorHandling'
import { getSupabaseBrowserClient } from './api/client'
import { isPublicBucket, parseStorageRef, type StorageObjectRef } from './storageRefs'

export {
  STORAGE_REF_SCHEME,
  PUBLIC_BUCKETS,
  PRIVATE_BUCKETS,
  isPublicBucket,
  isPrivateBucket,
  toStorageRef,
  parseStorageRef,
  fileNameFromRef,
  needsSignedUrl,
  type StorageObjectRef,
} from './storageRefs'

/**
 * How long a minted link lives. Five minutes: long enough to click a download
 * button and for the transfer to start, short enough that a link cannot
 * meaningfully outlive the page it was rendered on.
 *
 * Nothing pays for the short life as long as no one puts a minted link
 * somewhere it will sit. Every button in the portal mints on the click, so a
 * list of forty resources costs nothing until somebody wants one. The embeds
 * are the case that has to be handled rather than assumed: a `<video>` open
 * for six minutes goes on issuing range requests after the token dies, so the
 * viewers re-mint on the media element's error rather than trusting the URL
 * they opened with. `forceRefresh` below exists for that.
 */
export const SIGNED_URL_TTL_SECONDS = 300

/**
 * Stop handing out a cached link this long before it dies, so a download does
 * not start against a URL that expires mid-transfer. Only the cache below
 * cares; it exists so a viewer re-rendering three times makes one round trip.
 */
const REMINT_MARGIN_SECONDS = 30

export interface ResolveOptions {
  /**
   * Sign as somebody other than the current browser session. The only caller
   * that needs this is a test driving a specific member's JWT; application
   * code leaves it alone and gets the singleton browser client.
   */
  client?: SupabaseClient
  /**
   * Ask storage for `Content-Disposition: attachment`. Pass a filename to name
   * the saved file, or `true` for the object's own name. The `download`
   * attribute on an `<a>` is ignored cross-origin, so this is the only thing
   * that actually makes a click save rather than navigate.
   */
  download?: string | boolean
  /** Override the link lifetime, in seconds. */
  ttlSeconds?: number
  /**
   * Ignore any memoised link and mint a new one. What a media element reaches
   * for when a range request comes back refused: the element cannot tell an
   * expired token from a dead object, and handing it the same cached string
   * again would leave it just as broken.
   */
  forceRefresh?: boolean
}

interface CacheEntry {
  url: string
  expiresAtMs: number
}

const signedUrlCache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<string>>()

function cacheKey(
  ref: StorageObjectRef,
  download: string | boolean | undefined,
  ttlSeconds: number
): string {
  // An attachment link and a preview link are different URLs for the same
  // object, so they cannot share a cache slot. Neither can two lifetimes: a
  // caller asking for a one-second link and getting a five-minute one back is
  // not the link it asked for.
  return `${ref.bucket}/${ref.path}|${download === undefined ? '' : String(download)}|${ttlSeconds}`
}

/** Drop every memoised link. Tests use this; nothing in the app needs it. */
export function clearSignedUrlCache(): void {
  signedUrlCache.clear()
  inFlight.clear()
}

/**
 * Turn a stored value into a URL a browser can fetch.
 *
 * Passes through anything that is not a storage reference, returns the public
 * URL for the public bucket, and signs everything else as the current caller.
 * Throws when the caller may not read the object — which is the policies
 * answering, not this code.
 */
export async function resolveFileUrl(
  value: string | null | undefined,
  options: ResolveOptions = {}
): Promise<string> {
  if (!value) return ''

  const ref = parseStorageRef(value)
  if (!ref) return value

  const client = options.client ?? getSupabaseBrowserClient()

  if (isPublicBucket(ref.bucket)) {
    // Already a URL? Leave it exactly as it is — that same string may be
    // sitting in the body of an email that has already gone out.
    if (/^https?:\/\//i.test(value)) return value
    const { data } = client.storage.from(ref.bucket).getPublicUrl(ref.path)
    return data.publicUrl
  }

  const ttl = options.ttlSeconds ?? SIGNED_URL_TTL_SECONDS
  const key = cacheKey(ref, options.download, ttl)

  if (options.forceRefresh) {
    signedUrlCache.delete(key)
    inFlight.delete(key)
  } else {
    const cached = signedUrlCache.get(key)
    if (cached && cached.expiresAtMs > Date.now()) return cached.url

    const pending = inFlight.get(key)
    if (pending) return pending
  }

  const request = mintSignedUrl(client, ref, ttl, options.download)
    .then((url) => {
      signedUrlCache.set(key, {
        url,
        expiresAtMs: Date.now() + (ttl - REMINT_MARGIN_SECONDS) * 1000,
      })
      return url
    })
    .finally(() => {
      inFlight.delete(key)
    })

  inFlight.set(key, request)
  return request
}

async function mintSignedUrl(
  client: SupabaseClient,
  ref: StorageObjectRef,
  ttlSeconds: number,
  download: string | boolean | undefined
): Promise<string> {
  const { data, error } = await client.storage
    .from(ref.bucket)
    .createSignedUrl(ref.path, ttlSeconds, download === undefined ? undefined : { download })

  if (error || !data?.signedUrl) {
    throw new AppError(
      'We couldn’t open that file. It may have been removed, or you may not have access to it.',
      'DOWNLOAD_ERROR',
      undefined,
      { code: error?.message }
    )
  }

  return data.signedUrl
}
