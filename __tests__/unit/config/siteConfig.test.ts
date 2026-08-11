/**
 * Regression tests for lib/siteConfig.ts.
 *
 * `lib/siteConfig.ts` is on this repo's risk-surfaces list because
 * `getAuthCallbackUrl()` feeds Supabase's `redirectTo`. Widening the config so
 * an adopter can rebrand the site is exactly the kind of change that can let a
 * caller-controlled string into that URL, so the properties the security
 * comment relies on are asserted here rather than left to review.
 *
 * The rest of the file guards the sanitisation contract: no default in this
 * template may name a real organisation, link to a real page, or route mail to
 * a domain someone could register.
 */

import fs from 'fs'
import path from 'path'

import * as config from '@/lib/siteConfig'

describe('client-reachable values are overridable only via NEXT_PUBLIC_', () => {
  // Source-level, not runtime, because this is a property of what the bundler
  // does with the file rather than of what the module evaluates to in Node.
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'lib', 'siteConfig.ts'),
    'utf8'
  )

  // Comments in that file quote the broken forms in order to warn about them,
  // so match against code only.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  // The role mailboxes are read only by netlify/functions/**, so they stay
  // unprefixed: an adopter's override should not leave the server.
  //
  // The missing prefix is not by itself what keeps the addresses out of the
  // browser. It hides the override; the default is a plain concatenation of
  // `<role>@` and the public mail domain, and that ships anywhere the client
  // module graph reaches it. Keeping them out is a separate property, asserted
  // by the 'role mailboxes stay out of the client bundle' block below.
  //
  // Everything else in this file is read by client components and must carry
  // the prefix.
  const SERVER_ONLY = new Set([
    'EMAIL_NO_REPLY',
    'EMAIL_ANNOUNCEMENTS',
    'EMAIL_SCHEDULER',
    'EMAIL_TREASURER',
    'EMAIL_SECRETARY',
    'EMAIL_MEMBER_SERVICES',
    'EMAIL_EDUCATION',
    'EMAIL_WEBMASTER',
    'EMAIL_PERFORMANCE',
    'EMAIL_RECRUITING',
    'EMAIL_INFO',
  ])

  it('reads no unprefixed environment variable outside the server-only allow list', () => {
    // Next.js substitutes `process.env.NEXT_PUBLIC_*` into the browser bundle
    // and nothing else. An unprefixed read evaluates to `undefined` there, so
    // the value falls through to the placeholder on the client while the
    // server-rendered HTML carries the override — split branding, and a React
    // hydration mismatch on every branded string. Over forty client components
    // import this module, so any unprefixed read here is that bug.
    const names = [...code.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1])

    expect(names.length).toBeGreaterThan(20)

    const offenders = names.filter(
      (name) => !name.startsWith('NEXT_PUBLIC_') && !SERVER_ONLY.has(name)
    )

    expect(offenders).toEqual([])
  })

  it('does not resolve SITE_URL from a platform variable the browser cannot see', () => {
    // `URL` and `DEPLOY_PRIME_URL` are Netlify build-time variables. They are
    // unprefixed, so a client-side SITE_URL built from them silently becomes
    // the example.org placeholder on every deploy — including inside
    // getAuthCallbackUrl().
    expect(code).not.toMatch(/process\.env\.URL\b/)
    expect(code).not.toMatch(/process\.env\.DEPLOY_PRIME_URL\b/)
  })

  it('offers no unprefixed alias beside a NEXT_PUBLIC_ read', () => {
    // The regressed form was `process.env.NEXT_PUBLIC_ORG_NAME ||
    // process.env.ORG_NAME || 'placeholder'`, which reads as a supported
    // fallback and documents one, but the second branch is dead in the browser.
    expect(code).not.toMatch(
      /process\.env\.NEXT_PUBLIC_([A-Z0-9_]+)\s*\|\|\s*process\.env\.(?!NEXT_PUBLIC_)/
    )
  })
})

describe('role mailboxes stay out of the client bundle', () => {
  const repoRoot = path.join(__dirname, '..', '..', '..')

  const ROLE_MAILBOX_EXPORTS = [
    'EMAIL_NO_REPLY',
    'EMAIL_ANNOUNCEMENTS',
    'EMAIL_SCHEDULER',
    'EMAIL_TREASURER',
    'EMAIL_SECRETARY',
    'EMAIL_MEMBER_SERVICES',
    'EMAIL_EDUCATION',
    'EMAIL_WEBMASTER',
    'EMAIL_PERFORMANCE',
    'EMAIL_RECRUITING',
    'EMAIL_INFO',
    'CONTACT_CATEGORY_EMAILS',
  ]

  // Directories Next.js compiles into browser chunks.
  const CLIENT_DIRS = ['app', 'components', 'contexts']

  const sourceFiles = (dir: string): string[] => {
    const abs = path.join(repoRoot, dir)
    if (!fs.existsSync(abs)) return []

    return fs.readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
      const rel = path.join(dir, entry.name)
      if (entry.isDirectory()) return sourceFiles(rel)
      return /\.tsx?$/.test(entry.name) ? [rel] : []
    })
  }

  it('is referenced by nothing Next.js compiles into a browser chunk', () => {
    // This is the property the security note in lib/siteConfig.ts depends on.
    // The addresses are ordinary strings built from a public mail domain, so
    // nothing about them is hidden once they are reachable — and a single
    // reference from here pulls every one of them into each page chunk that
    // evaluates the module, not just the page that did the importing.
    const offenders = CLIENT_DIRS.flatMap(sourceFiles).filter((rel) => {
      const text = fs.readFileSync(path.join(repoRoot, rel), 'utf8')
      return ROLE_MAILBOX_EXPORTS.some((name) => text.includes(name))
    })

    expect(offenders).toEqual([])
  })

  it('does not hang a routing address off the contact category list', () => {
    // CONTACT_CATEGORIES is imported by components/forms/ContactForm.tsx. It
    // used to carry each category's destination, which is exactly how the
    // addresses reached the bundle. The form posts a category name; the
    // netlify function resolves it.
    for (const category of config.CONTACT_CATEGORIES) {
      expect(Object.keys(category).sort()).toEqual(['label', 'value'])
    }
  })

  it('exposes no address on the default siteConfig object', () => {
    // The default export is what a client component gets from
    // `import siteConfig from '@/lib/siteConfig'`. Anything reachable on it is
    // reachable from the browser.
    const serialised = JSON.stringify(config.default)

    for (const local of [
      'no-reply',
      'announcements',
      'scheduler',
      'treasurer',
      'secretary',
      'memberservices',
      'education',
      'webmaster',
      'performance',
      'recruiting',
      'info',
    ]) {
      expect(serialised).not.toContain(`${local}@`)
    }
  })
})

describe('getAuthCallbackUrl — open-redirect guard', () => {
  it('always resolves to the site origin plus the fixed callback path', () => {
    expect(config.getAuthCallbackUrl()).toBe(`${config.SITE_URL}/auth/callback`)
  })

  it('accepts no arguments, so a caller has nowhere to inject a redirect', () => {
    expect(config.getAuthCallbackUrl.length).toBe(0)
  })

  it('ignores anything a caller passes anyway', () => {
    const sneaky = config.getAuthCallbackUrl as unknown as (...args: unknown[]) => string

    for (const payload of [
      'https://evil.example.net',
      '//evil.example.net',
      '/auth/callback?next=https://evil.example.net',
      '\\evil.example.net',
    ]) {
      expect(sneaky(payload)).toBe(`${config.SITE_URL}/auth/callback`)
    }
  })

  it('does not expose the callback path as an overridable export', () => {
    // AUTH_CALLBACK_PATH is deliberately module-private. If it ever becomes an
    // export, it becomes settable, and a settable path can be aimed at an
    // open-redirect endpoint on this origin.
    expect(config).not.toHaveProperty('AUTH_CALLBACK_PATH')
  })

  it('never derives its origin from the browser location', () => {
    expect(config.SITE_URL).not.toContain('localhost')
    expect(config.SITE_URL.startsWith('http')).toBe(true)
  })
})

describe('shipped defaults are placeholders, not a real organisation', () => {
  const identityValues = [
    config.ORG_NAME,
    config.ORG_SHORT_NAME,
    config.ORG_TAGLINE,
    config.ORG_LOCATION,
    config.ORG_CITY,
    config.ORG_REGION,
    config.SITE_URL,
    config.ORG_LOGO_URL,
    config.EMAIL_DOMAIN,
    config.NEWSLETTER_NAME,
    config.STORAGE_PREFIX,
    ...Object.values(config.CONTACT_CATEGORY_EMAILS),
    ...Object.values(config.SOCIAL_LINKS),
    ...Object.values(config.EXTERNAL_LINKS),
  ]

  it('names no real organisation', () => {
    for (const value of identityValues) {
      expect(value.toLowerCase()).not.toContain('cboa')
      expect(value.toLowerCase()).not.toContain('calgary')
    }
  })

  it('routes every contact category to the reserved example.org domain', () => {
    for (const address of Object.values(config.CONTACT_CATEGORY_EMAILS)) {
      expect(address).toMatch(/@example\.org$/)
    }
  })

  it('gives every contact category a routing address', () => {
    // This is now the only thing stopping a category from being added to the
    // form with nowhere to send it. CONTACT_CATEGORIES used to enforce the
    // pairing by carrying the address on each entry, which published all eight
    // to the browser; the guarantee moved here instead.
    for (const category of Object.keys(config.CONTACT_CATEGORY_LABELS)) {
      expect(config.CONTACT_CATEGORY_EMAILS[category]).toBeTruthy()
    }
    expect(config.CONTACT_CATEGORIES).toHaveLength(
      Object.keys(config.CONTACT_CATEGORY_LABELS).length
    )
  })

  it('ships no social or external link pointing anywhere real', () => {
    for (const url of [
      ...Object.values(config.SOCIAL_LINKS),
      ...Object.values(config.EXTERNAL_LINKS),
    ]) {
      expect(url).toBe('')
    }
    expect(config.AFFILIATIONS).toEqual([])
  })

  it('serves the logo from this repo rather than a third-party host', () => {
    expect(config.ORG_LOGO_URL.startsWith('/')).toBe(true)
  })
})
