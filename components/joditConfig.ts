import type { JoditEditorProps } from 'jodit-react'

export type JoditConfig = NonNullable<JoditEditorProps['config']>

const FUNCTIONS_BASE =
  process.env.NODE_ENV === 'production'
    ? '/.netlify/functions'
    : 'http://localhost:9000/.netlify/functions'

/**
 * Deliberately smaller than the toolbar it replaces. Dropped along with the old
 * editor: character map, insert date/time, visual blocks, find & replace,
 * preview, anchors and the help dialog. Nobody editing an association's news
 * page reaches for those, and carrying them was most of the cost of the port.
 */
const TOOLBAR_FULL = [
  'undo', 'redo', '|',
  'paragraph', '|',
  'bold', 'italic', 'underline', 'strikethrough', '|',
  'brush', '|',
  'align', '|',
  'ul', 'ol', 'outdent', 'indent', '|',
  'link', 'image', 'table', '|',
  'eraser', 'source', 'fullsize',
]

/** Narrow screens: the essentials, with the rest behind the overflow button. */
const TOOLBAR_COMPACT = [
  'undo', 'redo', '|',
  'bold', 'italic', '|',
  'ul', 'ol', '|',
  'link', 'image', '|',
  'dots',
]

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp']

/**
 * Where uploaded images land. `upload-file` reads this `path` field to pick the
 * `email-images` storage bucket.
 */
const UPLOAD_PATH = 'email-images'

/**
 * Structural rather than `instanceof File`/`instanceof FormData`. Jodit builds
 * the upload payload with the *editor's owner window's* constructors
 * (`uploader.ow.FormData`), which is this document's today because the editing
 * surface is a contenteditable here. If it ever moves into an iframe - Jodit's
 * iframe mode, or `cleanHTML.useIframeSandbox` - an `instanceof` against the
 * module-scope global stops matching, and the upload silently succeeds having
 * sent no files at all.
 */
function isFileLike(entry: unknown): entry is File {
  if (typeof entry !== 'object' || entry === null) return false
  const candidate = entry as Partial<File>
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.size === 'number' &&
    typeof candidate.slice === 'function'
  )
}

export interface JoditConfigOptions {
  isDark: boolean
  readOnly: boolean
  placeholder: string
  height: number
}

/**
 * The editor's configuration.
 *
 * It lives outside the component so a test can hand the real thing to a real
 * Jodit instance. Restating these settings in a fixture would let the two drift,
 * and the settings that matter most here are the ones deciding whether opening a
 * record quietly destroys what is stored in it.
 */
export function buildJoditConfig({
  isDark,
  readOnly,
  placeholder,
  height,
}: JoditConfigOptions): JoditConfig {
  return {
    theme: isDark ? 'dark' : 'default',
    readonly: readOnly,
    placeholder,
    height,
    minHeight: 200,
    maxHeight: 1500,
    allowResizeX: false,
    allowResizeY: false,
    toolbarAdaptive: true,
    buttons: TOOLBAR_FULL,
    buttonsMD: TOOLBAR_FULL,
    buttonsSM: TOOLBAR_COMPACT,
    buttonsXS: TOOLBAR_COMPACT,
    statusbar: true,
    showCharsCounter: false,
    showWordsCounter: true,
    showXPathInStatusbar: false,

    // The editing surface is a contenteditable in this document, not an iframe,
    // so the site's own stylesheet already reaches it. Handing it the class the
    // viewer renders with keeps WYSIWYG honest - and is why nothing here
    // restates the ~50 lines of duplicated light/dark editor typography the old
    // iframe-based editor needed.
    editorClassName: 'rich-text-content',

    // The old editor pasted HTML silently; Jodit prompts first by default.
    askBeforePasteHTML: false,
    askBeforePasteFromWord: false,
    defaultActionOnPaste: 'insert_as_html',
    defaultActionOnPasteFromWord: 'insert_as_html',

    /**
     * Stored content is never rewritten on the way in. Sanitising on write turns
     * "we refused to render that" into "we deleted it from the database", which
     * is the bug PLAT-41 fixed and the reason `lib/sanitizeHtml.ts` runs at
     * render time only.
     *
     * The exception is anything that can execute. The old editor worked inside
     * an iframe and sanitised before content reached that document; Jodit is a
     * contenteditable in *this* one, so whatever it loads is live markup in the
     * admin's own origin. Those options stay on. They remove no authored
     * content - only handlers and script-bearing URLs, all of which the render
     * allow-list drops anyway.
     */
    cleanHTML: {
      // Jodit ships `denyTags: 'script,iframe,object,embed'`. That default is
      // the PLAT-41 bug pre-installed: storage holds `<iframe>` and `<video>`
      // from the old editor's Insert > Media button, and it would delete them
      // out from under an admin who merely opened a record.
      denyTags: false,
      allowTags: false,
      // `<iframe src=...></iframe>` and blank table cells are both "empty".
      removeEmptyElements: false,
      // Content rewrites, all off: <b> to <strong>, &nbsp; to a space, and
      // stuffing <br> into empty paragraphs.
      replaceOldTags: false,
      replaceNBSP: false,
      fillEmptyParagraph: false,
      // Never plug the render allow-list in here. That is the trap.
      sanitizer: false,
      allowedStyles: false,
      // Rewrites a stored <object>/<embed> into <iframe sandbox="">. Must be
      // `false`, not `[]`: `ConfigProto` treats a nested array as a positional
      // overlay on the default rather than a replacement
      // (`[...opt, ...protoKey.slice(opt.length)]`), so `[]` merges straight
      // back to Jodit's `['object', 'embed']` and the rewrite still happens.
      convertUnsafeEmbeds: false,
      // Adds rel="noopener noreferrer" to links that already exist: a content
      // rewrite, and browsers have implied noopener on target=_blank for years.
      safeLinksTarget: false,
      // Stamps sandbox="" on every iframe whose src is not a YouTube/Vimeo
      // *embed* URL. An empty sandbox is the most restrictive value there is -
      // no scripts, no forms, no same-origin - so a stored Google Form,
      // calendar or map comes back neutered. It buys nothing here either: a
      // cross-origin iframe never executes in this origin whatever its sandbox,
      // `srcdoc` is dropped by `safeJavaScriptLink` below regardless of this
      // setting, and the render allow-list drops `iframe` outright.
      sandboxIframesInContent: false,

      // Execution, not content. Without these a stored payload runs in the
      // admin portal the moment the editor loads the record.
      removeEventAttributes: true,
      removeOnError: true,
      safeJavaScriptLink: true,
    },

    uploader: {
      // `customUploadFunction` below does the POST, so this is not the address
      // anything is sent to. It is still needed: the image-properties dialog
      // gates its "change image" upload control on `uploader.url` being set.
      url: `${FUNCTIONS_BASE}/upload-file`,
      // Upload rather than inline as base64: these images get emailed, so they
      // need real URLs rather than megabytes of data: payload.
      insertImageAsBase64URI: false,
      imagesExtensions: IMAGE_EXTENSIONS,

      /**
       * `upload-file` answers `{ success, url, publicUrl, ... }` and takes one
       * file per request; Jodit wants `{ success, data: { files[], baseurl,
       * isImages[] } }` and may hand over several at once. So post them one at a
       * time and reshape the answer.
       *
       * Jodit does not catch a rejection here, so a failure is returned as an
       * unsuccessful answer instead - that routes through `defaultHandlerError`
       * and the editor surfaces the message.
       */
      customUploadFunction: async (requestData: unknown) => {
        const files: File[] = []
        const form = requestData as { forEach?: (cb: (entry: unknown) => void) => void }
        if (typeof form?.forEach === 'function') {
          form.forEach((entry) => {
            if (isFileLike(entry)) files.push(entry)
          })
        }

        const uploaded: string[] = []
        const isImages: boolean[] = []

        try {
          for (const file of files) {
            const body = new FormData()
            body.append('file', file, file.name)
            body.append('path', UPLOAD_PATH)

            const response = await fetch(`${FUNCTIONS_BASE}/upload-file`, {
              method: 'POST',
              body,
            })

            if (!response.ok) {
              const failure = await response.json().catch(() => null)
              throw new Error(failure?.error || 'Upload failed')
            }

            const data = await response.json()
            uploaded.push(data.publicUrl || data.url)
            isImages.push(file.type.startsWith('image/'))
          }
        } catch (error) {
          console.error('Image upload failed:', error)
          return {
            success: false,
            time: new Date().toString(),
            data: {
              files: [],
              baseurl: '',
              messages: [error instanceof Error ? error.message : 'Upload failed'],
            },
          }
        }

        return {
          success: true,
          time: new Date().toString(),
          // `upload-file` returns absolute URLs and Jodit concatenates
          // `baseurl + filename`, so the base stays empty.
          data: { baseurl: '', files: uploaded, isImages },
        }
      },
    },

    // Jodit stamps width="300px" on every uploaded image unless this is null.
    // Images went in at natural size before, with `img { max-width: 100% }`
    // handling overflow; keep that. The cast is because the option is typed
    // `number` while the code path it feeds explicitly tests for null.
    imageDefaultWidth: null as unknown as number,
  }
}
