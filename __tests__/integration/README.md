# Integration tests

## What this is

This suite exercises the Netlify functions that back the site against a
real Supabase project, with Microsoft Graph (the email send path) intercepted
in-process. It's the layer that catches handler-level regressions — auth
gating, payload shape, DB writes, email routing — without paying for a real
inbox or a deployed function URL.

## Quick start

You need a `.env.local` (or `.env.test`) at the repo root with at least
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY`. The setup file (`jest.integration.setup.ts`)
will refuse to start without the URL and service role key.

```bash
# whole suite
npm run test:integration

# one file
npm run test:integration -- __tests__/integration/contact-form.test.ts

# match by test name
npm run test:integration -- -t "rejects non-POST"
```

The script lives in `package.json` as `test:integration` and runs
`jest --config jest.config.integration.js --runInBand`. Tests are forced
serial (`maxWorkers: 1`) because they share Supabase state.

## What's covered

Six test files live in this directory. Block counts are `it` + `it.each`
declarations; `it.each` expands into multiple cases at runtime, so the
actual number of assertions is higher.

| File | Blocks | Covers |
|---|---|---|
| `_smoke.test.ts` | 3 | Sanity: env vars load, service-role Supabase reachable, `invokeFunction` round-trips a fake handler. |
| `contact-form.test.ts` | 10 | Validation matrix for `/contact-form`, complaint-flow gate, attachment URL allowlist, happy-path persist + Graph routing. |
| `osa-webhook.test.ts` | 9 | OSA exhibition / league / tournament / multi-event submissions, dead-inbox routing, idempotent replay, payload validation. |
| `portal.test.ts` | 11 | Auth gate matrix across 13 portal handlers — `401` unauthenticated, `403` for under-privileged, `200` for the right role, plus self-scoped checks on `members`. |
| `public-reads.test.ts` | 7 | The four public read endpoints (news / pages / resources / training) return arrays on `GET` and reject writes. |
| `verify-email.test.ts` | 4 | Email verification round-trip: issue token, sniff code from the mocked Graph send, verify + reject mismatched email. |

## Adding a new test

The full contract — cleanup, tagging, drift checks, what NOT to do — lives
in [`PATTERN.md`](./PATTERN.md). Read it first, then copy an existing test
as scaffolding:

- **CRUD against a portal table** → start from `portal.test.ts` for
  read/write auth gating, and lift fixture and cleanup patterns from
  `osa-webhook.test.ts` when you need to assert on persisted rows.
- **Public form handler that emails** → `osa-webhook.test.ts` is the
  canonical example (mocked Graph + dead-inbox routing + DB persistence +
  idempotency).
- **Pure validation / no DB write** → `verify-email.test.ts` is the
  smallest working pattern.
- **Public read endpoint** → `public-reads.test.ts`.

If you need a cleanup helper for a new table, add it to
`helpers/cleanup.ts` (don't edit `supabase.ts`).

## Helpers

- `helpers/auth.ts` — mint and tear down test auth users by role
  (`createTestUser`, `withTestUser`, `cleanupOrphanedTestUsers`).
- `helpers/cleanup.ts` — per-table delete-by-`E2E_TAG` helpers; one entry
  per portal table the suite writes to.
- `helpers/invokeFunction.ts` — call a Netlify handler with a synthetic
  `HandlerEvent`; no HTTP server.
- `helpers/mockGraph.ts` — patch `global.fetch` to intercept Graph token
  and `sendMail` calls and capture them for assertions.
- `helpers/osaFixture.ts` — builders for OSA form payloads (exhibition,
  league, tournament, multi-event).
- `helpers/seedMember.ts` — insert a `members` row tied to a test auth
  user (needed for portal endpoints that key off `members.user_id`).
- `helpers/supabase.ts` — service-role client, `E2E_TAG`, `tag()` helper,
  and OSA / contact / log cleanup.

## Cleanup contract

Every row a test writes is tagged with `E2E_TAG` (`E2E-TEST`) on a
searchable column — usually via `tag('Suffix')` from `helpers/supabase.ts`.
Each test file calls its cleanup helper in both `beforeAll` (to sweep any
orphans a previous failed run left behind) and `afterAll` (to clean up its
own rows). Test auth users follow the same pattern via
`cleanupOrphanedTestUsers()`. If a handler does a fire-and-forget DB
insert, sleep ~500 ms in `afterAll` before cleaning so the insert
flushes. The full reasoning is in [`PATTERN.md`](./PATTERN.md).

## Config

- `jest.config.integration.js` — `testEnvironment: 'node'`, loads
  `jest.integration.setup.ts`, restricts `testMatch` to this directory,
  pins `maxWorkers: 1` and a 30 s timeout, and disables coverage.
- `jest.integration.setup.ts` — loads `.env.test` (or `.env.local`) into
  `process.env` and throws if `NEXT_PUBLIC_SUPABASE_URL` or
  `SUPABASE_SERVICE_ROLE_KEY` is missing.

## CI

`netlify.toml` declares the build command as
`npm install && npm run test:integration && npm run build`, so the
integration suite runs on every Netlify deploy before Next.js builds. A
test failure fails the deploy. The required env vars
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, plus the `MICROSOFT_*` placeholders the
email-sending handlers guard on) are set in the Netlify dashboard under
the site's build environment.

## Common gotchas

- **Test failed but I can't tell why.** Handlers log via the Logger and
  those messages go to stdout. Scroll up in the Jest output (or the
  Netlify build log) — the structured log lines with the correlation id
  are usually right above the assertion failure.
- **`ECONNRESET` or Supabase timeout.** Almost always transient network.
  Re-run the file once. If it repeats, check Supabase status and that
  your `.env.local` URL/key match the project you expect.
- **Email assertion is failing / no sends captured.** Did you wrap the
  test (or `beforeEach`) with `mockMicrosoftGraph()`? Without it, the
  handler's "service configured" guard returns 500 because the real
  `MICROSOFT_*` env vars aren't set in CI. The mock provides them
  implicitly via the placeholder env writes at the top of each
  email-sending file.
- **DB row count is growing.** `afterAll` cleanup didn't run (likely a
  thrown error in setup before the cleanup was registered, or the wrong
  cleanup function for the table you wrote). Find your tagged rows with
  `select * from <table> where <col> like 'E2E-TEST%'` and decide
  whether to fix the test or sweep with `cleanupEverything()`.
- **TypeScript error in a test.** That's usually the drift check working
  — the test imports the wire-shape type from the handler (or from
  `lib/forms/*Payload.ts`), so a frontend-vs-handler mismatch shows up
  here at compile time. Fix the underlying shape, not the test.
