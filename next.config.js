/** @type {import('next').NextConfig} */
const nextConfig = {
  // Only use static export for production builds, not in dev mode
  // Dev mode needs dynamic rendering for CSS/JS to load properly
  ...(process.env.NODE_ENV === 'production' && { output: 'export' }),
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

module.exports = nextConfig