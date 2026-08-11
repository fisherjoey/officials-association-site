/**
 * Drift guards for the optional-module flags in lib/siteConfig.ts.
 *
 * The bug this file exists to prevent: a module that is off in the nav and on
 * in the export, or the reverse. This is a static export, so a link to a route
 * that was never built is a silent 404 on a live site — no build error, no
 * redirect, nothing in CI unless something looks for it.
 *
 * Four things have to agree for a flag to mean anything, and they live in four
 * different places: the `MODULES` flag, the `PORTAL_MODULES` entry, the
 * `page.module-<key>.tsx` file on disk, and the nav code that renders a link to
 * the route. Each block below pins one of those joins.
 */

import fs from 'fs'
import path from 'path'

import {
  MODULES,
  PORTAL_MODULES,
  isRouteEnabled,
  modulePageExtension,
  enabledModulePageExtensions,
  type ModuleKey,
} from '@/lib/siteConfig'

const repoRoot = path.join(__dirname, '..', '..', '..')

/** `/portal/admin/logs` → `app/portal/admin/logs` */
const routeDir = (routePath: string) => path.join(repoRoot, 'app', routePath.replace(/^\//, ''))

const sourceFiles = (dir: string): string[] => {
  const abs = path.join(repoRoot, dir)
  if (!fs.existsSync(abs)) return []

  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(rel)
    return /\.tsx?$/.test(entry.name) ? [rel] : []
  })
}

describe('module registry', () => {
  it('lists every flag exactly once', () => {
    const registryKeys = PORTAL_MODULES.map((mod) => mod.key).sort()
    const flagKeys = (Object.keys(MODULES) as ModuleKey[]).sort()

    expect(registryKeys).toEqual(flagKeys)
    expect(new Set(registryKeys).size).toBe(registryKeys.length)
  })

  it('gives every module its own route', () => {
    const paths = PORTAL_MODULES.map((mod) => mod.path)

    expect(new Set(paths).size).toBe(paths.length)
    for (const routePath of paths) {
      expect(routePath.startsWith('/portal/')).toBe(true)
    }
  })

  it('gives every module a label to render', () => {
    for (const mod of PORTAL_MODULES) {
      expect(mod.label.trim()).not.toBe('')
    }
  })
})

describe('a flag reaches the route, not just the nav', () => {
  // Next.js decides what is a route from `pageExtensions`. An optional module's
  // page file is `page.module-<key>.tsx`, which is only a route while
  // next.config.ts includes that extension. If the file were called `page.tsx`
  // the route would build no matter what the flag said, and the flag would be a
  // nav-hiding cosmetic.
  it.each(PORTAL_MODULES.map((mod) => [mod.key, mod.path] as const))(
    '%s keeps its page file behind the module extension',
    (key, routePath) => {
      const dir = routeDir(routePath)

      expect(fs.existsSync(path.join(dir, `page.${modulePageExtension(key)}`))).toBe(true)
      expect(fs.existsSync(path.join(dir, 'page.tsx'))).toBe(false)
    }
  )

  it('has no gated page file that no module claims', () => {
    const claimed = new Set(
      PORTAL_MODULES.map((mod) => path.join('app', mod.path.replace(/^\//, ''), `page.${modulePageExtension(mod.key)}`))
    )

    const gated = sourceFiles('app').filter((rel) => /(^|[/\\])page\..+\.tsx$/.test(rel))

    expect(gated.filter((rel) => !claimed.has(rel))).toEqual([])
  })

  it('derives the extension list from the flags', () => {
    const expected = PORTAL_MODULES.filter((mod) => MODULES[mod.key]).map((mod) =>
      modulePageExtension(mod.key)
    )

    expect(enabledModulePageExtensions()).toEqual(expected)
  })

  it('is what next.config.ts actually feeds pageExtensions', () => {
    // Source-level: the point is that the config computes the list rather than
    // repeating it, and a hardcoded copy is what would rot.
    const config = fs.readFileSync(path.join(repoRoot, 'next.config.ts'), 'utf8')

    expect(config).toContain("from './lib/siteConfig'")
    expect(config).toMatch(/pageExtensions:\s*\[[^\]]*\.\.\.enabledModulePageExtensions\(\)/)
  })
})

describe('isRouteEnabled', () => {
  it('follows the flag for a module route', () => {
    for (const mod of PORTAL_MODULES) {
      expect(isRouteEnabled(mod.path)).toBe(MODULES[mod.key])
    }
  })

  it('passes core routes, which no flag owns', () => {
    for (const core of [
      '/portal',
      '/portal/profile',
      '/portal/members',
      '/portal/calendar',
      '/portal/resources',
      '/portal/news',
      '/portal/admin',
      '/portal/admin/public-content/news',
      '/portal/admin/service-requests',
    ]) {
      expect(isRouteEnabled(core)).toBe(true)
    }
  })
})

describe('nav code cannot hardcode a link past a flag', () => {
  // The failure mode is a component that renders a link to a module route
  // without consulting the flags. It looks fine while every module is on, and
  // ships a dead link the first time an adopter turns one off. Any file that
  // names a module's route has to be reading the flags from somewhere.
  const CLIENT_DIRS = ['app', 'components', 'contexts']

  it.each(PORTAL_MODULES.map((mod) => [mod.key, mod.path] as const))(
    'every file naming the %s route reads the flags',
    (_key, routePath) => {
      const ownDir = path.join('app', routePath.replace(/^\//, ''))

      const offenders = CLIENT_DIRS.flatMap(sourceFiles)
        // A module's own page and its colocated components are already gone
        // when the module is off — they are never compiled.
        .filter((rel) => !rel.startsWith(ownDir + path.sep))
        .filter((rel) => {
          const text = fs.readFileSync(path.join(repoRoot, rel), 'utf8')
          if (!text.includes(routePath)) return false
          return !/\b(isRouteEnabled|MODULES)\b/.test(text)
        })

      expect(offenders).toEqual([])
    }
  )
})
