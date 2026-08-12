/**
 * Every optional module off. The mirror of `moduleNav.test.tsx`.
 *
 * The flags come from the real `lib/siteConfig.ts` reading a real environment,
 * not from a stubbed `MODULES` object: a stub would pass even if the nav had
 * grown its own private copy of the list, which is the failure this pair of
 * files is here to catch.
 *
 * Getting the environment set before the module evaluates takes the mock
 * factory below. `jest.mock` is hoisted above the imports; a plain assignment
 * at the top of the file is not, and `lib/siteConfig.ts` reads
 * `process.env.NEXT_PUBLIC_MODULE_*` once, when it is first required.
 */

import { fireEvent, render, within } from '@testing-library/react'

const MODULE_ENV = [
  'NEXT_PUBLIC_MODULE_EVALUATIONS',
  'NEXT_PUBLIC_MODULE_STATISTICS',
  'NEXT_PUBLIC_MODULE_NEWSLETTER',
  'NEXT_PUBLIC_MODULE_RULE_MODIFICATIONS',
  'NEXT_PUBLIC_MODULE_SCHEDULER_UPDATES',
  'NEXT_PUBLIC_MODULE_MAIL',
  'NEXT_PUBLIC_MODULE_ADMIN_LOGS',
  'NEXT_PUBLIC_MODULE_ADMIN_EMAIL_HISTORY',
]

jest.mock('@/lib/siteConfig', () => {
  for (const name of [
    'NEXT_PUBLIC_MODULE_EVALUATIONS',
    'NEXT_PUBLIC_MODULE_STATISTICS',
    'NEXT_PUBLIC_MODULE_NEWSLETTER',
    'NEXT_PUBLIC_MODULE_RULE_MODIFICATIONS',
    'NEXT_PUBLIC_MODULE_SCHEDULER_UPDATES',
    'NEXT_PUBLIC_MODULE_MAIL',
    'NEXT_PUBLIC_MODULE_ADMIN_LOGS',
    'NEXT_PUBLIC_MODULE_ADMIN_EMAIL_HISTORY',
  ]) {
    process.env[name] = 'false'
  }
  return jest.requireActual('@/lib/siteConfig')
})

// An admin, built out of the real role model rather than a hand-written stub.
// The nav now asks two independent questions — is the module on, and does this
// principal pass — and only the first belongs to these files. Running the
// second through `lib/roles.ts` keeps a role regression failing in the role
// tests instead of showing up here as a module flag that looks broken.
jest.mock('@/contexts/RoleContext', () => {
  const roles = jest.requireActual('@/lib/roles')
  const principal = { role: 'admin' as const, capabilities: [] as never[] }
  return {
    useRole: () => ({
      user: { name: 'Test Admin', email: 'admin@example.org', ...principal },
      principal,
      isAuthenticated: true,
      hasRole: (minimum: 'member' | 'executive' | 'admin') => roles.hasRole(principal, minimum),
      can: (capability: never) => roles.can(principal, capability),
    }),
  }
})

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ logout: jest.fn() }),
}))

// Needs a ThemeProvider above it and has nothing to do with module flags.
jest.mock('@/components/ui/ThemeToggle', () => () => <button type="button" />)

jest.mock('@/components/dashboard/UpcomingEventsWidget', () => () => <div />)
jest.mock('@/components/dashboard/LatestAnnouncementWidget', () => () => <div />)
jest.mock('@/components/dashboard/LatestNewsletterWidget', () => () => <div />)
jest.mock('@/components/dashboard/SchedulerUpdatesWidget', () => () => <div />)

import PortalHeader from '@/components/layout/PortalHeader'
import PortalDashboard from '@/app/portal/page'
import PortalAdmin from '@/app/portal/admin/page'
import { MODULES, PORTAL_MODULES } from '@/lib/siteConfig'

const hrefs = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))

/** The Updates group is a dropdown, so its links only exist once it is open. */
const openUpdatesMenu = (container: HTMLElement) => {
  const button = within(container).queryByRole('button', { name: /updates/i })
  if (button) fireEvent.click(button)
}

afterAll(() => {
  for (const name of MODULE_ENV) delete process.env[name]
})

describe('portal navigation with every module off', () => {
  it('reads the flags as off', () => {
    expect(Object.values(MODULES)).toEqual(Object.values(MODULES).map(() => false))
  })

  it('links no gated route from the header, the dashboard or the admin index', () => {
    const rendered = [render(<PortalHeader />), render(<PortalDashboard />), render(<PortalAdmin />)]
    rendered.forEach((view) => openUpdatesMenu(view.container))
    const all = rendered.flatMap((view) => hrefs(view.container))
    const gated = PORTAL_MODULES.map((mod) => mod.path)

    expect(all.filter((href) => href !== null && gated.includes(href))).toEqual([])
  })

  it('leaves the core routes alone', () => {
    const header = render(<PortalHeader />)
    openUpdatesMenu(header.container)
    const dashboard = render(<PortalDashboard />)
    const all = [...hrefs(header.container), ...hrefs(dashboard.container)]

    for (const core of ['/portal', '/portal/calendar', '/portal/resources', '/portal/news', '/portal/profile']) {
      expect({ core, linked: all.includes(core) }).toEqual({ core, linked: true })
    }
  })

  it('keeps the admin index usable rather than rendering an empty page', () => {
    const admin = render(<PortalAdmin />)

    // Public content, contact submissions and service requests are core, so
    // three sections survive with their links intact.
    expect(hrefs(admin.container)).toContain('/portal/admin/public-content/news')
    expect(hrefs(admin.container)).toContain('/portal/admin/service-requests')
  })
})
