/**
 * The download link, from the member's side of it.
 *
 * The thing worth pinning down is *when* a link is minted. A list of forty
 * resources renders forty of these; if any of them signed a URL on render, the
 * page would fire forty storage requests to produce links that mostly go
 * unclicked and expire before anyone touches them. So: no request until the
 * click, and no `storage://` string ever handed to the browser as an href.
 *
 * `resolveFileUrl` is mocked because what is under test here is the component's
 * behaviour around it. That it produces a *working* URL is proved against a
 * live stack in `__tests__/integration/signed-downloads.test.ts`.
 */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FileDownloadLink from '@/components/FileDownloadLink'
import { resolveFileUrl } from '@/lib/fileDownload'

jest.mock('@/lib/fileDownload', () => ({
  resolveFileUrl: jest.fn(),
}))

const mockResolve = resolveFileUrl as jest.MockedFunction<typeof resolveFileUrl>

const SIGNED = 'https://abc.supabase.co/storage/v1/object/sign/portal-resources/f.pdf?token=jwt'

beforeEach(() => {
  mockResolve.mockReset()
  mockResolve.mockResolvedValue(SIGNED)
})

describe('a value that is already fetchable', () => {
  it('renders a plain anchor for an external link, with no round trip', () => {
    render(
      <FileDownloadLink fileRef="https://example.org/handbook.pdf">Download</FileDownloadLink>
    )
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.org/handbook.pdf')
    expect(mockResolve).not.toHaveBeenCalled()
  })

  it('renders a plain anchor for a public-bucket URL', () => {
    render(
      <FileDownloadLink fileRef="https://abc.supabase.co/storage/v1/object/public/email-images/logo.png">
        Download
      </FileDownloadLink>
    )
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      'https://abc.supabase.co/storage/v1/object/public/email-images/logo.png'
    )
    expect(mockResolve).not.toHaveBeenCalled()
  })

  it('renders nothing at all when there is no file', () => {
    const { container } = render(<FileDownloadLink fileRef={null}>Download</FileDownloadLink>)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('a private-bucket reference', () => {
  it('never puts the reference in the href, and mints nothing on render', () => {
    render(
      <FileDownloadLink fileRef="storage://portal-resources/f.pdf">Download</FileDownloadLink>
    )
    expect(screen.getByRole('link').getAttribute('href')).not.toContain('storage://')
    expect(mockResolve).not.toHaveBeenCalled()
  })

  it('mints an attachment link on click and follows it', async () => {
    const user = userEvent.setup()
    const clicked: string[] = []
    const realClick = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (this.href.startsWith('https://')) clicked.push(this.href)
    }

    try {
      render(
        <FileDownloadLink fileRef="storage://portal-resources/1730-rulebook.pdf">
          Download
        </FileDownloadLink>
      )
      await user.click(screen.getByRole('link'))

      await waitFor(() => expect(mockResolve).toHaveBeenCalledTimes(1))
      expect(mockResolve).toHaveBeenCalledWith('storage://portal-resources/1730-rulebook.pdf', {
        download: '1730-rulebook.pdf',
      })
      await waitFor(() => expect(clicked).toEqual([SIGNED]))
    } finally {
      HTMLAnchorElement.prototype.click = realClick
    }
  })

  it('opens a tab for view mode, without asking for an attachment', async () => {
    const user = userEvent.setup()
    const tab = { location: { href: '' }, opener: {} as unknown, close: jest.fn() }
    const openSpy = jest.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)

    try {
      render(
        <FileDownloadLink fileRef="storage://evaluations/report.pdf" mode="view">
          View
        </FileDownloadLink>
      )
      await user.click(screen.getByRole('link'))

      await waitFor(() => expect(tab.location.href).toBe(SIGNED))
      expect(mockResolve).toHaveBeenCalledWith('storage://evaluations/report.pdf', {})
      // The tab is opened inside the click, before the await, or a popup
      // blocker eats it.
      expect(openSpy).toHaveBeenCalledWith('about:blank', '_blank')
    } finally {
      openSpy.mockRestore()
    }
  })

  it('reports a refused mint to the caller instead of navigating', async () => {
    const user = userEvent.setup()
    mockResolve.mockRejectedValue(new Error('Object not found'))
    const onError = jest.fn()

    render(
      <FileDownloadLink fileRef="storage://evaluations/someone-elses.pdf" onError={onError}>
        Download
      </FileDownloadLink>
    )
    await user.click(screen.getByRole('link'))

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1))
    expect(onError.mock.calls[0][0]).toMatch(/Object not found/)
  })
})
