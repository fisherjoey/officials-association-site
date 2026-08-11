#!/usr/bin/env node
/**
 * Walk the built static export and fail on any local link that resolves to
 * nothing.
 *
 *   npm run build && node scripts/check-exported-links.mjs
 *
 * Worth having because of what `output: 'export'` costs you. There is no server
 * at the other end of a link, so a wrong href is not a 500 you will see in a
 * log or a build error you will see in CI — it is a 404 page, served to a
 * member, discovered when they mention it. Deleting a route or switching off a
 * module in lib/siteConfig.ts is exactly the change that leaves one behind.
 *
 * The check is deliberately dumb: read every `href` out of every exported HTML
 * file, drop the ones that leave the site, and ask the filesystem whether the
 * rest exist. It does not run the app, so it cannot see links a component only
 * renders after it has data. Treat a clean run as "nothing prerendered is
 * broken", not as proof of full coverage.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const outDir = path.resolve(process.argv[2] ?? 'out')

if (!fs.existsSync(outDir)) {
  console.error(`No export at ${outDir}. Run npm run build first.`)
  process.exit(2)
}

const htmlFiles = []
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (entry.name.endsWith('.html')) htmlFiles.push(full)
  }
}
walk(outDir)

/** Links that leave the site, or that the filesystem cannot answer for. */
const isExternal = (href) =>
  /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//') || href.startsWith('#')

/**
 * Does this path exist in the export? `trailingSlash: true` means routes are
 * written as `<route>/index.html`, but assets are plain files, so try both.
 */
const resolves = (urlPath) => {
  const clean = decodeURIComponent(urlPath.split('#')[0].split('?')[0])
  const target = path.join(outDir, clean)

  if (fs.existsSync(target) && fs.statSync(target).isFile()) return true
  if (fs.existsSync(path.join(target, 'index.html'))) return true
  if (fs.existsSync(`${target}.html`)) return true
  return false
}

const broken = new Map()
let checked = 0

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8')
  const page = `/${path.relative(outDir, file).split(path.sep).join('/')}`

  for (const match of html.matchAll(/href="([^"]*)"/g)) {
    const href = match[1]
    if (href === '' || isExternal(href)) continue
    if (!href.startsWith('/')) continue // relative hrefs: none are emitted today
    checked += 1
    if (resolves(href)) continue

    if (!broken.has(href)) broken.set(href, new Set())
    broken.get(href).add(page)
  }
}

console.log(
  `Checked ${checked} local links across ${htmlFiles.length} exported pages in ${path.relative(process.cwd(), outDir) || '.'}/`
)

if (broken.size === 0) {
  console.log('No dangling links.')
  process.exit(0)
}

console.error(`\n${broken.size} dangling link${broken.size === 1 ? '' : 's'}:`)
for (const [href, pages] of [...broken].sort()) {
  console.error(`  ${href}`)
  for (const page of [...pages].sort().slice(0, 5)) console.error(`      from ${page}`)
  if (pages.size > 5) console.error(`      …and ${pages.size - 5} more pages`)
}
process.exit(1)
