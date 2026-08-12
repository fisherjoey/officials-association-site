import type { NextConfig } from 'next'

import { enabledModulePageExtensions } from './lib/siteConfig'

/**
 * This file is TypeScript so it can import `lib/siteConfig.ts` directly.
 *
 * That import is the point. Optional modules are gated by which page files
 * Next.js is willing to treat as routes, and the flags that decide are in
 * siteConfig alongside everything else an adopter edits. A `.js` config would
 * have needed its own copy of the flags, which is the drift this arrangement
 * exists to prevent. Next.js transpiles a `.ts` config and the files it
 * imports, so there is no build step to keep in sync.
 */
const nextConfig: NextConfig = {
  // Only use static export for production builds, not in dev mode
  // Dev mode needs dynamic rendering for CSS/JS to load properly
  ...(process.env.NODE_ENV === 'production' && { output: 'export' as const }),

  /**
   * The route half of the module flags in `lib/siteConfig.ts`.
   *
   * The first four are the Next.js defaults and cover every core route. Each
   * enabled optional module adds one more, `module-<key>.tsx`, which is what
   * turns that module's `page.module-<key>.tsx` into a route. Leave the
   * extension out and the same file is inert: Next.js never compiles it, and
   * nothing for that route reaches `out/`.
   *
   * Because this is resolved here, at build time, a flag change needs a
   * rebuild. There is no request-time behaviour to fall back on — the export
   * has no server.
   */
  pageExtensions: ['tsx', 'ts', 'jsx', 'js', ...enabledModulePageExtensions()],

  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  eslint: {
    // Lint errors fail the build. Previously this was `true`, which
    // let regressions ship — including hook-deps mistakes and
    // floating-promise bugs that should have been caught before merge.
    // If a specific rule is too noisy for CI, address it via
    // .eslintrc overrides rather than re-enabling this escape hatch.
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
}

export default nextConfig
