import DOMPurify from 'dompurify'

/**
 * Allow-list for rich-text HTML that officials author in the editor and that the
 * site renders back out as raw HTML.
 *
 * The list is derived from what the editor can actually emit - headings,
 * paragraphs, links, tables, blockquotes, lists and images from the toolbar in
 * `components/JoditEditor.tsx` - plus the markup around them: `figure`/
 * `figcaption` on captioned images, and `span` carrying inline colour from the
 * text-colour button. Strip any of those and the editor becomes a lossy
 * round-trip, which is how a sanitiser ends up switched off.
 *
 * It also has to cover markup the *old* editor produced, because storage still
 * holds it. That is why `b`, `i` and `strike` are here alongside `strong`, `em`
 * and `s`.
 */
export const ALLOWED_TAGS: string[] = [
  'a', 'abbr', 'address', 'article', 'aside', 'b', 'blockquote', 'br',
  'caption', 'cite', 'code', 'col', 'colgroup', 'dd', 'del', 'details',
  'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'footer',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i', 'img', 'ins',
  'kbd', 'li', 'main', 'mark', 'nav', 'ol', 'p', 'pre', 'q', 's', 'samp',
  'section', 'small', 'span', 'strike', 'strong', 'sub', 'summary', 'sup',
  'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'time', 'tr', 'u', 'ul',
  'var', 'wbr',
]

export const ALLOWED_ATTR: string[] = [
  'abbr', 'align', 'alt', 'border', 'cellpadding', 'cellspacing', 'cite',
  'class', 'colspan', 'datetime', 'decoding', 'dir', 'headers', 'height',
  'href', 'id', 'lang', 'loading', 'name', 'rel', 'reversed', 'role',
  'rowspan', 'scope', 'span', 'src', 'start', 'style', 'target', 'title',
  'type', 'valign', 'value', 'width',
]

/** Elements whose *contents* are dropped along with the element itself. */
const DROP_WITH_CONTENT = new Set([
  'annotation-xml', 'applet', 'audio', 'base', 'basefont', 'canvas', 'desc',
  'embed', 'foreignobject', 'form', 'frame', 'frameset', 'head', 'iframe',
  'link', 'math', 'meta', 'mi', 'mn', 'mo', 'ms', 'mtext', 'noembed',
  'noframes', 'noscript', 'object', 'plaintext', 'portal', 'script', 'style',
  'svg', 'template', 'textarea', 'title', 'video', 'xmp',
])

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr',
])

/** Attributes whose value is a URL and therefore needs a scheme check. */
const URI_ATTR = new Set([
  'href', 'src', 'cite', 'action', 'formaction', 'poster', 'background', 'longdesc',
])

/** Same shape as DOMPurify's default ALLOWED_URI_REGEXP, so both paths agree. */
const SAFE_URI = /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i

/**
 * Schemes that carry image bytes rather than a destination, allowed on
 * `img[src]` only.
 *
 * `blob:` is not optional. The editor uploads dropped and pasted images rather
 * than inlining them, which means it holds a local `<img src="blob:...">` until
 * the POST to `upload-file` resolves and hands back a real URL. Anything that
 * rewrites the markup in that window replaces the node still being uploaded.
 * `data:image/*` is the same story for images pasted as base64, and for content
 * saved that way before the upload path existed.
 *
 * Scoping this to `img[src]` is the whole point: an `<img>` renders SVG in
 * secure static mode - no scripts, no external fetches - whereas the same URL
 * on an anchor is a navigation into a document that can run script in this
 * origin. Anchors keep the strict list above.
 */
const INLINE_IMAGE_SRC = /^(?:blob:|data:image\/[a-z0-9!#$&^_.+-]+[;,])/i

/** Inline CSS constructs that can execute or load code. */
const UNSAFE_STYLE = /(?:expression\s*\(|javascript\s*:|vbscript\s*:|-moz-binding|@import|behaviou?r\s*:)/i

const ALLOWED_TAG_SET = new Set(ALLOWED_TAGS)
const ALLOWED_ATTR_SET = new Set(ALLOWED_ATTR)

const DOMPURIFY_CONFIG = {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: true,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  RETURN_TRUSTED_TYPE: false,
} as const

type Purifier = ReturnType<typeof DOMPurify>

let purifier: Purifier | null = null

/**
 * DOMPurify instance carrying the two rules where stock DOMPurify and the
 * DOM-free path below would otherwise disagree.
 *
 * Disagreement is the thing to avoid: the portal renders through DOMPurify and
 * the public pages render through the static export, off the same stored row.
 * Content that survives one and not the other is content that changes when a
 * page goes public.
 *
 * It is a private instance rather than the shared default export, because
 * `addHook` mutates whichever instance it is called on and these rules should
 * not leak into anyone else's `DOMPurify.sanitize` call. Created lazily: the
 * module is imported during the static export too, where there is no window to
 * bind.
 */
function getPurifier(): Purifier {
  if (purifier) return purifier

  const instance = DOMPurify()
  instance.addHook('uponSanitizeAttribute', (node, data) => {
    // DOMPurify does not read CSS; it leaves `style` values alone on the
    // grounds that the constructs below are dead in current browsers. They are
    // dead, but the DOM-free path drops them, so drop them here too.
    if (data.attrName === 'style') {
      if (UNSAFE_STYLE.test(decodeEntities(data.attrValue))) data.keepAttr = false
      return
    }

    if (data.attrName !== 'src') return
    if (node.nodeName.toLowerCase() !== 'img') return

    const normalized = normalizeUri(data.attrValue)
    if (INLINE_IMAGE_SRC.test(normalized)) {
      // DOMPurify's default URI regexp rejects `blob:` outright, and its
      // DATA_URI_TAGS carve-out would wave through any `data:` type at all.
      // Decide both here.
      data.forceKeepAttr = true
    } else if (/^(?:blob|data):/i.test(normalized)) {
      data.keepAttr = false
    }
  })

  purifier = instance
  return instance
}

/**
 * Sanitise stored rich-text HTML before it reaches the DOM.
 *
 * This is a render-time guard, and only a render-time guard. Nothing sanitises
 * on the way into storage: doing that turns "we refused to render this" into
 * "we deleted this from the database", silently and with no undo. The editor
 * keeps whatever an admin saved - including the media embeds this allow-list
 * declines to render - so what was removed is still there to be seen and
 * recovered.
 *
 * In the browser the work is DOMPurify's. This app builds as a static export
 * (`output: 'export'` in next.config.js), so the same call also runs in Node at
 * build time, where there is no `window` and DOMPurify silently returns its
 * input unchanged - hence the DOM-free fallback below. Both paths share one
 * allow-list.
 */
export function sanitizeHtml(dirty: unknown): string {
  if (typeof dirty !== 'string' || dirty === '') return ''

  if (typeof window === 'undefined' || typeof window.document === 'undefined') {
    return sanitizeHtmlWithoutDom(dirty)
  }

  return getPurifier().sanitize(dirty, DOMPURIFY_CONFIG) as unknown as string
}

/**
 * DOM-free allow-list sanitiser used during the static export, where DOMPurify
 * has no document to work with. It re-serialises the input: anything that is not
 * an allow-listed tag with allow-listed attributes never reaches the output, so
 * unknown constructs fail closed rather than passing through.
 *
 * Exported for tests - application code should call `sanitizeHtml`.
 */
export function sanitizeHtmlWithoutDom(dirty: string): string {
  let out = ''
  let i = 0
  const len = dirty.length
  // While inside a drop-with-content element we discard everything, tracking
  // nesting depth so a nested same-name tag does not end the drop early.
  let dropDepth = 0
  let dropTag = ''

  while (i < len) {
    const lt = dirty.indexOf('<', i)
    if (lt === -1) {
      if (dropDepth === 0) out += dirty.slice(i)
      break
    }
    if (dropDepth === 0) out += dirty.slice(i, lt)

    const head = dirty.slice(lt, lt + 4)

    if (head.startsWith('<!--')) {
      const end = dirty.indexOf('-->', lt + 4)
      i = end === -1 ? len : end + 3
      continue
    }
    if (head.startsWith('<!') || head.startsWith('<?')) {
      const end = dirty.indexOf('>', lt + 1)
      i = end === -1 ? len : end + 1
      continue
    }

    if (head.startsWith('</')) {
      const closer = /^<\/\s*([a-zA-Z][^\s>/]*)/.exec(dirty.slice(lt))
      if (!closer) {
        if (dropDepth === 0) out += '&lt;'
        i = lt + 1
        continue
      }
      const name = closer[1].toLowerCase()
      const end = dirty.indexOf('>', lt)
      i = end === -1 ? len : end + 1
      if (dropDepth > 0) {
        if (name === dropTag) {
          dropDepth -= 1
          if (dropDepth === 0) dropTag = ''
        }
      } else if (ALLOWED_TAG_SET.has(name) && !VOID_TAGS.has(name)) {
        out += `</${name}>`
      }
      continue
    }

    const opener = /^<\s*([a-zA-Z][^\s>/]*)/.exec(dirty.slice(lt))
    if (!opener) {
      // A bare `<` in prose. Escape it so it cannot start a tag downstream.
      if (dropDepth === 0) out += '&lt;'
      i = lt + 1
      continue
    }

    const name = opener[1].toLowerCase()
    const parsed = parseAttributes(dirty, lt + opener[0].length)
    i = parsed.next
    const isContainer = !parsed.selfClosing && !VOID_TAGS.has(name)

    if (dropDepth > 0) {
      if (name === dropTag && isContainer) dropDepth += 1
      continue
    }
    if (DROP_WITH_CONTENT.has(name)) {
      if (isContainer) {
        dropDepth = 1
        dropTag = name
      }
      continue
    }
    // Unknown but harmless tag: drop the tag, keep its text. Matches
    // DOMPurify's KEEP_CONTENT behaviour.
    if (!ALLOWED_TAG_SET.has(name)) continue

    out += `<${name}${serializeAttributes(name, parsed.attrs)}>`
  }

  return out
}

interface ParsedTag {
  attrs: Array<[string, string]>
  selfClosing: boolean
  next: number
}

function parseAttributes(src: string, from: number): ParsedTag {
  const attrs: Array<[string, string]> = []
  let selfClosing = false
  let pos = from
  const len = src.length

  while (pos < len) {
    const ch = src[pos]
    if (ch === '>') {
      pos += 1
      break
    }
    if (ch === '/') {
      selfClosing = true
      pos += 1
      continue
    }
    if (/\s/.test(ch)) {
      pos += 1
      continue
    }

    const nameStart = pos
    while (pos < len && !/[\s/>=]/.test(src[pos])) pos += 1
    const rawName = src.slice(nameStart, pos)
    if (!rawName) {
      // Malformed, e.g. `<a =x>`. Skip the stray character so we cannot spin.
      pos += 1
      continue
    }

    while (pos < len && /\s/.test(src[pos])) pos += 1

    let value = ''
    if (src[pos] === '=') {
      pos += 1
      while (pos < len && /\s/.test(src[pos])) pos += 1
      const quote = src[pos]
      if (quote === '"' || quote === "'") {
        pos += 1
        const end = src.indexOf(quote, pos)
        if (end === -1) {
          value = src.slice(pos)
          pos = len
        } else {
          value = src.slice(pos, end)
          pos = end + 1
        }
      } else {
        const valueStart = pos
        while (pos < len && !/[\s>]/.test(src[pos])) pos += 1
        value = src.slice(valueStart, pos)
      }
    }

    attrs.push([rawName.toLowerCase(), value])
  }

  return { attrs, selfClosing, next: pos }
}

function serializeAttributes(tag: string, attrs: Array<[string, string]>): string {
  let out = ''
  const seen = new Set<string>()

  for (const [name, value] of attrs) {
    if (seen.has(name)) continue
    if (!/^[a-z][a-z0-9:_.-]*$/.test(name)) continue
    if (name.startsWith('on')) continue
    if (!ALLOWED_ATTR_SET.has(name) && !name.startsWith('aria-')) continue
    if (URI_ATTR.has(name) && !isSafeUri(tag, name, value)) continue
    if (name === 'style' && UNSAFE_STYLE.test(decodeEntities(value))) continue

    seen.add(name)
    out += ` ${name}="${escapeAttributeValue(value)}"`
  }

  return out
}

function isSafeUri(tag: string, attr: string, value: string): boolean {
  const normalized = normalizeUri(value)
  if (SAFE_URI.test(normalized)) return true
  return tag === 'img' && attr === 'src' && INLINE_IMAGE_SRC.test(normalized)
}

function normalizeUri(value: string): string {
  // Browsers decode entities and ignore control characters and Unicode spaces
  // before resolving a URL, so `java&#9;script:` must be judged as
  // `javascript:`.
  return stripUrlNoise(decodeEntities(value))
}

function stripUrlNoise(value: string): string {
  let out = ''
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0
    if (code <= 0x20 || code === 0x7f) continue
    if (code === 0xa0 || code === 0x1680 || code === 0x180e) continue
    if (code >= 0x2000 && code <= 0x200f) continue
    if (code >= 0x2028 && code <= 0x202f) continue
    if (code === 0x205f || code === 0x3000 || code === 0xfeff) continue
    out += ch
  }
  return out
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  colon: ':',
  tab: '\t',
  newline: '\n',
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_m, hex: string) => fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_m, dec: string) => fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (m: string, entity: string) => NAMED_ENTITIES[entity.toLowerCase()] ?? m)
}

function fromCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return ''
  try {
    return String.fromCodePoint(code)
  } catch {
    return ''
  }
}

function escapeAttributeValue(value: string): string {
  // Entities already present are left alone; only the characters that could end
  // the attribute or open a tag are escaped.
  return value.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
