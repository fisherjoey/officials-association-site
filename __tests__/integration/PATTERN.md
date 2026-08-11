# Integration Testing Pattern

**Read this before adding a test.** Every test in `__tests__/integration/`
follows the same contract so the suite stays fast, deterministic, and
self-cleaning. Drift from the pattern leaks rows into Supabase or causes
flaky reruns.

## What an integration test is here

- Imports the Netlify function's `handler` directly
- Calls it via `invokeFunction()` (no HTTP server)
- Hits **real** Supabase using the service role key
- Mocks Microsoft Graph (so no email actually goes out)
- Tags every DB row it writes with `E2E_TAG` so cleanup can find them
- Cleans up in `afterAll` and sweeps orphans in `beforeAll`

If a test ever leaves a row behind, the pattern was broken. Fix it.

## File layout

```
__tests__/integration/
  helpers/                  Shared infra. Add new files here, but DO NOT
                            modify existing helpers in a parallel agent —
                            create a new file like helpers/calendar.ts.
    auth.ts                 createTestUser / withTestUser / cleanup
    invokeFunction.ts       call a Netlify handler with a synthetic event
    mockGraph.ts            intercepts Microsoft Graph fetch calls
    osaFixture.ts           OSA form fixture builders
    supabase.ts             admin client, E2E_TAG, cleanup helpers
  <feature>.test.ts         One file per feature/handler family
  PATTERN.md                this file
```

## The cleanup contract

Every row a test writes must satisfy:

1. **Tagged** — at least one searchable string column contains `E2E_TAG`
   (default: `E2E-TEST`). Use `tag('Suffix')` from `helpers/supabase.ts`
   to get a unique value per row.
2. **Swept on entry** — your suite calls a cleanup function in
   `beforeAll` so any orphan from a previous failed run is gone before
   you start.
3. **Cleaned on exit** — same cleanup function in `afterAll`.
4. **Wait for fire-and-forget** — if the handler does
   `supabase.from(...).insert(...).then(...)` without `await`, sleep
   ~500ms in `afterAll` before cleaning so the insert flushes.

For test users (auth.users), use `withTestUser()` or pair
`createTestUser()` with `deleteTestUser()` in `afterAll`.

## Required env vars

Always:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (for sign-in flow)
- `SUPABASE_SERVICE_ROLE_KEY` (for admin operations)

If your test exercises an email-sending handler, set placeholders so the
"service configured" guards don't 500 you out:
```ts
process.env.MICROSOFT_TENANT_ID  = process.env.MICROSOFT_TENANT_ID  || 'test-tenant'
process.env.MICROSOFT_CLIENT_ID  = process.env.MICROSOFT_CLIENT_ID  || 'test-client'
process.env.MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET || 'test-secret'
```

## Mocking Microsoft Graph

The handler reads OAuth tokens from `/oauth2/v2.0/token` and sends mail
to `/users/.../sendMail`. Wrap each test (or the file) with
`mockMicrosoftGraph()` which intercepts `global.fetch`:

```ts
import { mockMicrosoftGraph } from './helpers/mockGraph'

let graph: ReturnType<typeof mockMicrosoftGraph>
beforeEach(() => { graph = mockMicrosoftGraph() })
afterEach(() => { graph.restore() })

// later, assert routing:
expect(graph.sends.flatMap(s => s.toRecipients)).toContain('expected@addr')
```

Real fetch passes through for non-Graph URLs (Supabase, Safe Browsing,
etc.) so the rest of the handler still works.

## Auth: minting a test user

```ts
import { withTestUser } from './helpers/auth'

it('admin can do X', async () => {
  await withTestUser('admin', async (user) => {
    const res = await invokeFunction(handler, {
      method: 'GET',
      bearerToken: user.accessToken,
    })
    expect(res.statusCode).toBe(200)
  })
})
```

Roles: `'admin' | 'executive' | 'evaluator' | 'mentor' | 'official'`.

For files that exercise lots of cases, mint once in `beforeAll`:

```ts
let admin: TestUser, official: TestUser
beforeAll(async () => {
  await cleanupOrphanedTestUsers()
  ;[admin, official] = await Promise.all([
    createTestUser('admin'),
    createTestUser('official'),
  ])
})
afterAll(async () => {
  await Promise.all([deleteTestUser(admin), deleteTestUser(official)])
})
```

## Calling the handler

```ts
const res = await invokeFunction(handler, {
  method: 'POST',
  bearerToken: user.accessToken,    // Authorization: Bearer <jwt>
  body: { ... },                    // JSON-encoded; rawBody:true for strings
  query: { id: '123' },             // → event.queryStringParameters
  clientIp: '10.0.0.1',             // → x-forwarded-for; for rate limiters
})
expect(res.statusCode).toBe(200)
expect(res.body).toMatchObject({ success: true })
```

`res.body` is parsed JSON; `res.rawBody` is the raw string.

## Drift check — share payload builders with the frontend

If a test sends a request that the frontend also sends, **share the
payload-construction code** so a frontend refactor breaks the test:

- Move the wire-shape construction to `lib/forms/<thing>Payload.ts`,
  exporting both the type and a `build<Thing>Payload(state)` function.
- The frontend form imports + uses it on submit.
- The test imports it and feeds in a fixture state.

If the wire shape is essentially the form state (no transformation),
just `export` the interface from the handler and import it in the test.
TS will fail compilation if the form drifts from the handler.

Examples already in tree:
- `lib/forms/osaPayload.ts` (transformation)
- `ContactFormData` exported from `netlify/functions/contact-form.ts`
  (no transformation)

## Running tests

```bash
# whole suite
npm run test:integration

# one file
npm run test:integration -- __tests__/integration/calendar-events.test.ts

# match by test name
npm run test:integration -- -t "rejects non-POST"
```

Tests run with `--runInBand` (one file at a time) because they touch
shared external state. Don't try to parallelize.

## Template for a new test file

```ts
import { handler } from '@/netlify/functions/<name>'
import { invokeFunction } from './helpers/invokeFunction'
import {
  cleanupXxxRows,        // add yours to helpers/cleanup.ts if missing
  getSupabaseAdmin,
  tag,
} from './helpers/supabase'
import {
  createTestUser,
  deleteTestUser,
  cleanupOrphanedTestUsers,
  type TestUser,
} from './helpers/auth'
// import { mockMicrosoftGraph } from './helpers/mockGraph'  // if email send

let admin: TestUser
let official: TestUser

beforeAll(async () => {
  await cleanupOrphanedTestUsers()
  await cleanupXxxRows()
  ;[admin, official] = await Promise.all([
    createTestUser('admin'),
    createTestUser('official'),
  ])
}, 30_000)

afterAll(async () => {
  await Promise.all([deleteTestUser(admin), deleteTestUser(official)])
  await new Promise((r) => setTimeout(r, 300)) // let fire-and-forget flush
  await cleanupXxxRows()
})

describe('<feature>', () => {
  it('rejects unauthenticated', async () => {
    const res = await invokeFunction(handler, { method: 'GET' })
    expect(res.statusCode).toBe(401)
  })

  it('does the happy path', async () => {
    const res = await invokeFunction(handler, {
      method: 'POST',
      bearerToken: admin.accessToken,
      body: { name: tag('Foo') /* ...real wire shape */ },
    })
    expect(res.statusCode).toBe(201)

    // Verify the row landed where we expect
    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('xxx')
      .select('*')
      .like('name', '%E2E-TEST%')
    expect(data?.length).toBeGreaterThan(0)
  })
})
```

## When you find a bug

The whole point of writing these is to expose them. If a test reveals
broken behavior:

1. **Write the assertion describing what the code SHOULD do** (not what
   it does today).
2. Add `// BUG: <one-line description>` above the test.
3. Mark it with `it.failing(...)` so the suite stays green but the bug
   is visible in test output.
4. Note it in your handoff comment so it surfaces in review.

`it.failing` is preferred over `it.skip` — it fails loudly the moment
someone fixes the bug, prompting you to flip it back to `it`.

## What NOT to do

- ❌ Don't run a real `netlify dev` server in tests
- ❌ Don't make real Microsoft Graph calls
- ❌ Don't hardcode UUIDs — use the IDs you got back from the insert
- ❌ Don't share rows between tests (each test owns its data)
- ❌ Don't modify shared helpers in a parallel agent — add a new file
- ❌ Don't `await new Promise(setTimeout)` to "wait for things"; poll
  for the actual condition with a bounded retry loop
- ❌ Don't assume order — Jest can shuffle within a file
