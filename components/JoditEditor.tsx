'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { buildJoditConfig } from '@/components/joditConfig'

/**
 * Jodit is ~200KB gzip and touches `window` on import, so it loads only when an
 * editor actually mounts - the same pattern the PDF viewer uses.
 */
const JoditReact = dynamic(() => import('jodit-react'), {
  ssr: false,
  loading: () => (
    <div
      className="h-full min-h-[200px] w-full animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800"
      aria-hidden="true"
    />
  ),
})

interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  height?: number
  placeholder?: string
  readOnly?: boolean
}

/**
 * Rich-text editor.
 *
 * This component is a pass-through: `value` goes down untouched and whatever the
 * editor produces comes back up untouched. The XSS guard lives in `HTMLViewer`,
 * where stored content becomes DOM on a page somebody reads. Putting a sanitiser
 * on this side instead would rewrite what gets persisted - see the notes in
 * `components/joditConfig.ts` and `lib/sanitizeHtml.ts`.
 */
export function JoditEditor({
  value,
  onChange,
  height = 300,
  placeholder = 'Start typing here...',
  readOnly = false,
}: RichTextEditorProps) {
  const [isDark, setIsDark] = useState(false)

  // ThemeContext puts `.dark` on a wrapper div rather than on <html>, so the
  // class can show up anywhere above this component.
  useEffect(() => {
    const update = () => setIsDark(!!document.querySelector('.dark'))
    update()

    const observer = new MutationObserver(update)
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
      subtree: true,
    })

    return () => observer.disconnect()
  }, [])

  // jodit-react lists `config` in the effect that constructs the editor, so a
  // fresh object on each render would tear the editor down and rebuild it every
  // time, taking the caret with it.
  const config = useMemo(
    () => buildJoditConfig({ isDark, readOnly, placeholder, height }),
    [isDark, readOnly, placeholder, height]
  )

  return (
    <div
      className="rich-text-editor overflow-hidden rounded-lg border border-gray-300 dark:border-gray-600"
      style={{ minHeight: height }}
    >
      <JoditReact value={value} config={config} onChange={onChange} />
    </div>
  )
}
