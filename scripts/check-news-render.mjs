#!/usr/bin/env node
/**
 * Check that the exported news pages actually agree with `content/news/`.
 *
 *   npm run build && node scripts/check-news-render.mjs
 *
 * Two things used to be wrong here at once, and neither showed up as a build
 * error. `/news` listed rows out of the `public_news` table in the browser while
 * `/news/[slug]` was prerendered from `content/news/*.md`, so the list offered
 * links to pages the export did not contain. And the article page injected the
 * markdown body as if it were HTML, so `##` and `-` reached the reader as
 * literal characters. A static export gives you no signal for either: the first
 * is a 404 someone else finds, the second is a page that renders, badly.
 *
 * So this asserts the properties directly, against `out/`:
 *
 *   1. every article file has an exported page, and the exported index links to
 *      exactly those articles - no extras, no omissions;
 *   2. the rendered markdown survives into that page, compared against the same
 *      `remark` pipeline `lib/content.ts` uses rather than against a guess;
 *   3. no article page carries leftover markdown syntax in its body;
 *   4. `markdownToHtml` still refuses to emit raw HTML, which is the first of
 *      the two guards in front of the article body. The second is `sanitizeHtml`,
 *      covered by the unit suites under __tests__/unit/security.
 *
 * `scripts/check-exported-links.mjs` is the general version of (1) and runs over
 * the whole export; it now covers the news links too, because the index is
 * prerendered. This file is the news-specific half it cannot do: it knows what
 * the pages are supposed to contain, not just that they exist.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import matter from 'gray-matter'
import { remark } from 'remark'
import remarkHtml from 'remark-html'

const outDir = path.resolve(process.argv[2] ?? 'out')
const contentDir = path.resolve('content/news')

if (!fs.existsSync(outDir)) {
  console.error(`No export at ${outDir}. Run npm run build first.`)
  process.exit(2)
}

const failures = []
const fail = (msg) => failures.push(msg)

/** Same pipeline as `markdownToHtml` in lib/content.ts. */
const markdownToHtml = async (md) => String(await remark().use(remarkHtml).process(md))

const read = (p) => fs.readFileSync(p, 'utf8')

/** The body of the exported article, i.e. what the reader sees. */
const articleBody = (html) => {
  const start = html.indexOf('rich-text-content')
  return start === -1 ? '' : html.slice(start)
}

const decode = (s) =>
  s
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

// --- 1. article files vs exported pages -------------------------------------

const slugs = fs
  .readdirSync(contentDir)
  .filter((f) => f.endsWith('.md'))
  .map((f) => f.replace(/\.md$/, ''))
  .sort()

if (slugs.length === 0) fail('content/news/ has no articles, so this check proves nothing.')

const pageFor = (slug) => path.join(outDir, 'news', slug, 'index.html')

for (const slug of slugs) {
  if (!fs.existsSync(pageFor(slug))) fail(`content/news/${slug}.md has no page at out/news/${slug}/`)
}

const indexPath = path.join(outDir, 'news', 'index.html')
if (!fs.existsSync(indexPath)) {
  fail('No exported index at out/news/. The list is not prerendered.')
} else {
  const indexHtml = read(indexPath)
  const linked = new Set()
  for (const m of indexHtml.matchAll(/href="\/news\/([^/"?#]+)\/?"/g)) linked.add(m[1])

  for (const slug of slugs) {
    if (!linked.has(slug)) fail(`out/news/ does not link to ${slug}, which has a page`)
  }
  for (const slug of linked) {
    if (!slugs.includes(slug)) fail(`out/news/ links to /news/${slug}/, which has no article file`)
  }
}

// --- 2 & 3. rendered markdown, and no markdown left over --------------------

for (const slug of slugs) {
  if (!fs.existsSync(pageFor(slug))) continue

  const { content } = matter(read(path.join(contentDir, `${slug}.md`)))
  const rendered = await markdownToHtml(content)
  const body = articleBody(read(pageFor(slug)))

  const headings = [...rendered.matchAll(/<h([1-6])>([^<]+)<\/h\1>/g)]
  for (const [, level, text] of headings) {
    if (!body.includes(`<h${level}>${text}</h${level}>`)) {
      fail(`out/news/${slug}/ is missing the rendered heading <h${level}>${text}</h${level}>`)
    }
  }
  if (rendered.includes('<ul>') && !body.includes('<ul>')) {
    fail(`out/news/${slug}/ is missing the rendered list from its markdown`)
  }
  if (headings.length === 0 && !rendered.includes('<ul>')) {
    // Nothing structural to look for: at least confirm the prose arrived.
    if (!body.includes('<p>')) fail(`out/news/${slug}/ has no rendered paragraphs`)
  }

  const text = decode(body.replace(/<[^>]*>/g, '\n'))
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (/^#{1,6}\s/.test(trimmed)) fail(`out/news/${slug}/ shows a literal markdown heading: ${trimmed.slice(0, 60)}`)
    if (/^[-*]\s+\S/.test(trimmed)) fail(`out/news/${slug}/ shows a literal markdown list item: ${trimmed.slice(0, 60)}`)
    if (/\*\*\S/.test(trimmed)) fail(`out/news/${slug}/ shows literal markdown emphasis: ${trimmed.slice(0, 60)}`)
  }
}

// --- 4. the renderer does not emit raw HTML ---------------------------------

const RAW_HTML_PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '# Heading\n\n<img src=x onerror="alert(1)">\n',
  '<div onclick="alert(1)">click</div>',
  '<iframe src="javascript:alert(1)"></iframe>',
  '<a href="javascript:alert(1)">x</a>',
  '<svg onload=alert(1)></svg>',
]

for (const payload of RAW_HTML_PAYLOADS) {
  const rendered = await markdownToHtml(payload)
  if (/<\s*(script|img|iframe|svg|div)\b/i.test(rendered) || /\son\w+\s*=/i.test(rendered)) {
    fail(`markdownToHtml emitted raw HTML for ${JSON.stringify(payload)}: ${JSON.stringify(rendered)}`)
  }
}

// --- report -----------------------------------------------------------------

console.log(
  `Checked ${slugs.length} news article${slugs.length === 1 ? '' : 's'} against ${path.relative(process.cwd(), outDir) || '.'}/ ` +
    `and ${RAW_HTML_PAYLOADS.length} raw-HTML payloads through the renderer.`
)

if (failures.length === 0) {
  console.log('News list and article pages agree, and every body rendered as markdown.')
  process.exit(0)
}

console.error(`\n${failures.length} problem${failures.length === 1 ? '' : 's'}:`)
for (const f of failures) console.error(`  ${f}`)
process.exit(1)
