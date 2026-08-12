'use client'

import { useCallback, useEffect, useState } from 'react'
import { parseAPIError } from '@/lib/errorHandling'
import { needsSignedUrl } from '@/lib/storageRefs'
import { resolveFileUrl } from '@/lib/fileDownload'

export interface FileUrlState {
  /** Fetchable URL, or '' while one is being minted. */
  url: string
  isLoading: boolean
  /** Message to show the member, or null. */
  error: string | null
}

export interface FileUrlResult extends FileUrlState {
  /**
   * Throw away the current link and mint another, ignoring the memo.
   *
   * A link is minted once when the viewer opens, and a viewer can stay open
   * longer than the link lives. An `<img>` or a PDF embed has already
   * finished fetching by then and does not care, but a `<video>` or
   * `<audio>` keeps issuing range requests as playback and seeking continue,
   * and every one made after the token expires is refused — the clip stops
   * mid-play. Those elements call this from their `onError`.
   */
  refresh: () => void
}

/**
 * Resolve a stored file reference for something that has to *render* it — a
 * PDF embed, an `<img>`, a `<video>`. Download buttons and open-in-a-tab
 * links should use `<FileDownloadLink>` instead, which mints inside the click
 * and so never hands the browser a URL that has been sitting in an attribute
 * since the modal opened.
 *
 * Values that need no signing (external links, public-bucket URLs) come back
 * on the first render with no round trip, so nothing flashes for them.
 */
export function useFileUrl(value: string | null | undefined): FileUrlResult {
  const immediate = !needsSignedUrl(value)
  const [state, setState] = useState<FileUrlState>(() => ({
    url: immediate ? value || '' : '',
    isLoading: !immediate && !!value,
    error: null,
  }))
  // Bumped by refresh(); re-runs the effect and tells resolveFileUrl to skip
  // its memo, which would otherwise hand back the same dead link.
  const [attempt, setAttempt] = useState(0)

  const refresh = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    if (!value) {
      setState({ url: '', isLoading: false, error: null })
      return
    }

    if (!needsSignedUrl(value)) {
      setState({ url: value, isLoading: false, error: null })
      return
    }

    let cancelled = false
    setState({ url: '', isLoading: true, error: null })

    resolveFileUrl(value, attempt > 0 ? { forceRefresh: true } : {})
      .then((url) => {
        if (!cancelled) setState({ url, isLoading: false, error: null })
      })
      .catch((err) => {
        if (!cancelled) setState({ url: '', isLoading: false, error: parseAPIError(err) })
      })

    return () => {
      cancelled = true
    }
  }, [value, attempt])

  return { ...state, refresh }
}
