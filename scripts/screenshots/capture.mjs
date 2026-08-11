#!/usr/bin/env node
/**
 * Capture the README screenshots from a running stack.
 *
 * Normally driven by scripts/screenshots/regenerate.sh, which starts Supabase,
 * seeds the fictional demo data and serves the static export first. Run it
 * directly only when a server is already up:
 *
 *   BASE_URL=http://127.0.0.1:9000 node scripts/screenshots/capture.mjs
 *
 * Playwright is not a dependency of this project — see the note in
 * regenerate.sh. Install it with `npm install --no-save playwright`.
 *
 * Images are written as JPEG. A clone should stay cheap, and quality 82 at
 * these widths is indistinguishable from PNG in a README while being roughly a
 * fifth the size.
 */

import { createRequire } from 'node:module'
import { mkdir, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

const require = createRequire(import.meta.url)

let chromium
try {
  ({ chromium } = require('playwright'))
} catch {
  console.error('Playwright is not installed. Run: npm install --no-save playwright && npx playwright install chromium')
  process.exit(1)
}

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:9000').replace(/\/$/, '')
const OUT = path.resolve('docs/screenshots')

const DESKTOP = { width: 1280, height: 860 }
const PHONE = { width: 390, height: 844 }

/** The account the portal shots are taken as. Created by seed.mjs. */
const LOGIN = { email: 'alina.vosberg@example.org', password: 'demo-portal-password' }

async function settle(page, { scroll = true } = {}) {
  await page.waitForLoadState('networkidle').catch(() => {})
  if (scroll) {
    // Force any lazy image or intersection-observer section to resolve, then
    // come back to the top so the capture starts where a reader would.
    await page.evaluate(async () => {
      const step = window.innerHeight
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y)
        await new Promise((r) => setTimeout(r, 60))
      }
      window.scrollTo(0, 0)
    })
  }
  await page.waitForTimeout(700)
}

async function shot(target, name, options = {}) {
  const file = path.join(OUT, `${name}.jpg`)
  await target.screenshot({ path: file, type: 'jpeg', quality: 82, ...options })
  const { size } = await stat(file)
  console.log(`  ${name}.jpg  ${(size / 1024).toFixed(0)} KB`)
}

/**
 * Scroll to a fixed offset and shoot the viewport. The site header is sticky,
 * so a mid-page frame still reads as a page rather than a floating crop.
 */
async function shotAt(page, name, y) {
  await page.evaluate((top) => window.scrollTo(0, top), y)
  await page.waitForTimeout(600)
  await shot(page, name)
}

async function login(page) {
  await page.goto(`${BASE}/login/`, { waitUntil: 'domcontentloaded' })
  // Scope to the sign-in form: the site header carries a search form whose
  // submit button would otherwise match first.
  const form = page.locator('form').filter({ has: page.locator('#email') })
  await page.fill('#email', LOGIN.email)
  await page.fill('#password', LOGIN.password)
  await Promise.all([
    page.waitForURL(/\/portal/, { timeout: 30_000 }),
    form.locator('button[type="submit"]').click(),
  ])
  await settle(page)
}

async function main() {
  await mkdir(OUT, { recursive: true })

  const browser = await chromium.launch()

  // ---- public site, desktop -------------------------------------------------
  const desktop = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 1 })
  const page = await desktop.newPage()

  console.log('public site')
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await settle(page)
  // Hero plus the booking call to action — the whole page above the footer.
  await shot(page, 'public-home', { fullPage: true, clip: { x: 0, y: 0, width: 1280, height: 1340 } })

  await page.goto(`${BASE}/about/`, { waitUntil: 'domcontentloaded' })
  await settle(page)
  // Framed on the section the portal CMS writes, not the static copy above it.
  await shotAt(page, 'public-about', 940)

  await page.goto(`${BASE}/news/`, { waitUntil: 'domcontentloaded' })
  await settle(page)
  await shotAt(page, 'public-news', 520)

  await page.goto(`${BASE}/contact/`, { waitUntil: 'domcontentloaded' })
  await settle(page)
  await shotAt(page, 'public-contact', 620)

  await desktop.close()

  // ---- portal, desktop, light ----------------------------------------------
  const portal = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 1 })
  await portal.addInitScript(() => window.localStorage.setItem('portal-theme', 'light'))
  const portalPage = await portal.newPage()

  console.log('portal (light)')
  await login(portalPage)
  await shot(portalPage, 'portal-dashboard')

  // The four external tiles in this card render only for the services set in
  // lib/siteConfig.ts, so the card is the flag-gated surface itself.
  const quickLinks = portalPage.getByRole('heading', { name: 'Quick Links' }).first().locator('xpath=..')
  await quickLinks.scrollIntoViewIfNeeded()
  await portalPage.waitForTimeout(400)
  await shot(quickLinks, 'portal-configured-services')

  await portalPage.goto(`${BASE}/portal/members/`, { waitUntil: 'domcontentloaded' })
  await settle(portalPage, { scroll: false })
  await shot(portalPage, 'portal-members')

  await portalPage.goto(`${BASE}/portal/admin/public-content/news/`, { waitUntil: 'domcontentloaded' })
  await settle(portalPage, { scroll: false })
  await shot(portalPage, 'portal-public-content-admin')

  await portal.close()

  // ---- portal, desktop, dark ------------------------------------------------
  const dark = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 1, colorScheme: 'dark' })
  await dark.addInitScript(() => window.localStorage.setItem('portal-theme', 'dark'))
  const darkPage = await dark.newPage()

  console.log('portal (dark)')
  await login(darkPage)
  await shot(darkPage, 'portal-dashboard-dark')
  await dark.close()

  // ---- phone ----------------------------------------------------------------
  const phone = await browser.newContext({
    viewport: PHONE,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  await phone.addInitScript(() => window.localStorage.setItem('portal-theme', 'light'))
  const phonePage = await phone.newPage()

  console.log('phone')
  await phonePage.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await settle(phonePage)
  await shot(phonePage, 'mobile-home')

  await login(phonePage)
  await shot(phonePage, 'mobile-portal-dashboard')
  await phone.close()

  await browser.close()

  const files = (await readdir(OUT)).filter((f) => f.endsWith('.jpg')).sort()
  let total = 0
  for (const f of files) total += (await stat(path.join(OUT, f))).size
  console.log(`\n${files.length} images, ${(total / 1024).toFixed(0)} KB total.`)
  console.log('Open every one of them before committing. No real name, address or phone number belongs in a committed image.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
