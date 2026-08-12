/**
 * Site configuration — the one file you edit to rebrand this template.
 *
 * Every organisation-specific value the site renders lives here: names, colours,
 * logo, contact routing, social links, portal feature labels. Nothing outside
 * this file should hardcode an organisation's identity.
 *
 * The shipped defaults are deliberate placeholders ("Your Officials
 * Association", `example.org`, empty social links). They are meant to look
 * unfilled, so anything you have missed is obvious on the rendered page rather
 * than quietly wrong. `example.org` is reserved by RFC 2606 and can never
 * belong to a real organisation, so an unconfigured deploy cannot leak mail to
 * a stranger.
 *
 * ## Overriding with environment variables
 *
 * Every identity and branding value below reads an optional `NEXT_PUBLIC_*`
 * environment variable and falls back to the literal placeholder. The prefix is
 * **mandatory, not a convention**: over forty client components import from this
 * module, and Next.js only substitutes `NEXT_PUBLIC_*` reads into the browser
 * bundle. A read of an unprefixed name (`process.env.ORG_NAME`) compiles to
 * `undefined` in the browser, so the value would fall through to the
 * placeholder on the client while the server-rendered HTML carried the real
 * one — split branding plus a React hydration mismatch on every branded string.
 * There is deliberately no unprefixed alias for any of them; adding one back
 * reopens exactly that.
 *
 * The reads are written out longhand (`process.env.NEXT_PUBLIC_ORG_NAME`, not
 * `process.env[name]`) for the same reason: the bundler substitutes them
 * textually, so a computed lookup evaluates to `undefined` in the browser.
 *
 * The `EMAIL_*` role mailboxes further down are the one deliberate exception.
 * They are unprefixed because only `netlify/functions/**` and other server code
 * read them. Do not add `NEXT_PUBLIC_` aliases for those, and do not read them
 * from a client component.
 *
 * Be exact about what the missing prefix buys, because it is easy to overstate
 * and this file is on the repo's risk-surfaces list. The prefix rule governs
 * the **override**, not the default. `process.env.EMAIL_SECRETARY` compiles to
 * `undefined` in the browser, so an adopter's override never leaves the server
 * — but the value it falls through to is an ordinary string concatenation,
 * `secretary@` + the (prefixed, therefore public) mail domain. Being unprefixed
 * does nothing to hide that. It ships wherever the client module graph can
 * reach it.
 *
 * What actually keeps the addresses out of the browser bundle is that nothing
 * under `app/`, `components/` or `contexts/` references them, so the bundler
 * drops them. That is a live property, not a structural one, and it has been
 * broken once already: see the note above `CONTACT_CATEGORIES`. One client
 * import of a role mailbox — or of anything that touches one at module scope —
 * puts all of them back into every page chunk that evaluates this module,
 * including pages with no mail feature on them.
 * `__tests__/unit/config/siteConfig.test.ts` asserts the property so the next
 * regression fails a test rather than shipping quietly.
 *
 * All overrides are resolved at **build time** for anything the pages render.
 * Nothing here is read from a request, a header, or a query string. See the
 * security note on `getAuthCallbackUrl` before changing that.
 */

// ---------------------------------------------------------------------------
// Organisation identity
// ---------------------------------------------------------------------------

export const ORG_NAME = process.env.NEXT_PUBLIC_ORG_NAME || 'Your Officials Association'

/** Acronym or short form used in headings, nav and email subjects. */
export const ORG_SHORT_NAME = process.env.NEXT_PUBLIC_ORG_SHORT_NAME || 'Your Association'

export const ORG_TAGLINE = process.env.NEXT_PUBLIC_ORG_TAGLINE || 'Add your tagline here'

/** Full location string, e.g. "Springfield, Example Region, Country". */
export const ORG_LOCATION = process.env.NEXT_PUBLIC_ORG_LOCATION || 'Your City, Your Region'

/** City alone, for prose that reads "officiating in {city}". */
export const ORG_CITY = process.env.NEXT_PUBLIC_ORG_CITY || 'your city'

/** Province / state / region alone. */
export const ORG_REGION = process.env.NEXT_PUBLIC_ORG_REGION || 'your region'

/**
 * The sport this association officiates, lowercase, so it reads correctly
 * mid-sentence.
 *
 * The default is `basketball` rather than a placeholder, and deliberately so:
 * a sport is not an organisation's identity, and page copy under `app/` still
 * describes basketball-specific certification levels and rulebooks in places no
 * config value reaches. Leaving this as a placeholder would give a site that
 * says "your sport" in one paragraph and "basketball" in the next. Changing it
 * is step one of a sport rebrand, not the whole job.
 */
export const ORG_SPORT = process.env.NEXT_PUBLIC_ORG_SPORT || 'basketball'

/** Year the association was founded — rendered in the About page history. */
export const ORG_FOUNDED_YEAR = process.env.NEXT_PUBLIC_ORG_FOUNDED_YEAR || 'YYYY'

/** Roughly how many active officials the association has today. */
export const ORG_MEMBER_COUNT = process.env.NEXT_PUBLIC_ORG_MEMBER_COUNT || 'NNN'

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

/**
 * Canonical origin for this deploy. Set `NEXT_PUBLIC_SITE_URL`; it is required
 * for a real deploy, and there is no other source.
 *
 * Netlify does supply `URL` and `DEPLOY_PRIME_URL` during the build, and this
 * used to read them. It cannot: they are unprefixed, so they reach the server
 * render and the Netlify Functions but never the browser bundle, which left the
 * client resolving every absolute URL — portal links, contact links, the auth
 * callback — to the `example.org` placeholder while the prerendered HTML
 * carried the real origin. If you want Netlify's value, promote it in the build
 * command so it is a real `NEXT_PUBLIC_` variable at compile time:
 *
 *   NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-$URL}" npm run build
 *
 * Note that `DEPLOY_PRIME_URL` differs per deploy preview, so pinning
 * `NEXT_PUBLIC_SITE_URL` to the production origin is usually what you want —
 * `getAuthCallbackUrl()` is built from this and the callback has to match what
 * the auth provider allow-lists.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://example.org'

export const PORTAL_PATH = '/portal'
export const CONTACT_PATH = '/contact'

/**
 * Path the auth provider redirects back to. Deliberately a module constant and
 * NOT environment-overridable — see `getAuthCallbackUrl`.
 */
const AUTH_CALLBACK_PATH = '/auth/callback'

// ---------------------------------------------------------------------------
// Branding — logo, favicons, colours
// ---------------------------------------------------------------------------

/** Logo shown in the header, footer, portal and auth screens. */
export const ORG_LOGO_URL =
  process.env.NEXT_PUBLIC_ORG_LOGO_URL || '/images/logos/org-logo.png'

export const ORG_LOGO_ALT = `${ORG_SHORT_NAME} logo`

/** Favicon and app-icon paths, all served from `public/`. */
export const FAVICONS = {
  ico: '/images/icons/favicon.ico',
  png16: '/images/icons/favicon-16x16.png',
  png32: '/images/icons/favicon-32x32.png',
  appleTouch: '/images/icons/apple-touch-icon.png',
  android192: '/images/icons/android-chrome-192x192.png',
  android512: '/images/icons/android-chrome-512x512.png',
  manifest: '/images/icons/site.webmanifest',
}

/**
 * Brand palette. `tailwind.config.ts` imports this and registers each entry as
 * a `brand-*` colour, so `bg-brand-primary` and friends follow whatever you set
 * here. Tailwind generates CSS at build time, so these are build-time values.
 *
 * `NEXT_PUBLIC_` on colours looks redundant — Tailwind reads them in Node, not
 * in the browser — but `BRAND_COLORS` is also reachable from client components
 * through `siteConfig.brand.colors`. Unprefixed names would give a component
 * that reads a colour the default while the generated CSS carried the override,
 * which is the same split the identity values above had.
 */
export const BRAND_COLORS = {
  primary: process.env.NEXT_PUBLIC_BRAND_COLOR_PRIMARY || '#ff6b35',
  primaryLight: process.env.NEXT_PUBLIC_BRAND_COLOR_PRIMARY_LIGHT || '#ff8c5a',
  secondary: process.env.NEXT_PUBLIC_BRAND_COLOR_SECONDARY || '#2c3e50',
  dark: process.env.NEXT_PUBLIC_BRAND_COLOR_DARK || '#1a1a1a',
  accent: process.env.NEXT_PUBLIC_BRAND_COLOR_ACCENT || '#3498db',
}

// ---------------------------------------------------------------------------
// Social links
// ---------------------------------------------------------------------------

/**
 * Leave a value empty to hide that icon entirely. Shipping with all of them
 * empty is intentional: an unconfigured deploy must not link anywhere real.
 */
export const SOCIAL_LINKS = {
  facebook: process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK || '',
  instagram: process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM || '',
  twitter: process.env.NEXT_PUBLIC_SOCIAL_TWITTER || '',
  youtube: process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE || '',
}

/** Handle shown next to the social links on the home page, e.g. "@yourorg". */
export const SOCIAL_HANDLE = process.env.NEXT_PUBLIC_SOCIAL_HANDLE || ''

// ---------------------------------------------------------------------------
// External links
// ---------------------------------------------------------------------------

/**
 * Third-party services this association uses. Empty means "not configured" and
 * the corresponding link or embed is not rendered.
 */
export const EXTERNAL_LINKS = {
  /** Game assignment system members log into. */
  assigning: process.env.NEXT_PUBLIC_LINK_ASSIGNING || '',
  /** Video review / film study platform. */
  filmStudy: process.env.NEXT_PUBLIC_LINK_FILM_STUDY || '',
  /** Members' chat community (Discord, Slack, …). */
  community: process.env.NEXT_PUBLIC_LINK_COMMUNITY || '',
  /** Externally hosted resource library. */
  resourceCentre: process.env.NEXT_PUBLIC_LINK_RESOURCE_CENTRE || '',
  /** Externally hosted membership application form, embedded in an iframe. */
  applicationForm: process.env.NEXT_PUBLIC_LINK_APPLICATION_FORM || '',
}

/**
 * Governing bodies and partners listed in the footer. Ships empty so no real
 * organisation is linked from an unconfigured deploy.
 */
export interface Affiliation {
  name: string
  url: string
}

export const AFFILIATIONS: Affiliation[] = []

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

export const EMAIL_DOMAIN = process.env.NEXT_PUBLIC_EMAIL_DOMAIN || 'example.org'

/**
 * Role mailboxes. Read only by server code — see the note at the top of the
 * file for what that does and does not guarantee.
 * `netlify/functions/contact-form.ts` routes from its own import of
 * `CONTACT_CATEGORY_EMAILS`, so no client component needs an address, and none
 * of these should gain a `NEXT_PUBLIC_` alias.
 *
 * Setting `NEXT_PUBLIC_EMAIL_DOMAIN` alone moves all eleven at once and is the
 * normal way to configure mail. Be clear about what that publishes: the domain
 * is prefixed, so the domain itself ships in the browser bundle. The addresses
 * derived from it do not, but they are only ever `<role>@<your domain>` — so
 * treat the naming scheme as guessable and use the individual overrides below
 * for any role whose real inbox you would rather not have derived.
 */
export const EMAIL_NO_REPLY = process.env.EMAIL_NO_REPLY || `no-reply@${EMAIL_DOMAIN}`
export const EMAIL_ANNOUNCEMENTS = process.env.EMAIL_ANNOUNCEMENTS || `announcements@${EMAIL_DOMAIN}`
export const EMAIL_SCHEDULER = process.env.EMAIL_SCHEDULER || `scheduler@${EMAIL_DOMAIN}`
export const EMAIL_TREASURER = process.env.EMAIL_TREASURER || `treasurer@${EMAIL_DOMAIN}`
export const EMAIL_SECRETARY = process.env.EMAIL_SECRETARY || `secretary@${EMAIL_DOMAIN}`
export const EMAIL_MEMBER_SERVICES = process.env.EMAIL_MEMBER_SERVICES || `memberservices@${EMAIL_DOMAIN}`
export const EMAIL_EDUCATION = process.env.EMAIL_EDUCATION || `education@${EMAIL_DOMAIN}`
export const EMAIL_WEBMASTER = process.env.EMAIL_WEBMASTER || `webmaster@${EMAIL_DOMAIN}`
export const EMAIL_PERFORMANCE = process.env.EMAIL_PERFORMANCE || `performance@${EMAIL_DOMAIN}`
export const EMAIL_RECRUITING = process.env.EMAIL_RECRUITING || `recruiting@${EMAIL_DOMAIN}`
/**
 * General-purpose inbox used as the site's public contact address by
 * server-rendered content (`lib/content.ts`).
 *
 * Public in the sense that it is meant to be seen, but still unprefixed like
 * the rest of this block, so it is only safe to render from server code. A
 * client component that printed it would show `info@<domain>` while the
 * prerendered HTML showed the `EMAIL_INFO` override — the split-branding bug
 * described at the top of the file. If you need it in the browser, promote it
 * to `NEXT_PUBLIC_EMAIL_INFO` and drop it from the server-only list in
 * `__tests__/unit/config/siteConfig.test.ts` rather than reading it as it is.
 */
export const EMAIL_INFO = process.env.EMAIL_INFO || `info@${EMAIL_DOMAIN}`

// Contact Form Category Mapping
export const CONTACT_CATEGORY_EMAILS: Record<string, string> = {
  general: EMAIL_SECRETARY,
  scheduling: EMAIL_SCHEDULER,
  billing: EMAIL_TREASURER,
  membership: EMAIL_MEMBER_SERVICES,
  education: EMAIL_EDUCATION,
  website: EMAIL_WEBMASTER,
  performance: EMAIL_PERFORMANCE,
  recruiting: EMAIL_RECRUITING,
  other: EMAIL_SECRETARY,
}

// Contact Form Category Labels
export const CONTACT_CATEGORY_LABELS: Record<string, string> = {
  general: 'General Inquiry',
  scheduling: 'Officiating Services / Booking',
  billing: 'Billing / Payments',
  membership: 'Membership',
  education: 'Education / Training',
  website: 'Website / Technical',
  performance: 'Performance / Evaluation',
  recruiting: 'Recruitment',
  other: 'Other',
}

/**
 * Category order for the contact form. Value and label only — deliberately not
 * the routing address.
 *
 * This list used to carry each category's destination as well, so that a new
 * category could not be added to the form without being given one. That pairing
 * is what put all eight routing mailboxes into the browser bundle:
 * `components/forms/ContactForm.tsx` imports this list, the join runs at module
 * scope, and an eagerly-computed reference is not something the bundler can
 * drop. Every page chunk that evaluated this module therefore carried the
 * addresses — the home page, the layout, even the theme demo. `ContactForm`
 * reads `value` and `label` and never had a use for `email`; the form posts a
 * category name and `netlify/functions/contact-form.ts` resolves it to an
 * address server-side.
 *
 * The invariant the pairing protected is asserted directly in
 * `__tests__/unit/config/siteConfig.test.ts` instead. Do not put the address
 * back on this shape.
 */
export const CONTACT_CATEGORIES: { value: string; label: string }[] =
  Object.keys(CONTACT_CATEGORY_LABELS).map((value) => ({
    value,
    label: CONTACT_CATEGORY_LABELS[value],
  }))

// Email Subject Templates
export const EMAIL_SUBJECTS = {
  invite: `You're Invited to Join ${ORG_SHORT_NAME}!`,
  passwordReset: `Reset Your ${ORG_SHORT_NAME} Portal Password`,
  migrationPasswordReset: `${ORG_SHORT_NAME} Portal Update - Set Your New Password`,
  contactFormPrefix: '[Contact Form]',
}

// ---------------------------------------------------------------------------
// Portal
// ---------------------------------------------------------------------------

// Member Portal Feature Names (can be customized)
export const PORTAL_FEATURES = {
  resources: 'Resources',
  resourcesDescription: 'Training materials, rulebooks, and guides',
  newsletter: 'Newsletter',
  newsletterDescription: 'Our official newsletter',
  calendar: 'Calendar',
  calendarDescription: 'Upcoming events and training sessions',
  ruleModifications: 'Rule Modifications',
  ruleModificationsDescription: 'League-specific rule changes',
  serviceRequests: 'Service Requests',
  serviceRequestsDescription: 'Requests for officials sent in from the public site',
}

/** Display name for the newsletter, e.g. "The Sideline". */
export const NEWSLETTER_NAME =
  process.env.NEXT_PUBLIC_NEWSLETTER_NAME || PORTAL_FEATURES.newsletter

/**
 * Display name for the requests that arrive from the public `/get-officials`
 * form, e.g. "Game Requests" or "Officiating Services Agreements". The route is
 * `/portal/admin/service-requests` whatever you call it here.
 */
export const SERVICE_REQUESTS_NAME =
  process.env.NEXT_PUBLIC_SERVICE_REQUESTS_NAME || PORTAL_FEATURES.serviceRequests

/** Byline used when the portal publishes news on the association's behalf. */
export const DEFAULT_AUTHOR = `${ORG_SHORT_NAME} Executive`

/**
 * Prefix for every localStorage and cache key this app writes. Changing it
 * namespaces a new deploy away from data left by a previous one.
 */
export const STORAGE_PREFIX = process.env.NEXT_PUBLIC_STORAGE_PREFIX || 'oas_'

// ---------------------------------------------------------------------------
// Optional portal modules
// ---------------------------------------------------------------------------

/**
 * Parts of the portal not every association wants. Turn one off here and both
 * its navigation entries and its route disappear.
 *
 * ## Why the two have to come from one place
 *
 * This site is a static export. There is no server to answer a request with a
 * 404, so "disabled" cannot mean "the route rejects you at request time" — it
 * has to mean the route is never written into `out/` at all. That is a
 * build-time decision, made in `next.config.ts`. Hiding a nav link is a
 * render-time decision, made in a component. Before this block those were two
 * separate edits, and deleting a route left its links pointing at a page that
 * no longer existed. A dangling link in a static export is a silent 404 on a
 * live site, not a build error, so nothing caught it.
 *
 * `MODULES` is the single answer both questions read.
 *
 * ## How the route half works
 *
 * Each optional route's page file is named `page.module-<key>.tsx` instead of
 * `page.tsx`. Next.js only treats a file as a route when its extension is in
 * `pageExtensions`, and `next.config.ts` builds that list from the flags below
 * via `enabledModulePageExtensions()`. A disabled module's file is therefore
 * just a file: not a route, not compiled, not exported, not in `out/`.
 *
 * The consequence worth knowing: this is decided when you build, not when
 * someone visits. Flipping a flag needs a rebuild and a redeploy. Nothing is
 * revoked from a browser that already has the old bundle, and the Netlify
 * function and Supabase table behind a disabled module are untouched — read
 * "Optional modules" in the README before you assume a flag is an access
 * control. It is not. It is a way to ship less site.
 *
 * ## Adding a module
 *
 * Add the key to `ModuleKey`, a flag to `MODULES`, an entry to
 * `PORTAL_MODULES`, and rename the route's `page.tsx` to
 * `page.module-<kebab-key>.tsx`. `__tests__/unit/config/modules.test.ts` fails
 * if any of those four drift apart.
 */
export type ModuleKey =
  | 'evaluations'
  | 'statistics'
  | 'newsletter'
  | 'ruleModifications'
  | 'schedulerUpdates'
  | 'mail'
  | 'adminLogs'
  | 'adminEmailHistory'

/**
 * Resolve one flag from its environment override.
 *
 * Strict on purpose. A typo like `NEXT_PUBLIC_MODULE_MAIL=off` under a loose
 * parse means the module stays on and nobody finds out until they notice the
 * route in production, so anything other than `true` or `false` stops the
 * build. The variable name is passed separately because the read itself has to
 * be written out longhand — see the note at the top of this file.
 */
const moduleFlag = (name: string, raw: string | undefined, fallback: boolean): boolean => {
  if (raw === undefined || raw === '') return fallback
  if (raw === 'true') return true
  if (raw === 'false') return false
  throw new Error(`${name} must be "true" or "false", got ${JSON.stringify(raw)}`)
}

/**
 * Every optional module ships on, so an adopter sees the whole portal before
 * deciding what to remove.
 */
export const MODULES: Record<ModuleKey, boolean> = {
  evaluations: moduleFlag(
    'NEXT_PUBLIC_MODULE_EVALUATIONS',
    process.env.NEXT_PUBLIC_MODULE_EVALUATIONS,
    true
  ),
  statistics: moduleFlag(
    'NEXT_PUBLIC_MODULE_STATISTICS',
    process.env.NEXT_PUBLIC_MODULE_STATISTICS,
    true
  ),
  newsletter: moduleFlag(
    'NEXT_PUBLIC_MODULE_NEWSLETTER',
    process.env.NEXT_PUBLIC_MODULE_NEWSLETTER,
    true
  ),
  ruleModifications: moduleFlag(
    'NEXT_PUBLIC_MODULE_RULE_MODIFICATIONS',
    process.env.NEXT_PUBLIC_MODULE_RULE_MODIFICATIONS,
    true
  ),
  schedulerUpdates: moduleFlag(
    'NEXT_PUBLIC_MODULE_SCHEDULER_UPDATES',
    process.env.NEXT_PUBLIC_MODULE_SCHEDULER_UPDATES,
    true
  ),
  mail: moduleFlag('NEXT_PUBLIC_MODULE_MAIL', process.env.NEXT_PUBLIC_MODULE_MAIL, true),
  adminLogs: moduleFlag(
    'NEXT_PUBLIC_MODULE_ADMIN_LOGS',
    process.env.NEXT_PUBLIC_MODULE_ADMIN_LOGS,
    true
  ),
  adminEmailHistory: moduleFlag(
    'NEXT_PUBLIC_MODULE_ADMIN_EMAIL_HISTORY',
    process.env.NEXT_PUBLIC_MODULE_ADMIN_EMAIL_HISTORY,
    true
  ),
}

export interface PortalModule {
  key: ModuleKey
  /**
   * The route this module owns. Nav code does not name modules — it passes
   * hrefs to `isRouteEnabled`, which looks them up here, so a link and the page
   * it points at cannot disagree about whether the module is on.
   */
  path: string
  /** Label for nav entries and dashboard tiles. */
  label: string
}

export const PORTAL_MODULES: readonly PortalModule[] = [
  { key: 'evaluations', path: '/portal/evaluations', label: 'Evaluations' },
  { key: 'statistics', path: '/portal/statistics', label: 'Statistics' },
  { key: 'newsletter', path: '/portal/newsletter', label: NEWSLETTER_NAME },
  {
    key: 'ruleModifications',
    path: '/portal/rule-modifications',
    label: PORTAL_FEATURES.ruleModifications,
  },
  { key: 'schedulerUpdates', path: '/portal/scheduler-updates', label: 'Scheduler Updates' },
  { key: 'mail', path: '/portal/mail', label: 'Send Email' },
  { key: 'adminLogs', path: '/portal/admin/logs', label: 'System Logs' },
  { key: 'adminEmailHistory', path: '/portal/admin/email-history', label: 'Email History' },
]

/**
 * Whether a portal link should be rendered.
 *
 * Takes an href rather than a module key so that link lists stay lists of
 * links. A path no module claims is a core route and always passes.
 */
export const isRouteEnabled = (href: string): boolean => {
  const owner = PORTAL_MODULES.find((mod) => mod.path === href)
  return owner ? MODULES[owner.key] : true
}

/**
 * The file extension that makes a module's page file a route:
 * `adminEmailHistory` → `module-admin-email-history.tsx`, so the file is
 * `app/portal/admin/email-history/page.module-admin-email-history.tsx`.
 */
export const modulePageExtension = (key: ModuleKey): string =>
  `module-${key.replace(/[A-Z]/g, (upper) => `-${upper.toLowerCase()}`)}.tsx`

/**
 * What `next.config.ts` appends to `pageExtensions`. Extensions for disabled
 * modules are left out, and Next.js then treats those page files as ordinary
 * colocated source: no route, no chunk, nothing in `out/`.
 */
export const enabledModulePageExtensions = (): string[] =>
  PORTAL_MODULES.filter((mod) => MODULES[mod.key]).map((mod) => modulePageExtension(mod.key))

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

/**
 * The role model is defined in `lib/roles.ts` and re-exported here, because
 * this file is the one an adopter is told to open and roles are one of the
 * things they will want to change.
 *
 * The dependency runs one way — `siteConfig` imports `roles`, never the reverse
 * — so the predicates stay usable from `netlify/functions/**` without dragging
 * the branding module's environment reads along, and so a future import cycle
 * cannot form.
 *
 * What is safely changeable, in decreasing order of ease:
 *
 *  - **Labels**, via `NEXT_PUBLIC_ROLE_LABEL_*` and
 *    `NEXT_PUBLIC_CAPABILITY_LABEL_*`. Nothing in SQL reads them. Calling your
 *    executives "the board" is one line in `.env`.
 *  - **The capability list**, in `lib/roles.ts`. The database constrains the
 *    shape of `members.capabilities` and not its contents, and
 *    `has_capability()` is generic, so adding or renaming a capability needs no
 *    migration — with one exception, `evaluator`, which an RLS policy names
 *    directly. `__tests__/unit/config/roles.test.ts` fails if that pairing
 *    breaks.
 *  - **The structural ladder**, which is enumerated by a CHECK constraint in
 *    `supabase/migrations/20260810001500_role_model.sql`. Changing those three
 *    names is a migration, and the same test holds the two lists together.
 */
export {
  STRUCTURAL_ROLES,
  STRUCTURAL_ROLE_LABELS,
  DEFAULT_STRUCTURAL_ROLE,
  CAPABILITIES,
  CAPABILITY_LABELS,
  can,
  hasRole,
  isAdmin,
  isAdminOrExecutive,
  canViewAllEvaluations,
  toPrincipal,
  describeRole,
  describePrincipal,
  type StructuralRole,
  type Capability,
  type Principal,
} from './roles'

import { roleModel } from './roles'

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

// Get copyright year
export const getCopyrightYear = (): number => new Date().getFullYear()

// Generate full URLs
export const getPortalUrl = (): string => `${SITE_URL}${PORTAL_PATH}`
export const getContactUrl = (category?: string): string =>
  category ? `${SITE_URL}${CONTACT_PATH}?category=${category}` : `${SITE_URL}${CONTACT_PATH}`
/**
 * SECURITY: never thread user-supplied input (e.g. ?redirect= query
 * params) into this URL or into Supabase generateLink({ redirectTo }).
 * Doing so turns the auth flow into an open redirect through Supabase's
 * allow-listed domain. Keep the callback URL hardcoded here; deep-link
 * targets should be carried in app-level state, not in redirectTo.
 *
 * Concretely, that means this function must keep all three of these
 * properties, and a change that drops any of them reopens the hole:
 *
 *  1. It takes no parameters. Adding one gives a caller somewhere to put a
 *     query string.
 *  2. Its origin is `SITE_URL`, which resolves from build-time environment
 *     only — never from `window.location`, a `Host` header, or a request.
 *  3. Its path is the module constant `AUTH_CALLBACK_PATH`, not configurable.
 *     An attacker who could set the path could point the callback at an
 *     open-redirect endpoint on your own origin and walk the token out.
 *
 * `__tests__/unit/config/siteConfig.test.ts` asserts all three.
 */
export const getAuthCallbackUrl = (): string => `${SITE_URL}${AUTH_CALLBACK_PATH}`

// Configuration object for easy import
export const siteConfig = {
  org: {
    name: ORG_NAME,
    shortName: ORG_SHORT_NAME,
    tagline: ORG_TAGLINE,
    location: ORG_LOCATION,
    city: ORG_CITY,
    region: ORG_REGION,
    sport: ORG_SPORT,
    foundedYear: ORG_FOUNDED_YEAR,
    memberCount: ORG_MEMBER_COUNT,
    logoUrl: ORG_LOGO_URL,
    logoAlt: ORG_LOGO_ALT,
  },
  urls: {
    site: SITE_URL,
    portal: getPortalUrl(),
    contact: getContactUrl,
    authCallback: getAuthCallbackUrl(),
    external: EXTERNAL_LINKS,
  },
  brand: {
    colors: BRAND_COLORS,
    favicons: FAVICONS,
  },
  social: SOCIAL_LINKS,
  socialHandle: SOCIAL_HANDLE,
  affiliations: AFFILIATIONS,
  /**
   * Client-safe mail values only. The role mailboxes and the category routing
   * map are deliberately absent: this object is what a component reaches for
   * when it does `import siteConfig from '@/lib/siteConfig'`, and listing an
   * address here would hand every one of them to the browser bundle the moment
   * a single client component did that. Server code imports the addresses by
   * name instead.
   */
  email: {
    domain: EMAIL_DOMAIN,
    categoryLabels: CONTACT_CATEGORY_LABELS,
    categories: CONTACT_CATEGORIES,
    subjects: EMAIL_SUBJECTS,
  },
  features: PORTAL_FEATURES,
  modules: MODULES,
  /** Structural ladder, capability list and their labels. See `lib/roles.ts`. */
  roles: roleModel,
  newsletterName: NEWSLETTER_NAME,
  serviceRequestsName: SERVICE_REQUESTS_NAME,
  defaultAuthor: DEFAULT_AUTHOR,
  storagePrefix: STORAGE_PREFIX,
  getCopyrightYear,
}

export default siteConfig
