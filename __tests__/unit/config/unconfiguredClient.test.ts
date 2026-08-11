import fs from 'fs'
import path from 'path'

/**
 * The unconfigured-Supabase contract, from the point of view of an adopter who
 * has cloned this template and run `npm run build` before creating a project.
 *
 * `getSupabaseBrowserClient()` deliberately returns a Proxy stub when the env
 * vars are absent. The comment on that stub states the bargain it is making:
 * constructing it never throws, and only touching a property does, so the
 * failure lands at request time — inside a caller that is already in a
 * try/catch — instead of at import time, where it would take the build down.
 *
 * That bargain has one sharp edge, and it drew blood. A React dependency array
 * is evaluated during render, so `useEffect(..., [router, supabase.auth])`
 * reads a property off the stub every render, outside any try/catch the effect
 * body provides. `/auth/set-password` and `/auth/complete-profile` both did it,
 * and both answered an adopter's first build with Next's bare "Application
 * error: a client-side exception has occurred" — no nav, no message, nothing to
 * act on. The effect's own error handling was irrelevant; the throw happened
 * before the effect ever ran.
 *
 * Rendering those two pages here would only pin the two that were already
 * fixed. The scan below covers the shape instead, so the next page to reach for
 * `supabase.auth` in a dep array fails in CI rather than on a stranger's laptop.
 */

const REPO_ROOT = path.resolve(__dirname, '../../..')
const SCAN_DIRS = ['app', 'components', 'contexts']
const SOURCE_EXT = new Set(['.ts', '.tsx'])

function sourceFiles(dir: string): string[] {
  const abs = path.join(REPO_ROOT, dir)
  if (!fs.existsSync(abs)) return []
  const found: string[] = []
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
        walk(full)
      } else if (SOURCE_EXT.has(path.extname(entry.name)) && !entry.name.endsWith('.d.ts')) {
        found.push(full)
      }
    }
  }
  walk(abs)
  return found
}

/** Local names bound to the browser client in a given source file. */
function clientBindings(src: string): string[] {
  const names = new Set<string>()
  const assignment = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*getSupabaseBrowserClient\s*\(\s*\)/g
  let m: RegExpExecArray | null
  while ((m = assignment.exec(src)) !== null) names.add(m[1])
  return [...names]
}

/**
 * Dependency arrays, i.e. the `[...]` in `}, [deps])` that closes a
 * useEffect / useMemo / useCallback. Deliberately narrow: it only matches a
 * list that directly follows a closing brace, which is the hook-tail shape.
 */
function dependencyArrays(src: string): string[] {
  const tail = /\}\s*,\s*\[([\s\S]*?)\]\s*\)/g
  const lists: string[] = []
  let m: RegExpExecArray | null
  while ((m = tail.exec(src)) !== null) lists.push(m[1])
  return lists
}

describe('unconfigured Supabase client', () => {
  it('never dereferences the client inside a hook dependency array', () => {
    const offenders: string[] = []

    for (const dir of SCAN_DIRS) {
      for (const file of sourceFiles(dir)) {
        const src = fs.readFileSync(file, 'utf8')
        const names = clientBindings(src)
        if (names.length === 0) continue

        for (const deps of dependencyArrays(src)) {
          // Strip comments; the fix for this very bug explains itself in one.
          const code = deps
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/[^\n]*/g, '')

          for (const name of names) {
            if (new RegExp(`\\b${name}\\s*\\.`).test(code)) {
              offenders.push(
                `${path.relative(REPO_ROOT, file)} — [${code.trim().replace(/\s+/g, ' ')}]`
              )
            }
          }
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('scans a meaningful number of files, so a passing result means something', () => {
    // Guards the guard: if the walk silently stops finding source, the test
    // above passes vacuously and the regression walks straight back in.
    const total = SCAN_DIRS.reduce((n, d) => n + sourceFiles(d).length, 0)
    expect(total).toBeGreaterThan(50)

    const withClient = SCAN_DIRS.flatMap(sourceFiles).filter(
      (f) => clientBindings(fs.readFileSync(f, 'utf8')).length > 0
    )
    expect(withClient.length).toBeGreaterThan(0)
  })

  it('detects the exact pattern that shipped, when it is present', () => {
    // The regression as it actually appeared, run through the same matcher, so
    // a future refactor of these helpers cannot quietly stop detecting it.
    const shipped = `
      const supabase = getSupabaseBrowserClient()
      useEffect(() => {
        checkAuth()
      }, [router, supabase.auth])
    `
    const names = clientBindings(shipped)
    expect(names).toEqual(['supabase'])

    const hits = dependencyArrays(shipped).filter((deps) =>
      names.some((n) => new RegExp(`\\b${n}\\s*\\.`).test(deps))
    )
    expect(hits).toHaveLength(1)
  })

  it('accepts depending on the client itself, which is the fix', () => {
    const fixed = `
      const supabase = getSupabaseBrowserClient()
      useEffect(() => {
        checkAuth()
      }, [router, supabase])
    `
    const names = clientBindings(fixed)
    const hits = dependencyArrays(fixed).filter((deps) =>
      names.some((n) => new RegExp(`\\b${n}\\s*\\.`).test(deps))
    )
    expect(hits).toEqual([])
  })
})
