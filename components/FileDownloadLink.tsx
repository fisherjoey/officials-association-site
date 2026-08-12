'use client'

import { useState, type ReactNode } from 'react'
import { parseAPIError } from '@/lib/errorHandling'
import { fileNameFromRef, needsSignedUrl } from '@/lib/storageRefs'
import { resolveFileUrl } from '@/lib/fileDownload'

interface FileDownloadLinkProps {
  /** Whatever the row stores: a `storage://` reference or a plain URL. */
  fileRef: string | null | undefined
  /** Name the saved file. Falls back to the object's own name. */
  fileName?: string
  /** `download` saves the file; `view` opens it in a new tab. */
  mode?: 'download' | 'view'
  className?: string
  title?: string
  children: ReactNode
  /** Called with a member-readable message when the link cannot be minted. */
  onError?: (message: string) => void
}

/**
 * A download or open-in-a-tab link for a stored file.
 *
 * For anything already fetchable — an external link, an image in the public
 * bucket — this is a plain anchor and behaves exactly like one. For an object
 * in a private bucket there is no href to give the browser until Supabase has
 * signed one, so the click mints the link and then follows it. Minting on the
 * click rather than on render means the link is always seconds old, and a list
 * of forty resources costs zero requests until somebody wants one of them.
 */
export default function FileDownloadLink({
  fileRef,
  fileName,
  mode = 'download',
  className,
  title,
  children,
  onError,
}: FileDownloadLinkProps) {
  const [isResolving, setIsResolving] = useState(false)

  if (!fileRef) return null

  if (!needsSignedUrl(fileRef)) {
    return mode === 'download' ? (
      <a href={fileRef} download={fileName ?? ''} className={className} title={title}>
        {children}
      </a>
    ) : (
      <a href={fileRef} target="_blank" rel="noopener noreferrer" className={className} title={title}>
        {children}
      </a>
    )
  }

  const saveAs = fileName || fileNameFromRef(fileRef)

  const handleClick = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (isResolving) return
    setIsResolving(true)

    // The tab has to be opened inside the click, before the await — open it
    // afterwards and a popup blocker eats it.
    const tab = mode === 'view' ? window.open('about:blank', '_blank') : null
    if (tab) tab.opener = null

    try {
      const url = await resolveFileUrl(fileRef, mode === 'download' ? { download: saveAs || true } : {})
      if (mode === 'view') {
        if (tab) tab.location.href = url
        else window.open(url, '_blank', 'noopener,noreferrer')
        return
      }
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.rel = 'noopener'
      if (saveAs) anchor.download = saveAs
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
    } catch (err) {
      tab?.close()
      onError?.(parseAPIError(err))
    } finally {
      setIsResolving(false)
    }
  }

  return (
    <a
      href="#"
      onClick={handleClick}
      className={className}
      title={title}
      aria-busy={isResolving || undefined}
    >
      {children}
    </a>
  )
}
