/**
 * Where a caller's rung comes from, pinned.
 *
 * `getPrincipal()` used to read `app_metadata.role`, then fall back to
 * `user_metadata.role`. The second of those is whatever the account last sent
 * to `PUT /auth/v1/user` — an ordinary authenticated call — so any account
 * without a server-set `app_metadata.role` could name its own rung, and a
 * capability slug in the same field bought the matching grant.
 *
 * `__tests__/integration/principal-escalation.test.ts` runs that attack end to
 * end against a live stack. This file is the cheap half: it holds the resolver
 * to the one source it is allowed to read, without a database, so the property
 * is checked on every `npm test` rather than only when Supabase is up.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

// handler.ts builds a service-role client at import time. Nothing here uses it
// — every call below is handed an explicit client — but the constructor still
// has to not throw.
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({})),
}))

import {
  getPrincipal,
  createPrincipalCache,
  PrincipalLookupError,
} from '@/netlify/functions/_shared/handler'

interface RosterRow {
  role?: unknown
  capabilities?: unknown
}

interface FakeClient {
  client: SupabaseClient
  /** How many roster lookups actually reached the database. */
  queries: () => number
  /** The `user_id` each lookup filtered on, in order. */
  filters: () => unknown[]
}

/**
 * The two-column roster read, and nothing else. Written as the real chain
 * (`from().select().eq().maybeSingle()`) so a resolver that reached for a
 * different table or a different column would fail here rather than pass.
 */
function fakeClient(
  answer: { data: RosterRow | null; error?: { message: string } | null }
): FakeClient {
  const filters: unknown[] = []
  let queries = 0

  const client = {
    from(table: string) {
      if (table !== 'members') throw new Error(`unexpected table: ${table}`)
      return {
        select(columns: string) {
          if (columns !== 'role, capabilities') {
            throw new Error(`unexpected columns: ${columns}`)
          }
          return {
            eq(column: string, value: unknown) {
              if (column !== 'user_id') throw new Error(`unexpected column: ${column}`)
              filters.push(value)
              return {
                async maybeSingle() {
                  queries += 1
                  return { data: answer.data, error: answer.error ?? null }
                },
              }
            },
          }
        },
      }
    },
  } as unknown as SupabaseClient

  return { client, queries: () => queries, filters: () => filters }
}

const SELF_DECLARED = {
  id: 'user-1',
  app_metadata: { role: 'admin', capabilities: ['evaluator', 'scheduler'], roles: ['admin'] },
  user_metadata: { role: 'admin', roles: ['admin'] },
}

describe('the roster row is the answer', () => {
  it('takes the rung and the grants from members', async () => {
    const fake = fakeClient({ data: { role: 'executive', capabilities: ['evaluator'] } })

    const principal = await getPrincipal({ id: 'user-1' }, undefined, fake.client)

    expect(principal).toEqual({ role: 'executive', capabilities: ['evaluator'] })
    expect(fake.filters()).toEqual(['user-1'])
  })

  it('folds the retired spelling of the bottom rung', async () => {
    // Rows written before 0015 renamed it. The CHECK constraint refuses new
    // ones, but `normalizeStructuralRole` still resolves the old name.
    const fake = fakeClient({ data: { role: 'official', capabilities: [] } })

    expect(await getPrincipal({ id: 'user-1' }, undefined, fake.client)).toEqual({
      role: 'member',
      capabilities: [],
    })
  })

  it('gives a grant without a rung when the row has one and not the other', async () => {
    // `members.role` is nullable and means "not assigned". The SQL side says
    // the same: structural_role() returns NULL, has_capability() returns true.
    const fake = fakeClient({ data: { role: null, capabilities: ['evaluator'] } })

    expect(await getPrincipal({ id: 'user-1' }, undefined, fake.client)).toEqual({
      role: null,
      capabilities: ['evaluator'],
    })
  })
})

describe('metadata is not an answer', () => {
  it('ignores a self-declared admin in user_metadata', async () => {
    const fake = fakeClient({ data: { role: 'member', capabilities: [] } })

    expect(await getPrincipal(SELF_DECLARED, undefined, fake.client)).toEqual({
      role: 'member',
      capabilities: [],
    })
  })

  it('ignores app_metadata too, so there is no second copy to keep in step', async () => {
    const fake = fakeClient({ data: null })

    expect(await getPrincipal(SELF_DECLARED, undefined, fake.client)).toEqual({
      role: null,
      capabilities: [],
    })
  })
})

describe('a signed-in user with no roster row', () => {
  it('is nobody, not a member', async () => {
    const fake = fakeClient({ data: null })

    const principal = await getPrincipal({ id: 'user-1' }, undefined, fake.client)

    expect(principal.role).toBeNull()
    expect(principal.capabilities).toEqual([])
  })

  it('does not even ask when there is no user id', async () => {
    const fake = fakeClient({ data: { role: 'admin', capabilities: [] } })

    expect(await getPrincipal(null, undefined, fake.client)).toEqual({
      role: null,
      capabilities: [],
    })
    expect(fake.queries()).toBe(0)
  })
})

describe('a failed lookup is a fault, not a refusal', () => {
  it('throws rather than resolving to nobody', async () => {
    const fake = fakeClient({ data: null, error: { message: 'connection reset' } })

    await expect(getPrincipal({ id: 'user-1' }, undefined, fake.client)).rejects.toBeInstanceOf(
      PrincipalLookupError
    )
  })
})

describe('the per-request cache', () => {
  it('resolves the same user once', async () => {
    const fake = fakeClient({ data: { role: 'admin', capabilities: [] } })
    const cache = createPrincipalCache()

    const [a, b] = await Promise.all([
      getPrincipal({ id: 'user-1' }, cache, fake.client),
      getPrincipal({ id: 'user-1' }, cache, fake.client),
    ])

    expect(a).toEqual(b)
    // Both callers raced; storing the in-flight promise is what keeps this at 1.
    expect(fake.queries()).toBe(1)
  })

  it('still asks about a different user', async () => {
    const fake = fakeClient({ data: { role: 'admin', capabilities: [] } })
    const cache = createPrincipalCache()

    await getPrincipal({ id: 'user-1' }, cache, fake.client)
    await getPrincipal({ id: 'user-2' }, cache, fake.client)

    expect(fake.queries()).toBe(2)
    expect(fake.filters()).toEqual(['user-1', 'user-2'])
  })

  it('caches nothing when no cache is passed, so no answer outlives its request', async () => {
    const fake = fakeClient({ data: { role: 'admin', capabilities: [] } })

    await getPrincipal({ id: 'user-1' }, undefined, fake.client)
    await getPrincipal({ id: 'user-1' }, undefined, fake.client)

    expect(fake.queries()).toBe(2)
  })
})
