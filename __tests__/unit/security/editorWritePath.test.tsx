import { buildJoditConfig } from '@/components/joditConfig'

// The bundled UMD build of the same version the app ships. The ESM entry point
// the bundler uses is not transformed for jest, and this carries the same
// source and the same defaults - which is the point, because the defaults are
// what this file is checking we override.
const { Jodit } = require('jodit/es2021/jodit.min.js')

jest.setTimeout(30000)

/**
 * The write path, against a real editor rather than a stub.
 *
 * PLAT-41 shipped once with a sanitiser on this side, and opening a record was
 * enough to delete embeds out of storage permanently. Jodit arrives ready to do
 * the same thing: `cleanHTML.denyTags` defaults to `'script,iframe,object,embed'`.
 * So these load stored content into a real editor and read it back, which is
 * exactly what happens when an admin opens a record and types.
 *
 * The config is imported rather than restated, so this cannot pass against a
 * fixture while the component ships something else.
 *
 * Jodit cleans in two places, and both run here. There is a synchronous pass on
 * every value assignment, and an idle-scheduled `LazyWalker` over the live DOM
 * that carries `denyTags`, `sandboxIframesInContent` and `convertUnsafeEmbeds`.
 * The walker is the one that matters: it rewrites the DOM in place, and the next
 * `synchronizeValues` reads the rewritten DOM and fires `change`, so whatever it
 * touched is what the consumer's `onChange` persists. `roundTrip` drives it to
 * completion rather than asserting the settings and hoping.
 *
 * Every preservation fixture is also run against Jodit's own defaults further
 * down. That control is not decoration - a YouTube `/embed/` URL is hard-coded
 * as exempt from both `denyTags` and the sandbox filter
 * (`plugins/clean-html/helpers/is-allowed-media-embed.js`), so an iframe fixture
 * built from one passes just as happily with the destructive defaults restored.
 * The control is what tells the difference between a guarantee and a fixture
 * that cannot fail.
 */
const config = buildJoditConfig({
  isDark: false,
  readOnly: false,
  placeholder: 'Start typing here...',
  height: 300,
})

/** Jodit's shipped defaults for every content-affecting option this config turns off. */
const JODIT_DEFAULTS = {
  denyTags: 'script,iframe,object,embed',
  removeEmptyElements: true,
  replaceOldTags: { i: 'em', b: 'strong' },
  replaceNBSP: true,
  fillEmptyParagraph: true,
  convertUnsafeEmbeds: ['object', 'embed'],
  safeLinksTarget: true,
  sandboxIframesInContent: true,
}

async function withEditor(
  cleanHTMLOverrides: Record<string, unknown>,
  run: (editor: any) => void | Promise<void>
) {
  const host = document.createElement('textarea')
  document.body.appendChild(host)
  const editor = Jodit.make(host, {
    ...config,
    cleanHTML: { ...(config as any).cleanHTML, ...cleanHTMLOverrides },
  })
  await editor.waitForReady()
  try {
    await run(editor)
  } finally {
    editor.destruct()
    host.remove()
  }
}

/**
 * Load stored content, let the clean-html walker run over it the way a keystroke
 * would, then read it back.
 *
 * `fire('change')` is what the editor does on input; the plugin listens for it
 * and hands the live editor DOM to the walker. `finishedCleanHTMLWorker` is the
 * walker's own completion event, so this waits for a whole pass rather than
 * guessing at a timeout.
 */
async function roundTrip(stored: string, cleanHTMLOverrides = {}): Promise<string> {
  let out = ''
  await withEditor(cleanHTMLOverrides, async (editor) => {
    editor.value = stored
    await new Promise<void>((resolve) => {
      editor.e.on('finishedCleanHTMLWorker', () => resolve())
      editor.e.fire('change')
    })
    out = editor.value
  })
  return out
}

/**
 * Each entry is run twice: once under the shipped config, where it must come
 * back untouched, and once under Jodit's defaults, where it must not.
 */
const DESTROYED_BY_DEFAULTS: Array<[string, string]> = [
  [
    'an iframe embed Jodit does not special-case',
    '<p><iframe src="https://docs.google.com/forms/d/e/abc/viewform"></iframe></p>',
  ],
  [
    'an iframe embed with authored sizing',
    '<p><iframe src="https://calendar.google.com/calendar/embed?src=x" width="800" height="600" frameborder="0"></iframe></p>',
  ],
  [
    'an <object> embed',
    '<p><object data="https://cdn.example.com/a.swf" width="640" height="480"></object></p>',
  ],
  [
    'an <embed> embed',
    '<p><embed src="https://cdn.example.com/a.swf" type="application/x-shockwave-flash"></p>',
  ],
  ['<b>/<i> and a &nbsp;', '<p><b>bold</b>&nbsp;<i>italic</i></p>'],
  ['a blank table cell', '<table><tbody><tr><td>a</td><td></td></tr></tbody></table>'],
  ['a deliberately empty paragraph', '<p></p><p>after</p>'],
  [
    'a target=_blank link, which must not collect a rel',
    '<p><a href="https://example.org/handbook" target="_blank">Handbook</a></p>',
  ],
]

describe('editor engine preserves stored content while an admin edits it', () => {
  it.each(DESTROYED_BY_DEFAULTS)('keeps %s', async (_name, stored) => {
    expect(await roundTrip(stored)).toBe(stored)
  })

  it('keeps a stored YouTube embed (which Jodit exempts anyway - see the control)', async () => {
    const stored = '<p><iframe src="https://www.youtube.com/embed/abc123"></iframe></p>'

    expect(await roundTrip(stored)).toBe(stored)
  })

  it('keeps a stored video embed', async () => {
    const out = await roundTrip(
      '<video controls><source src="https://cdn.example.com/clip.mp4" type="video/mp4"></video>'
    )

    expect(out).toContain('<video')
    expect(out).toContain('src="https://cdn.example.com/clip.mp4"')
    expect(out).toContain('type="video/mp4"')
  })

  it('keeps an in-flight blob image, so an upload cannot be cut short', async () => {
    const src = 'blob:http://localhost:9000/1f0a-4c2b-9d3e'

    expect(await roundTrip(`<img src="${src}">`)).toContain(`src="${src}"`)
  })

  it('keeps a table including the th/td distinction', async () => {
    const stored =
      '<table><thead><tr><th>Level</th></tr></thead><tbody><tr><td>Provincial</td></tr></tbody></table>'

    expect(await roundTrip(stored)).toBe(stored)
  })

  it('keeps a three-level nested list without flattening it', async () => {
    const stored = '<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul></li></ul>'

    expect(await roundTrip(stored)).toBe(stored)
  })

  it('keeps headings and inline colour', async () => {
    const stored = '<h2>Rule change</h2><p><span style="color:#F97316;">Highlighted</span></p>'

    expect(await roundTrip(stored)).toBe(stored)
  })

  it('is idempotent, so opening and saving a record repeatedly cannot erode it', async () => {
    const stored =
      '<h2>Notes</h2><p><iframe src="https://docs.google.com/forms/d/e/abc/viewform"></iframe></p>' +
      '<table><tbody><tr><td>a</td></tr></tbody></table>'

    const once = await roundTrip(stored)
    expect(await roundTrip(once)).toBe(once)
  })
})

describe('control: the same fixtures under Jodit defaults, which must destroy them', () => {
  // If one of these ever passes, the fixture above it proves nothing and the
  // round trip it is paired with is a false positive.
  it.each(DESTROYED_BY_DEFAULTS)('Jodit defaults mangle %s', async (_name, stored) => {
    expect(await roundTrip(stored, JODIT_DEFAULTS)).not.toBe(stored)
  })

  it('and specifically delete a non-exempt iframe outright', async () => {
    const out = await roundTrip(
      '<p><iframe src="https://docs.google.com/forms/d/e/abc/viewform"></iframe></p>',
      JODIT_DEFAULTS
    )

    expect(out).not.toContain('docs.google.com')
    expect(out).not.toContain('<iframe')
  })

  it('and specifically stamp sandbox="" on one that survives denyTags', async () => {
    const out = await roundTrip(
      '<p><iframe src="https://docs.google.com/forms/d/e/abc/viewform"></iframe></p>',
      { ...JODIT_DEFAULTS, denyTags: false }
    )

    expect(out).toContain('sandbox=""')
  })
})

describe('cleanHTML settings that decide whether stored content survives', () => {
  const clean = (config as any).cleanHTML

  it('does not deny any tag, so embeds are not stripped while editing', () => {
    expect(clean.denyTags).toBe(false)
    expect(clean.allowTags).toBe(false)
  })

  it('does not remove empty elements, which an <iframe> and a blank cell both are', () => {
    expect(clean.removeEmptyElements).toBe(false)
  })

  it('does not rewrite tags, entities or empty paragraphs', () => {
    expect(clean.replaceOldTags).toBe(false)
    expect(clean.replaceNBSP).toBe(false)
    expect(clean.fillEmptyParagraph).toBe(false)
  })

  it('has no sanitizer hook, so the render allow-list cannot leak onto the write path', () => {
    expect(clean.sanitizer).toBe(false)
    expect(clean.allowedStyles).toBe(false)
  })

  it('leaves stored embeds and iframes alone rather than rewriting them', () => {
    // `false`, never `[]`: ConfigProto overlays a nested array onto the default
    // positionally, so `[]` merges straight back to ['object', 'embed'].
    expect(clean.convertUnsafeEmbeds).toBe(false)
    // The option that stamps sandbox="" on every non-YouTube/Vimeo iframe.
    expect(clean.sandboxIframesInContent).toBe(false)
    expect(clean.safeLinksTarget).toBe(false)
  })

  it('still strips what can execute', () => {
    expect(clean.removeEventAttributes).toBe(true)
    expect(clean.removeOnError).toBe(true)
    expect(clean.safeJavaScriptLink).toBe(true)
  })
})

describe('editor engine still refuses to carry executable markup', () => {
  // The one place the write path is allowed to touch content. This editor is a
  // contenteditable in the app's own document, not an iframe, so whatever it
  // loads is live markup in the admin's origin. These strip handlers and
  // script-bearing URLs and take no authored content with them.
  it('strips an onerror handler while keeping the image', async () => {
    const out = await roundTrip('<img src="x" onerror="alert(1)">')

    expect(out).not.toContain('onerror')
    expect(out).toContain('<img')
    expect(out).toContain('src="x"')
  })

  it('defuses a javascript: iframe src', async () => {
    const out = await roundTrip('<p><iframe src="javascript:alert(1)"></iframe></p>')

    expect(out).not.toContain('javascript:alert(1)')
    expect(out).toContain('<iframe')
  })

  it('defuses a javascript: link', async () => {
    const out = await roundTrip('<a href="javascript:alert(1)">x</a>')

    expect(out).not.toMatch(/href="javascript:/)
  })

  it('drops srcdoc, which is why iframes do not need sandboxing on this path', async () => {
    // srcdoc is the one iframe payload that would run in this origin, and
    // `safeJavaScriptLink` removes it whatever `sandboxIframesInContent` says.
    const out = await roundTrip('<p><iframe srcdoc="<script>alert(1)</script>"></iframe></p>')

    expect(out).not.toContain('srcdoc')
    expect(out).toContain('<iframe')
  })
})

describe('uploader wiring', () => {
  const uploader = config.uploader as any

  it('posts under the field names upload-file reads', async () => {
    const calls: FormData[] = []
    global.fetch = jest.fn(async (_url: any, init: any) => {
      calls.push(init.body)
      return {
        ok: true,
        json: async () => ({
          success: true,
          publicUrl: 'https://cdn.example.com/1-court.png',
        }),
      }
    }) as any

    const file = new File([new Uint8Array([1, 2, 3])], 'court.png', { type: 'image/png' })
    const request = new FormData()
    request.append('files[0]', file, file.name)

    const answer = await uploader.customUploadFunction(request)

    expect(calls).toHaveLength(1)
    expect(calls[0].get('file')).toBeInstanceOf(File)
    expect(calls[0].get('path')).toBe('email-images')

    // Jodit builds the src as `baseurl + files[i]`, so an absolute URL needs an
    // empty base.
    expect(answer.success).toBe(true)
    expect(answer.data.baseurl).toBe('')
    expect(answer.data.files).toEqual(['https://cdn.example.com/1-court.png'])
    expect(answer.data.isImages).toEqual([true])
  })

  it('finds the files even when they come from another realm', async () => {
    // Jodit builds the payload with the editor's owner-window constructors. An
    // `instanceof` check against this module's globals would find nothing and
    // report a successful upload of no files.
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, publicUrl: 'https://cdn.example.com/1-court.png' }),
    })) as any

    // A real Blob carrying a name: everything a File is on the wire, but not
    // `instanceof File` in this realm - which is what a cross-realm File looks
    // like from here.
    const foreignFile = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
    Object.defineProperty(foreignFile, 'name', { value: 'court.png' })
    expect(foreignFile instanceof File).toBe(false)

    const foreignForm = {
      forEach: (cb: (entry: unknown) => void) => cb(foreignFile),
    }

    const answer = await uploader.customUploadFunction(foreignForm)

    expect(answer.success).toBe(true)
    expect(answer.data.files).toEqual(['https://cdn.example.com/1-court.png'])
  })

  it('reports a failed upload instead of rejecting, which Jodit would not catch', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      json: async () => ({ error: 'That file is too large — please upload a file under 10 MB.' }),
    })) as any
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

    const request = new FormData()
    request.append('files[0]', new File(['x'], 'big.png', { type: 'image/png' }), 'big.png')

    const answer = await uploader.customUploadFunction(request)

    expect(answer.success).toBe(false)
    expect(answer.data.files).toEqual([])
    expect(answer.data.messages?.[0]).toContain('too large')

    consoleError.mockRestore()
  })
})
