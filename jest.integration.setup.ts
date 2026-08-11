import { config as loadEnv } from 'dotenv'
import { existsSync } from 'fs'
import { join } from 'path'

// Load .env.test when present, falling back to .env.local. Netlify CI sets
// vars directly so neither file exists there — we just rely on process.env.
const envTest = join(__dirname, '.env.test')
const envLocal = join(__dirname, '.env.local')
if (existsSync(envTest)) loadEnv({ path: envTest, override: false })
else if (existsSync(envLocal)) loadEnv({ path: envLocal, override: false })

// Required for every integration test. The auth/portal tests tack on more
// (service role + test user creds); they validate those locally where used.
const REQUIRED = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']

const missing = REQUIRED.filter((k) => !process.env[k])
if (missing.length) {
  throw new Error(
    `Integration tests require these env vars: ${missing.join(', ')}. ` +
      `Set them in .env.test, .env.local, or the Netlify build environment.`
  )
}
