/**
 * What the viewer does with a link that expires while it is open.
 *
 * A signed link lives five minutes and a member can sit in front of a document
 * for longer than that. Two things follow, and both are behaviour rather than
 * style:
 *
 *   - No button may carry a URL minted when the modal opened. `Open in New
 *     Tab` used to be `<a href={signedUrl}>`, which is a raw storage 400 six
 *     minutes later, with no message. It mints inside the click now.
 *   - `<video>` and `<audio>` keep fetching after the token dies, because
 *     playback and seeking issue fresh range requests. So they re-mint on
 *     their own error rather than stopping mid-clip.
 *
 * `resolveFileUrl` is mocked; that it produces a working URL is proved against
 * a live stack in `__tests__/integration/signed-downloads.test.ts`.
 */
import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ResourceViewer from '@/components/ResourceViewer'
import { resolveFileUrl } from '@/lib/fileDownload'

jest.mock('@/lib/fileDownload', () => ({
  resolveFileUrl: jest.fn(),
}))

const mockResolve = resolveFileUrl as jest.MockedFunction<typeof resolveFileUrl>

const FIRST = 'https://abc.supabase.co/storage/v1/object/sign/portal-resources/a?token=one'
const SECOND = 'https://abc.supabase.co/storage/v1/object/sign/portal-resources/a?token=two'

beforeEach(() => {
  mockResolve.mockReset()
  mockResolve.mockResolvedValue(FIRST)
})

describe('open in a new tab', () => {
  const resource = {
    title: 'Season plan',
    fileUrl: 'storage://portal-resources/1730-season-plan.docx',
    resourceType: 'file' as const,
  }

  it('is not an anchor holding the URL the modal opened with', async () => {
    render(<ResourceViewer resource={resource} onClose={jest.fn()} />)

    const link = await screen.findByText('Open in New Tab')
    expect(link.closest('a')?.getAttribute('href')).not.toBe(FIRST)
  })

  it('mints a fresh link inside the click', async () => {
    const user = userEvent.setup()
    const tab = { location: { href: '' }, opener: {} as unknown, close: jest.fn() }
    const openSpy = jest.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)

    try {
      render(<ResourceViewer resource={resource} onClose={jest.fn()} />)
      const link = await screen.findByText('Open in New Tab')

      mockResolve.mockResolvedValue(SECOND)
      await user.click(link)

      // The embed's own mint plus this one. The tab gets the second.
      await waitFor(() => expect(tab.location.href).toBe(SECOND))
    } finally {
      openSpy.mockRestore()
    }
  })

  it('says so when the mint is refused, rather than doing nothing', async () => {
    const user = userEvent.setup()
    const openSpy = jest
      .spyOn(window, 'open')
      .mockReturnValue({ location: { href: '' }, close: jest.fn() } as unknown as Window)

    try {
      render(<ResourceViewer resource={resource} onClose={jest.fn()} />)
      const link = await screen.findByText('Open in New Tab')

      mockResolve.mockRejectedValue(new Error('Object not found'))
      await user.click(link)

      expect(await screen.findByRole('alert')).toHaveTextContent(/Object not found/)
    } finally {
      openSpy.mockRestore()
    }
  })
})

describe('a media element whose link has expired', () => {
  const resource = {
    title: 'Positioning clinic',
    fileUrl: 'storage://training-materials/clip.mp4',
    resourceType: 'file' as const,
  }

  // The modal renders through a portal, so the video is under document.body
  // rather than inside the render container.
  const currentVideo = () => document.body.querySelector('video') as HTMLVideoElement | null

  it('mints another one and picks the clip back up where it stopped', async () => {
    render(<ResourceViewer resource={resource} onClose={jest.fn()} />)

    const video = await waitFor(() => {
      const el = currentVideo()
      expect(el).not.toBeNull()
      return el as HTMLVideoElement
    })
    expect(video.getAttribute('src')).toBe(FIRST)

    // Six minutes in: the next range request is refused and the element errors.
    Object.defineProperty(video, 'currentTime', { value: 84, writable: true })
    mockResolve.mockResolvedValue(SECOND)
    fireEvent.error(video)

    await waitFor(() => {
      expect(currentVideo()?.getAttribute('src')).toBe(SECOND)
    })
    // The memo would otherwise hand back the link that just failed.
    expect(mockResolve).toHaveBeenLastCalledWith(resource.fileUrl, { forceRefresh: true })

    const replacement = currentVideo() as HTMLVideoElement
    replacement.play = jest.fn().mockResolvedValue(undefined)
    fireEvent.loadedMetadata(replacement)
    expect(replacement.currentTime).toBe(84)
  })

  it('does not re-mint in a loop when the file itself is the problem', async () => {
    render(<ResourceViewer resource={resource} onClose={jest.fn()} />)

    const video = await waitFor(() => {
      const el = currentVideo()
      expect(el).not.toBeNull()
      return el as HTMLVideoElement
    })

    fireEvent.error(video)
    await waitFor(() => expect(mockResolve).toHaveBeenCalledTimes(2))

    // An unplayable codec fails the same way as an expired token, so a second
    // error inside the rate-limit window is ignored.
    fireEvent.error(currentVideo() as HTMLVideoElement)
    await new Promise((r) => setTimeout(r, 50))
    expect(mockResolve).toHaveBeenCalledTimes(2)
  })
})
