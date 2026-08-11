import { render, fireEvent, screen } from '@testing-library/react'
import { sanitizeHtml, sanitizeHtmlWithoutDom } from '@/lib/sanitizeHtml'
import { HTMLViewer } from '@/components/HTMLViewer'
import { JoditEditor } from '@/components/JoditEditor'

// The editor engine is booted for real in editorWritePath.test.tsx, against the
// same config the component ships. The stub here stands in for its contract
// only - render whatever `value` arrives, report edits back through onChange -
// so these tests stay about the React wrapper: that it carries content in both
// directions without touching it.
jest.mock('jodit-react', () => ({
  __esModule: true,
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea
      data-testid="editor-stub"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}))

const SCRIPT_PAYLOAD = '<script>alert(1)</script>'
const IMG_PAYLOAD = '<img src=x onerror=alert(1)>'

const LEGIT_TABLE =
  '<table><thead><tr><th>Level</th></tr></thead><tbody><tr><td>Provincial</td></tr></tbody></table>'
const LEGIT_LINK =
  '<a href="https://example.org/handbook" target="_blank" rel="noopener">Handbook</a>'

// The old editor had a live Insert > Media button, so this is what admins have
// already saved. The allow-list declines to render it; nothing may delete it.
const IFRAME_EMBED = '<p><iframe src="https://www.youtube.com/embed/abc123"></iframe></p>'
const VIDEO_EMBED =
  '<video controls><source src="https://cdn.example.com/clip.mp4" type="video/mp4"></video>'

// What sits in the document while the upload POST is still in flight, and what
// a pasted image looks like before it is uploaded.
const BLOB_SRC = 'blob:http://localhost:9000/1f0a-4c2b-9d3e'
const DATA_SRC = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGMAAQAABQAB'
const BLOB_IMG = `<img src="${BLOB_SRC}">`
const DATA_IMG = `<img src="${DATA_SRC}">`

describe('HTMLViewer render path', () => {
  it('drops a stored <script> tag', () => {
    const { container } = render(
      <HTMLViewer content={`<p>Notice</p>${SCRIPT_PAYLOAD}`} />
    )

    expect(container.querySelector('script')).toBeNull()
    expect(container.innerHTML).not.toContain('alert(1)')
    expect(container.querySelector('p')?.textContent).toBe('Notice')
  })

  it('drops an onerror handler from a stored <img>', () => {
    const { container } = render(<HTMLViewer content={IMG_PAYLOAD} />)

    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.hasAttribute('onerror')).toBe(false)
    expect(container.innerHTML).not.toContain('onerror')
  })

  it('drops a javascript: link but keeps the text', () => {
    const { container } = render(
      <HTMLViewer content={'<a href="javascript:alert(1)">Click</a>'} />
    )

    expect(container.querySelector('a')?.getAttribute('href')).toBeNull()
    expect(container.textContent).toContain('Click')
  })

  it('keeps a table intact', () => {
    const { container } = render(<HTMLViewer content={LEGIT_TABLE} />)

    expect(container.querySelector('table')).not.toBeNull()
    expect(container.querySelector('thead th')?.textContent).toBe('Level')
    expect(container.querySelector('tbody td')?.textContent).toBe('Provincial')
  })

  it('keeps a link intact', () => {
    const { container } = render(<HTMLViewer content={LEGIT_LINK} />)

    const anchor = container.querySelector('a')
    expect(anchor?.getAttribute('href')).toBe('https://example.org/handbook')
    expect(anchor?.getAttribute('target')).toBe('_blank')
    expect(anchor?.textContent).toBe('Handbook')
  })

  it('keeps the rest of the formatting the editor can emit', () => {
    const content =
      '<h2>Rule change</h2><p><strong>Effective</strong> now</p>' +
      '<blockquote>Quoted</blockquote><ul><li>One</li></ul>' +
      '<img src="https://cdn.example.com/court.png" alt="Court" width="300">' +
      '<span style="color: #F97316;">Highlighted</span>'
    const { container } = render(<HTMLViewer content={content} />)

    expect(container.querySelector('h2')?.textContent).toBe('Rule change')
    expect(container.querySelector('strong')?.textContent).toBe('Effective')
    expect(container.querySelector('blockquote')?.textContent).toBe('Quoted')
    expect(container.querySelector('ul li')?.textContent).toBe('One')
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://cdn.example.com/court.png'
    )
    expect(container.querySelector('span')?.getAttribute('style')).toContain('#F97316')
  })

  it('renders an in-flight blob image and a pasted base64 image', () => {
    const { container } = render(<HTMLViewer content={BLOB_IMG + DATA_IMG} />)

    const [blobImg, dataImg] = Array.from(container.querySelectorAll('img'))
    expect(blobImg?.getAttribute('src')).toBe(BLOB_SRC)
    expect(dataImg?.getAttribute('src')).toBe(DATA_SRC)
  })

  it('does not extend blob:/data: to anchors, only to img[src]', () => {
    const { container } = render(
      <HTMLViewer
        content={
          `<a href="${BLOB_SRC}">blob</a>` +
          '<a href="data:text/html,<script>alert(1)</script>">data</a>' +
          '<img src="data:text/html,<script>alert(1)</script>" alt="not an image">'
        }
      />
    )

    for (const anchor of Array.from(container.querySelectorAll('a'))) {
      expect(anchor.getAttribute('href')).toBeNull()
    }
    expect(container.querySelector('img')?.hasAttribute('src')).toBe(false)
    expect(container.querySelector('script')).toBeNull()
  })

  it('declines to render a stored iframe or video', () => {
    const { container } = render(<HTMLViewer content={IFRAME_EMBED + VIDEO_EMBED} />)

    expect(container.querySelector('iframe')).toBeNull()
    expect(container.querySelector('video')).toBeNull()
  })
})

// The editor is the write path. Nothing here may rewrite content: a sanitiser
// on this side turns "we refused to render that" into "we deleted it from the
// database", which is what round 1 of this fix actually shipped.
describe('JoditEditor write path', () => {
  // Open a record, then touch something. That second step is what used to
  // overwrite storage with the stripped HTML.
  const EDIT = '<p>and a note</p>'

  // The editor sits behind next/dynamic, so it arrives a tick after render.
  const mount = async (content: string, onChange: jest.Mock) => {
    render(<JoditEditor value={content} onChange={onChange} />)
    return (await screen.findByTestId('editor-stub')) as HTMLTextAreaElement
  }

  const roundTrip = async (content: string) => {
    const onChange = jest.fn()
    const textarea = await mount(content, onChange)
    const intoEditor = textarea.value

    fireEvent.change(textarea, { target: { value: content + EDIT } })

    return { intoEditor, backToCaller: onChange.mock.calls[0][0] as string }
  }

  it('hands the caller exactly what the editor produced', async () => {
    const onChange = jest.fn()
    const textarea = await mount('', onChange)
    const typed = `<p>Update</p>${SCRIPT_PAYLOAD}${IMG_PAYLOAD}`

    fireEvent.change(textarea, { target: { value: typed } })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0]).toBe(typed)
  })

  it('round-trips a media embed unchanged, so opening a record cannot destroy it', async () => {
    const { intoEditor, backToCaller } = await roundTrip(IFRAME_EMBED + VIDEO_EMBED)

    expect(intoEditor).toBe(IFRAME_EMBED + VIDEO_EMBED)
    expect(backToCaller).toBe(IFRAME_EMBED + VIDEO_EMBED + EDIT)
  })

  it('round-trips an in-flight blob image and a pasted base64 image unchanged', async () => {
    const { intoEditor, backToCaller } = await roundTrip(BLOB_IMG + DATA_IMG)

    expect(intoEditor).toBe(BLOB_IMG + DATA_IMG)
    expect(backToCaller).toBe(BLOB_IMG + DATA_IMG + EDIT)
  })

  it('round-trips ordinary markup unchanged', async () => {
    const { intoEditor, backToCaller } = await roundTrip(LEGIT_TABLE + LEGIT_LINK)

    expect(intoEditor).toBe(LEGIT_TABLE + LEGIT_LINK)
    expect(backToCaller).toBe(LEGIT_TABLE + LEGIT_LINK + EDIT)
  })

  it('renders through the classes the stylesheet targets', () => {
    const { container, rerender } = render(<HTMLViewer content="<p>x</p>" />)
    expect(container.firstElementChild?.className).toContain('rich-text-content')

    rerender(<HTMLViewer content="<p>x</p>" compact />)
    expect(container.firstElementChild?.className).toContain('rich-text-content-compact')
  })
})

// The news article page is prerendered by `output: 'export'`, so the sanitiser
// runs in Node with no window. That path has to hold on its own.
describe('server-side (no DOM) sanitiser', () => {
  it('drops a <script> tag and its contents', () => {
    expect(sanitizeHtmlWithoutDom(`<p>Notice</p>${SCRIPT_PAYLOAD}`)).toBe('<p>Notice</p>')
  })

  it('drops an onerror handler from an <img>', () => {
    const clean = sanitizeHtmlWithoutDom(IMG_PAYLOAD)
    expect(clean).not.toContain('onerror')
    expect(clean).toContain('<img')
    expect(clean).toContain('src="x"')
  })

  it('keeps a table and a link intact', () => {
    const clean = sanitizeHtmlWithoutDom(LEGIT_TABLE + LEGIT_LINK)
    expect(clean).toContain('<table>')
    expect(clean).toContain('<th>Level</th>')
    expect(clean).toContain('<td>Provincial</td>')
    expect(clean).toContain('href="https://example.org/handbook"')
    expect(clean).toContain('target="_blank"')
  })

  it('rejects javascript: URLs, including entity- and whitespace-obfuscated ones', () => {
    expect(sanitizeHtmlWithoutDom('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>')
    expect(sanitizeHtmlWithoutDom('<a href="java&#9;script:alert(1)">x</a>')).toBe('<a>x</a>')
    expect(sanitizeHtmlWithoutDom('<a href="JaVaScRiPt:alert(1)">x</a>')).toBe('<a>x</a>')
  })

  it('drops iframes, styles and inline event attributes on any element', () => {
    expect(sanitizeHtmlWithoutDom('<iframe src="https://evil.test"></iframe>')).toBe('')
    expect(sanitizeHtmlWithoutDom('<style>body{display:none}</style>')).toBe('')
    expect(sanitizeHtmlWithoutDom('<p onclick="alert(1)">hi</p>')).toBe('<p>hi</p>')
    expect(sanitizeHtmlWithoutDom('<svg><script>alert(1)</script></svg>')).toBe('')
  })

  it('cannot be escaped by an unquoted attribute or a stray angle bracket', () => {
    // Parse the sanitiser's output with a real HTML parser: an attribute that
    // survives only as escaped text inside a value is inert, and only a parse
    // can tell the two apart.
    const host = document.createElement('div')
    host.innerHTML = sanitizeHtmlWithoutDom('<p title=a"onmouseover="alert(1)>hi</p>')

    const paragraph = host.querySelector('p')
    expect(paragraph).not.toBeNull()
    expect(paragraph?.hasAttribute('onmouseover')).toBe(false)
    expect(paragraph?.getAttributeNames().filter((n) => n.startsWith('on'))).toEqual([])

    expect(sanitizeHtmlWithoutDom('5 < 6 and 7 > 6')).toBe('5 &lt; 6 and 7 > 6')
  })

  it('leaves no event-handler attribute anywhere once the output is parsed', () => {
    const host = document.createElement('div')
    host.innerHTML = sanitizeHtmlWithoutDom(
      `<div onload="alert(1)"><p ONCLICK="alert(1)">a</p>${IMG_PAYLOAD}` +
        '<a href="#x" onmouseover=alert(1)>b</a></div>'
    )

    const withHandlers = Array.from(host.querySelectorAll('*')).filter((el) =>
      el.getAttributeNames().some((n) => n.toLowerCase().startsWith('on'))
    )
    expect(withHandlers).toEqual([])
    expect(host.querySelector('script')).toBeNull()
  })

  it('strips executable CSS out of an otherwise allowed style attribute', () => {
    expect(sanitizeHtmlWithoutDom('<p style="width:expression(alert(1))">hi</p>')).toBe(
      '<p>hi</p>'
    )
    expect(sanitizeHtmlWithoutDom('<p style="color: #F97316;">hi</p>')).toBe(
      '<p style="color: #F97316;">hi</p>'
    )
  })

  it('is idempotent, so re-saving content does not erode it', () => {
    const once = sanitizeHtmlWithoutDom(LEGIT_TABLE + LEGIT_LINK)
    expect(sanitizeHtmlWithoutDom(once)).toBe(once)
  })

  it('keeps blob: and data:image/* on img[src]', () => {
    expect(sanitizeHtmlWithoutDom(BLOB_IMG)).toContain(`src="${BLOB_SRC}"`)
    expect(sanitizeHtmlWithoutDom(DATA_IMG)).toContain(`src="${DATA_SRC}"`)
    expect(sanitizeHtmlWithoutDom('<img src="data:image/svg+xml;base64,PHN2Zy8+">')).toContain(
      'src="data:image/svg+xml;base64,PHN2Zy8+"'
    )
  })

  it('confines blob: and data: to img[src] and to image types', () => {
    expect(sanitizeHtmlWithoutDom(`<a href="${BLOB_SRC}">x</a>`)).toBe('<a>x</a>')
    expect(sanitizeHtmlWithoutDom(`<a href="${DATA_SRC}">x</a>`)).toBe('<a>x</a>')
    expect(sanitizeHtmlWithoutDom('<img src="data:text/html;base64,PHNjcmlwdD4=">')).toBe('<img>')
  })
})

describe('sanitizeHtml entry point', () => {
  it('returns an empty string for non-string input', () => {
    expect(sanitizeHtml(null)).toBe('')
    expect(sanitizeHtml(undefined)).toBe('')
    expect(sanitizeHtml({ nope: true })).toBe('')
  })

  it('leaves ordinary editor output untouched', () => {
    // The editor is a controlled component: it re-reads what we hand back. If
    // sanitising rewrote clean markup, every keystroke would reset the content
    // and move the caret.
    const typical =
      '<h2>Season notes</h2>\n<p>Games start <strong>Monday</strong>.</p>\n' +
      '<ul>\n<li>Arrive early</li>\n</ul>\n' +
      '<figure class="image"><img src="https://cdn.example.com/a.png" alt="a"><figcaption>Court</figcaption></figure>'

    expect(sanitizeHtml(typical)).toBe(typical)
  })

  it('is idempotent, so a re-save cannot erode content', () => {
    const once = sanitizeHtml(LEGIT_TABLE + LEGIT_LINK + IMG_PAYLOAD)
    expect(sanitizeHtml(once)).toBe(once)
  })

  it('agrees with the DOM-free path on the attack payloads', () => {
    for (const payload of [SCRIPT_PAYLOAD, IMG_PAYLOAD, '<a href="javascript:alert(1)">x</a>']) {
      expect(sanitizeHtml(payload)).not.toContain('alert(1)')
      expect(sanitizeHtmlWithoutDom(payload)).not.toContain('alert(1)')
    }
  })

  it('agrees with the DOM-free path on inline image sources', () => {
    // The portal renders through DOMPurify and the static export renders
    // through the DOM-free path. An image that survives one and not the other
    // is an image that vanishes when a page goes public.
    for (const src of [BLOB_SRC, DATA_SRC]) {
      expect(sanitizeHtml(`<img src="${src}">`)).toContain(`src="${src}"`)
      expect(sanitizeHtmlWithoutDom(`<img src="${src}">`)).toContain(`src="${src}"`)
    }

    for (const markup of [`<a href="${BLOB_SRC}">x</a>`, '<img src="data:text/html,x">']) {
      expect(sanitizeHtml(markup)).not.toContain(BLOB_SRC)
      expect(sanitizeHtml(markup)).not.toContain('data:text/html')
      expect(sanitizeHtmlWithoutDom(markup)).not.toContain(BLOB_SRC)
      expect(sanitizeHtmlWithoutDom(markup)).not.toContain('data:text/html')
    }
  })
})
