/**
 * The stored-reference format, on its own.
 *
 * `lib/storageRefs.ts` is the one thing the browser upload path, the
 * service-role upload path and every download link have to agree on, so it is
 * tested without Supabase anywhere near it. What it must get right:
 *
 *  - a reference round-trips
 *  - a row written before signed downloads landed still resolves, because the
 *    bucket and path are read back out of the old public URL
 *  - an external link is left alone, since `resources.file_url` holds those too
 *  - `email-images` is never treated as something to sign
 */
import {
  PRIVATE_BUCKETS,
  PUBLIC_BUCKETS,
  STORAGE_REF_SCHEME,
  fileNameFromRef,
  isPrivateBucket,
  isPublicBucket,
  needsSignedUrl,
  parseStorageRef,
  toStorageRef,
} from '@/lib/storageRefs'

describe('bucket posture', () => {
  it('matches the migration: email-images public, the other four private', () => {
    expect([...PUBLIC_BUCKETS]).toEqual(['email-images'])
    expect([...PRIVATE_BUCKETS]).toEqual([
      'portal-resources',
      'newsletters',
      'training-materials',
      'evaluations',
    ])
    for (const bucket of PRIVATE_BUCKETS) {
      expect(isPrivateBucket(bucket)).toBe(true)
      expect(isPublicBucket(bucket)).toBe(false)
    }
    expect(isPublicBucket('email-images')).toBe(true)
  })
})

describe('toStorageRef / parseStorageRef', () => {
  it('round-trips a bucket and object path', () => {
    const ref = toStorageRef('portal-resources', '1730000000000-rulebook.pdf')
    expect(ref).toBe(`${STORAGE_REF_SCHEME}portal-resources/1730000000000-rulebook.pdf`)
    expect(parseStorageRef(ref)).toEqual({
      bucket: 'portal-resources',
      path: '1730000000000-rulebook.pdf',
    })
  })

  it('keeps nested paths intact', () => {
    expect(parseStorageRef('storage://evaluations/2026/03/report.pdf')).toEqual({
      bucket: 'evaluations',
      path: '2026/03/report.pdf',
    })
  })

  it('rejects a reference with no object path', () => {
    expect(parseStorageRef('storage://portal-resources')).toBeNull()
    expect(parseStorageRef('storage://portal-resources/')).toBeNull()
    expect(parseStorageRef('storage:///orphan.pdf')).toBeNull()
  })

  it('reads the bucket and path back out of a legacy public URL', () => {
    expect(
      parseStorageRef(
        'https://abc.supabase.co/storage/v1/object/public/newsletters/1730000000000-march.pdf'
      )
    ).toEqual({ bucket: 'newsletters', path: '1730000000000-march.pdf' })
  })

  it('reads them back out of an expired signed URL too', () => {
    expect(
      parseStorageRef(
        'https://abc.supabase.co/storage/v1/object/sign/evaluations/report.pdf?token=stale.jwt.value'
      )
    ).toEqual({ bucket: 'evaluations', path: 'report.pdf' })
  })

  it('decodes a percent-encoded path', () => {
    expect(
      parseStorageRef(
        'https://abc.supabase.co/storage/v1/object/public/portal-resources/rule%20book.pdf'
      )
    ).toEqual({ bucket: 'portal-resources', path: 'rule book.pdf' })
  })

  it('leaves a malformed encoding alone rather than throwing', () => {
    expect(
      parseStorageRef('https://abc.supabase.co/storage/v1/object/public/portal-resources/100%.pdf')
    ).toEqual({ bucket: 'portal-resources', path: '100%.pdf' })
  })

  it('says "not mine" for external links and empty columns', () => {
    expect(parseStorageRef('https://example.org/handbook.pdf')).toBeNull()
    expect(parseStorageRef('https://youtu.be/dQw4w9WgXcQ')).toBeNull()
    expect(parseStorageRef('')).toBeNull()
    expect(parseStorageRef(null)).toBeNull()
    expect(parseStorageRef(undefined)).toBeNull()
  })
})

describe('needsSignedUrl', () => {
  it('is true for the four private buckets', () => {
    for (const bucket of PRIVATE_BUCKETS) {
      expect(needsSignedUrl(toStorageRef(bucket, 'file.pdf'))).toBe(true)
    }
  })

  it('is true for a legacy public URL pointing at a private bucket', () => {
    expect(
      needsSignedUrl('https://abc.supabase.co/storage/v1/object/public/portal-resources/f.pdf')
    ).toBe(true)
  })

  it('is false for email-images, which stays an unsigned public link', () => {
    expect(
      needsSignedUrl('https://abc.supabase.co/storage/v1/object/public/email-images/logo.png')
    ).toBe(false)
    expect(needsSignedUrl(toStorageRef('email-images', 'logo.png'))).toBe(false)
  })

  it('is false for anything that is not ours', () => {
    expect(needsSignedUrl('https://example.org/handbook.pdf')).toBe(false)
    expect(needsSignedUrl(undefined)).toBe(false)
  })
})

describe('fileNameFromRef', () => {
  it('takes the last path segment', () => {
    expect(fileNameFromRef('storage://evaluations/2026/03/report.pdf')).toBe('report.pdf')
  })

  it('is undefined when the value is not a storage reference', () => {
    expect(fileNameFromRef('https://example.org/handbook.pdf')).toBeUndefined()
  })
})
