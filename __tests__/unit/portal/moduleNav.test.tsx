/**
 * The nav half of the module flags, with every module on — the shipped default.
 * `moduleNavDisabled.test.tsx` is the same surface with every module off.
 *
 * `__tests__/unit/config/modules.test.ts` proves the flags reach
 * `next.config.ts`, which is what keeps a disabled route out of `out/`. These
 * two files prove the same flags reach what a member actually clicks.
 *
 * A render test rather than a scan of the exported HTML, and that is not
 * laziness: every portal page sits behind `AuthGuard`, so at build time it
 * prerenders to a loading state and the nav is not in the export at all.
 * Looking for dangling portal links in `out/` finds none because it finds no
 * portal links.
 */

import { fireEvent, render, within } from '@testing-library/react'

jest.mock('@/contexts/RoleContext', () => ({
  useRole: () => ({ user: { name: 'Test Admin', email: 'admin@example.org', role: 'admin' } }),
}))

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ logout: jest.fn() }),
}))

// Needs a ThemeProvider above it and has nothing to do with module flags.
jest.mock('@/components/ui/ThemeToggle', () => () => <button type="button" />)

// The dashboard widgets fetch on mount and none of them carries a gated link
// the dashboard does not also render itself.
jest.mock('@/components/dashboard/UpcomingEventsWidget', () => () => <div />)
jest.mock('@/components/dashboard/LatestAnnouncementWidget', () => () => <div />)
jest.mock('@/components/dashboard/LatestNewsletterWidget', () => () => <div />)
jest.mock('@/components/dashboard/SchedulerUpdatesWidget', () => () => <div />)

import PortalHeader from '@/components/layout/PortalHeader'
import PortalDashboard from '@/app/portal/page'

/** Every route a flag owns and something links to. */
const GATED_LINKS = [
  '/portal/evaluations',
  '/portal/mail',
  '/portal/scheduler-updates',
  '/portal/rule-modifications',
  '/portal/newsletter',
  '/portal/admin/logs',
  '/portal/admin/email-history',
]

const hrefs = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))

/** The Updates group is a dropdown, so its links only exist once it is open. */
const openUpdatesMenu = (container: HTMLElement) => {
  const button = within(container).queryByRole('button', { name: /updates/i })
  if (button) fireEvent.click(button)
}

describe('portal navigation with every module on', () => {
  it('links every gated route from the header or the dashboard', () => {
    const header = render(<PortalHeader />)
    openUpdatesMenu(header.container)
    const dashboard = render(<PortalDashboard />)
    const all = [...hrefs(header.container), ...hrefs(dashboard.container)]

    for (const path of GATED_LINKS) {
      expect({ path, linked: all.includes(path) }).toEqual({ path, linked: true })
    }
  })
})
