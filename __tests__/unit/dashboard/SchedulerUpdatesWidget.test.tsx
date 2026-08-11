import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import SchedulerUpdatesWidget from '@/components/dashboard/SchedulerUpdatesWidget'

jest.mock('@/lib/api', () => ({
  schedulerUpdatesAPI: {
    getAll: jest.fn(),
  },
}))

// Stub HTMLViewer down to a div exposing the raw HTML, so these tests can
// inspect what the widget passed it. The sanitiser it normally applies has its
// own coverage in __tests__/unit/security/htmlSanitization.test.tsx.
jest.mock('@/components/HTMLViewer', () => ({
  HTMLViewer: ({ content }: { content: string }) => (
    <div data-testid="html-viewer" dangerouslySetInnerHTML={{ __html: content }} />
  ),
}))

import { schedulerUpdatesAPI } from '@/lib/api'

const mockApi = schedulerUpdatesAPI as unknown as { getAll: jest.Mock }

const updates = [
  {
    id: 'u1',
    title: 'New league games posted',
    content: '<p>Check Arbiter for the new assignments.</p>',
    author: 'Scheduler',
    date: '2026-04-01T12:00:00.000Z',
  },
  {
    id: 'u2',
    title: 'Tournament weekend coverage',
    content: '<p>We need more refs for May 10–11.</p>',
    author: 'Executive',
    date: '2026-03-25T12:00:00.000Z',
  },
]

describe('SchedulerUpdatesWidget', () => {
  beforeEach(() => {
    mockApi.getAll.mockReset()
  })

  it('shows a loading skeleton, then renders updates sorted newest-first', async () => {
    let resolve: (v: unknown) => void = () => {}
    mockApi.getAll.mockReturnValueOnce(new Promise((r) => (resolve = r)))

    render(<SchedulerUpdatesWidget />)
    // Header is visible during loading
    expect(screen.getByText('Scheduler Updates')).toBeInTheDocument()

    await act(async () => {
      resolve([updates[1], updates[0]]) // unsorted on purpose
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByText('New league games posted')).toBeInTheDocument()
    })

    // Newest first: 'u1' (Apr 01) before 'u2' (Mar 25).
    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(titles).toEqual(['New league games posted', 'Tournament weekend coverage'])
  })

  it('auto-expands the most recent update on load', async () => {
    mockApi.getAll.mockResolvedValueOnce(updates)
    render(<SchedulerUpdatesWidget />)

    await waitFor(() => {
      expect(screen.getByText('New league games posted')).toBeInTheDocument()
    })

    // Most recent's HTML content is rendered (not just the title).
    const viewers = screen.getAllByTestId('html-viewer')
    expect(viewers).toHaveLength(1)
    expect(viewers[0].innerHTML).toContain('Check Arbiter')
  })

  it('toggles expansion when a row is clicked', async () => {
    mockApi.getAll.mockResolvedValueOnce(updates)
    render(<SchedulerUpdatesWidget />)

    await waitFor(() => {
      expect(screen.getByText('Tournament weekend coverage')).toBeInTheDocument()
    })

    const secondRow = screen.getByRole('button', { name: /Tournament weekend coverage/ })
    fireEvent.click(secondRow)

    await waitFor(() => {
      const viewers = screen.getAllByTestId('html-viewer')
      // First update collapses, second expands.
      expect(viewers).toHaveLength(1)
      expect(viewers[0].innerHTML).toContain('We need more refs')
    })
  })

  it('renders an empty state when the API returns no updates', async () => {
    mockApi.getAll.mockResolvedValueOnce([])
    render(<SchedulerUpdatesWidget />)

    await waitFor(() => {
      expect(screen.getByText('No scheduler updates yet')).toBeInTheDocument()
    })
  })

  it('renders the empty state when the API throws', async () => {
    const consoleErr = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockApi.getAll.mockRejectedValueOnce(new Error('network down'))

    render(<SchedulerUpdatesWidget />)

    await waitFor(() => {
      expect(screen.getByText('No scheduler updates yet')).toBeInTheDocument()
    })
    consoleErr.mockRestore()
  })

  it('links the "All" affordance to the scheduler-updates page', async () => {
    mockApi.getAll.mockResolvedValueOnce(updates)
    render(<SchedulerUpdatesWidget />)

    await waitFor(() => {
      expect(screen.getByText('New league games posted')).toBeInTheDocument()
    })

    const allLink = screen.getByRole('link', { name: /All/ })
    expect(allLink).toHaveAttribute('href', '/portal/scheduler-updates')
  })
})
