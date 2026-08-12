'use client'

import { useEffect, useState } from 'react'
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

/**
 * Resolve a stored file reference for something that has to *render* it — a
 * PDF embed, an `<img>`, a `<video>`. Download buttons should use
 * `<FileDownloadLink>` instead, which mints on click and so never hands the
 * browser a link that has been sitting around.
 *
 * Values that need no signing (external links, public-bucket URLs) come back
 * on the first render with no round trip, so nothing flashes for them.
 */
export function useFileUrl(value: string | null | undefined): FileUrlState {
  const immediate = !needsSignedUrl(value)
  const [state, setState] = useState<FileUrlState>(() => ({
    url: immediate ? value || '' : '',
    isLoading: !immediate && !!value,
    error: null,
  }))

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

    resolveFileUrl(value)
      .then((url) => {
        if (!cancelled) setState({ url, isLoading: false, error: null })
      })
      .catch((err) => {
        if (!cancelled) setState({ url: '', isLoading: false, error: parseAPIError(err) })
      })

    return () => {
      cancelled = true
    }
  }, [value])

  return state
}
