'use client'

import { useMemo } from 'react'
import { sanitizeHtml } from '@/lib/sanitizeHtml'

interface HTMLViewerProps {
  content: string
  className?: string
  compact?: boolean
}

/**
 * Renders stored rich text as HTML, and is the only place in the app allowed to
 * do so. The XSS guard lives here rather than at the dozen-odd call sites
 * because one of those would get missed.
 *
 * This file deliberately knows nothing about the editor. It used to live inside
 * the editor's own module, which put the sanitiser in the blast radius of a
 * vendor swap - the render path and the write path have no reason to share a
 * file, and the render path is the one carrying the security guarantee.
 *
 * Sanitising happens here, on render, and nowhere else. Nothing sanitises on
 * the way into storage: that turns "we refused to render this" into "we deleted
 * this from the database", silently and with no undo. See the note in
 * `lib/sanitizeHtml.ts`, and `components/JoditEditor.tsx` for the write side.
 */
export function HTMLViewer({ content, className = '', compact = false }: HTMLViewerProps) {
  const safeContent = useMemo(() => sanitizeHtml(content), [content])

  return (
    <div
      className={`${compact ? 'rich-text-content-compact' : 'rich-text-content'} ${className}`}
      dangerouslySetInnerHTML={{ __html: safeContent }}
    />
  )
}
