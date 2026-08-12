/**
 * AuthProvider must survive an unconfigured Supabase.
 *
 * getSupabaseBrowserClient() hands back a stub when NEXT_PUBLIC_SUPABASE_URL /
 * NEXT_PUBLIC_SUPABASE_ANON_KEY are missing, and every property access on that
 * stub throws. `supabase.auth.onAuthStateChange(...)` used to run outside any
 * try/catch in the provider's effect, so the throw escaped into React's error
 * boundary and /login, /forgot-password and /portal rendered nothing but
 * "Application error: a client-side exception has occurred" — for anyone who
 * cloned the repo and ran it before wiring up Supabase.
 *
 * These tests pin both halves: unconfigured degrades to signed out, and a
 * configured client still subscribes, still reacts to SIGNED_IN, and still
 * unsubscribes on unmount. The stub used below is the real one from
 * lib/api/client, not a lookalike.
 *
 * They also pin where a session's rung comes from. It is the roster row that
 * `membersAPI.getByUserId` returns, and only that: the token's `user_metadata`
 * is written by the account itself, and `app_metadata` is a copy of the roster
 * that nothing keeps in step any more.
 */
import React from 'react'
import { render, screen, act, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { clientLogger } from '@/lib/clientLogger'
import { clearSignedUrlCache } from '@/lib/fileDownload'

// The provider captures its client once, at module scope. Hand it a proxy that
// forwards to whatever the current test installed, so a single module instance
// can play both the configured and the unconfigured case.
jest.mock('@/lib/api/client', () => ({
  getSupabaseBrowserClient: () =>
    new Proxy(
      {},
      { get: (_target, prop) => (globalThis as any).__testSupabaseClient[prop] }
    ),
}))

jest.mock('@/lib/clientLogger', () => ({
  clientLogger: {
    setUser: jest.fn(),
    clearUser: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/lib/api', () => ({
  membersAPI: {
    getByUserId: jest.fn(),
    create: jest.fn(),
  },
}))

jest.mock('@/lib/fileDownload', () => ({
  clearSignedUrlCache: jest.fn(),
}))
const { membersAPI } = jest.requireMock('@/lib/api') as {
  membersAPI: { getByUserId: jest.Mock; create: jest.Mock }
}

/** The genuine "Supabase is not configured" stub, straight from lib/api/client. */
function realUnconfiguredStub() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  try {
    const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client')
    return actual.getSupabaseBrowserClient()
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = url
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonKey
  }
}

/** Records anything React's error boundary would have caught. */
class CrashProbe extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return <div data-testid="crashed">{this.state.error.message}</div>
    }
    return this.props.children
  }
}

function sessionLabel(
  isLoading: boolean,
  isAuthenticated: boolean,
  role: string | null | undefined
) {
  if (isLoading) return 'loading'
  if (!isAuthenticated) return 'anonymous'
  return `authed:${role ?? 'none'}`
}

function SessionProbe() {
  const { isLoading, isAuthenticated, user } = useAuth()
  return <div data-testid="session">{sessionLabel(isLoading, isAuthenticated, user?.role)}</div>
}

/**
 * Same probe, but it keeps every label it has ever rendered. Asserting on the
 * final state is not enough for the eviction bug: it was an intermediate commit
 * that the portal's redirect effects fired on and that settled back to the right
 * answer a moment later.
 */
function RecordingProbe({ into }: { into: string[] }) {
  const { isLoading, isAuthenticated, user } = useAuth()
  const label = sessionLabel(isLoading, isAuthenticated, user?.role)
  into.push(label)
  return <div data-testid="session">{label}</div>
}

/**
 * Hold `membersAPI.getByUserId` open until the test lets it answer.
 *
 * A roster lookup is an HTTP call to the `members` function, so the render that
 * starts it is committed long before the answer arrives. A mock that resolves in
 * the same microtask lets React batch the two `setUser` calls into a single
 * commit, which hides the intermediate state these tests exist to pin.
 */
function deferredRoster() {
  let release: (row: unknown) => void = () => {}
  const pending = new Promise((resolve) => {
    release = resolve
  })
  membersAPI.getByUserId.mockReturnValue(pending)
  return { resolve: (row: unknown) => release(row) }
}

function renderProvider(probe: React.ReactNode = <SessionProbe />) {
  return render(
    <CrashProbe>
      <AuthProvider>{probe}</AuthProvider>
    </CrashProbe>
  )
}

const warn = clientLogger.warn as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  // Default roster answer: on the roster, bottom rung. Individual tests
  // override it — the rung a session gets is whatever this returns.
  membersAPI.getByUserId.mockResolvedValue({ id: 'member-1', role: 'member', capabilities: [] })
  membersAPI.create.mockResolvedValue({ id: 'member-1', role: 'member', capabilities: [] })
})

afterEach(() => {
  delete (globalThis as any).__testSupabaseClient
})

describe('AuthProvider with Supabase unconfigured', () => {
  beforeEach(() => {
    ;(globalThis as any).__testSupabaseClient = realUnconfiguredStub()
  })

  it('renders as signed out instead of throwing into the error boundary', async () => {
    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('session')).toHaveTextContent('anonymous')
    })
    expect(screen.queryByTestId('crashed')).toBeNull()
  })

  it('says why it gave up on the auth listener', async () => {
    renderProvider()

    await waitFor(() => {
      expect(warn).toHaveBeenCalledWith(
        'auth',
        'auth_listener_unavailable',
        expect.any(String),
        expect.objectContaining({
          reason: expect.stringContaining('Supabase is not configured'),
        })
      )
    })
  })

  it('unmounts cleanly with no subscription to tear down', async () => {
    const { unmount } = renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('session')).toHaveTextContent('anonymous')
    })
    expect(() => unmount()).not.toThrow()
  })
})

describe('AuthProvider with Supabase configured', () => {
  let unsubscribe: jest.Mock
  let onAuthStateChange: jest.Mock
  let handler: (event: string, session: any) => Promise<void>

  beforeEach(() => {
    unsubscribe = jest.fn()
    onAuthStateChange = jest.fn((cb: (event: string, session: any) => Promise<void>) => {
      handler = cb
      return { data: { subscription: { unsubscribe } } }
    })
    ;(globalThis as any).__testSupabaseClient = {
      auth: {
        getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
        onAuthStateChange,
      },
    }
  })

  it('still subscribes to auth state changes', async () => {
    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('session')).toHaveTextContent('anonymous')
    })
    expect(onAuthStateChange).toHaveBeenCalledTimes(1)
    expect(warn).not.toHaveBeenCalled()
  })

  it('still promotes a SIGNED_IN event to an authenticated user', async () => {
    membersAPI.getByUserId.mockResolvedValue({
      id: 'member-1',
      role: 'executive',
      capabilities: [],
    })
    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('session')).toHaveTextContent('anonymous')
    })

    await act(async () => {
      await handler('SIGNED_IN', {
        user: {
          id: 'user-1',
          email: 'exec@example.com',
          user_metadata: { full_name: 'Exec User' },
          app_metadata: {},
        },
      })
    })

    expect(screen.getByTestId('session')).toHaveTextContent('authed:executive')
  })

  it('takes the rung from the roster row and not from the token', async () => {
    // The browser half of the escalation the API carried: the account writes
    // `user_metadata` itself, so a session that believed it would render an
    // admin dashboard for anyone who asked for one.
    membersAPI.getByUserId.mockResolvedValue({
      id: 'member-1',
      role: 'member',
      capabilities: [],
    })
    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('session')).toHaveTextContent('anonymous')
    })

    await act(async () => {
      await handler('SIGNED_IN', {
        user: {
          id: 'user-1',
          email: 'liar@example.com',
          user_metadata: { full_name: 'Liar', role: 'admin', roles: ['admin'] },
          app_metadata: { role: 'admin', capabilities: ['evaluator'] },
        },
      })
    })

    expect(screen.getByTestId('session')).toHaveTextContent('authed:member')
  })

  it('signs in a user with no roster row as having no rung at all', async () => {
    // The state MemberGuard renders the registration form for. It must not
    // resolve to the bottom rung — signed in is not a rung.
    membersAPI.getByUserId.mockResolvedValue(null)
    membersAPI.create.mockResolvedValue(null)
    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('session')).toHaveTextContent('anonymous')
    })

    await act(async () => {
      await handler('SIGNED_IN', {
        user: {
          id: 'user-1',
          email: 'newcomer@example.com',
          user_metadata: { full_name: 'Newcomer' },
          app_metadata: {},
        },
      })
    })

    expect(screen.getByTestId('session')).toHaveTextContent('authed:none')
  })

  it('never renders an admin as roleless while a token refresh re-reads the roster', async () => {
    // Supabase refreshes the access token on every open tab roughly hourly, and
    // USER_UPDATED fires on something as ordinary as a password change. Both go
    // through the same re-resolution path. `app/portal/admin/page.tsx` and
    // `app/portal/mail/page.module-mail.tsx` both push to /portal on any render
    // where hasRole('executive') is false, and `isLoading` covers none of this —
    // so one `authed:none` commit here is an admin thrown off the page they are
    // working on, once an hour.
    membersAPI.getByUserId.mockResolvedValue({ id: 'member-1', role: 'admin', capabilities: [] })
    const labels: string[] = []
    renderProvider(<RecordingProbe into={labels} />)

    await waitFor(() => {
      expect(screen.getByTestId('session')).toHaveTextContent('anonymous')
    })

    const session = {
      user: {
        id: 'user-1',
        email: 'admin@example.com',
        user_metadata: { full_name: 'Admin User' },
        app_metadata: {},
      },
    }

    await act(async () => {
      await handler('SIGNED_IN', session)
    })
    expect(screen.getByTestId('session')).toHaveTextContent('authed:admin')

    for (const event of ['TOKEN_REFRESHED', 'USER_UPDATED']) {
      // The roster lookup has to be modelled as the round-trip it is, landing
      // several ticks after the render that started it. With a mock that
      // resolves immediately React batches both `setUser` calls into one commit
      // and the roleless state never reaches the DOM — a false negative that
      // says nothing about a browser talking to a real function.
      const roster = deferredRoster()

      labels.length = 0
      let pending: Promise<void> | undefined
      await act(async () => {
        pending = handler(event, session)
      })

      // A commit did happen while the answer was in flight, and it still said
      // admin. This is the assertion the bug failed: it committed `authed:none`.
      expect(labels.length).toBeGreaterThan(0)
      expect(labels).toEqual(labels.map(() => 'authed:admin'))

      await act(async () => {
        roster.resolve({ id: 'member-1', role: 'admin', capabilities: [] })
        await pending
      })
      expect(screen.getByTestId('session')).toHaveTextContent('authed:admin')
    }
  })

  it('holds a fresh sign-in as loading until the roster answers', async () => {
    // A first sign-in has no previous answer to carry, so the only honest thing
    // to render is "not ready yet". `app/(auth)/login/page.tsx` navigates on
    // `isAuthenticated && !authLoading` and AuthGuard spins on the same flag —
    // so without this the login page followed a deep link to /portal/admin the
    // instant a session existed, and that page mounted with role null and
    // bounced the user to /portal before the roster ever landed.
    const roster = deferredRoster()
    const labels: string[] = []
    renderProvider(<RecordingProbe into={labels} />)

    await waitFor(() => {
      expect(screen.getByTestId('session')).toHaveTextContent('anonymous')
    })

    labels.length = 0
    let signIn: Promise<void> | undefined
    await act(async () => {
      signIn = handler('SIGNED_IN', {
        user: { id: 'user-1', email: 'admin@example.com', user_metadata: {}, app_metadata: {} },
      })
    })

    expect(screen.getByTestId('session')).toHaveTextContent('loading')
    expect(labels).not.toContain('authed:none')

    await act(async () => {
      roster.resolve({ id: 'member-1', role: 'admin', capabilities: [] })
      await signIn
    })
    expect(screen.getByTestId('session')).toHaveTextContent('authed:admin')
  })

  it('holds a page load with an existing session as loading until the roster answers', async () => {
    // Same rule on the `initializeAuth` path, which is what a reload or a new
    // tab takes. `adoptSession` owns the flag there rather than the caller, so
    // nothing clears it a round-trip early and hands the portal a roleless user.
    const roster = deferredRoster()
    ;(globalThis as any).__testSupabaseClient.auth.getSession = jest.fn().mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-1', email: 'admin@example.com', user_metadata: {}, app_metadata: {} },
        },
      },
      error: null,
    })

    const labels: string[] = []
    renderProvider(<RecordingProbe into={labels} />)

    await waitFor(() => {
      expect(screen.getByTestId('session')).toHaveTextContent('loading')
    })
    expect(labels).not.toContain('authed:none')
    expect(labels).not.toContain('anonymous')

    await act(async () => {
      roster.resolve({ id: 'member-1', role: 'admin', capabilities: [] })
    })
    await waitFor(() => {
      expect(screen.getByTestId('session')).toHaveTextContent('authed:admin')
    })
    expect(labels).not.toContain('authed:none')
  })

  it('still applies a demotion that the refreshed roster reports', async () => {
    // The other half of the same behaviour: carrying the old rung forward is a
    // placeholder, not a floor. A rung taken away has to land on the next
    // refresh, or the re-read is pointless.
    membersAPI.getByUserId.mockResolvedValue({ id: 'member-1', role: 'admin', capabilities: [] })
    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('session')).toHaveTextContent('anonymous')
    })

    const session = {
      user: {
        id: 'user-1',
        email: 'demoted@example.com',
        user_metadata: {},
        app_metadata: {},
      },
    }

    await act(async () => {
      await handler('SIGNED_IN', session)
    })
    expect(screen.getByTestId('session')).toHaveTextContent('authed:admin')

    membersAPI.getByUserId.mockResolvedValue({ id: 'member-1', role: 'member', capabilities: [] })
    await act(async () => {
      await handler('TOKEN_REFRESHED', session)
    })
    expect(screen.getByTestId('session')).toHaveTextContent('authed:member')
  })

  it('does not carry one account’s rung onto another account’s session', async () => {
    membersAPI.getByUserId.mockResolvedValue({ id: 'member-1', role: 'admin', capabilities: [] })
    const labels: string[] = []
    renderProvider(<RecordingProbe into={labels} />)

    await waitFor(() => {
      expect(screen.getByTestId('session')).toHaveTextContent('anonymous')
    })

    await act(async () => {
      await handler('SIGNED_IN', {
        user: { id: 'user-1', email: 'admin@example.com', user_metadata: {}, app_metadata: {} },
      })
    })
    expect(screen.getByTestId('session')).toHaveTextContent('authed:admin')

    membersAPI.getByUserId.mockResolvedValue({ id: 'member-2', role: 'member', capabilities: [] })
    labels.length = 0
    await act(async () => {
      await handler('SIGNED_IN', {
        user: { id: 'user-2', email: 'someone@example.com', user_metadata: {}, app_metadata: {} },
      })
    })

    expect(labels).not.toContain('authed:admin')
    expect(screen.getByTestId('session')).toHaveTextContent('authed:member')
  })

  it('stays signed out when a sign-out overtakes a roster lookup', async () => {
    // The trailing setUser used to land unconditionally, putting a signed-in
    // user back on screen with no session behind it — every request from there
    // 401s until the next auth event.
    const roster = deferredRoster()
    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('session')).toHaveTextContent('anonymous')
    })

    let signIn: Promise<void> | undefined
    await act(async () => {
      signIn = handler('SIGNED_IN', {
        user: { id: 'user-1', email: 'admin@example.com', user_metadata: {}, app_metadata: {} },
      })
    })

    await act(async () => {
      await handler('SIGNED_OUT', null)
    })
    expect(screen.getByTestId('session')).toHaveTextContent('anonymous')

    await act(async () => {
      roster.resolve({ id: 'member-1', role: 'admin', capabilities: [] })
      await signIn
    })
    expect(screen.getByTestId('session')).toHaveTextContent('anonymous')
  })

  it('still unsubscribes on unmount', async () => {
    const { unmount } = renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('session')).toHaveTextContent('anonymous')
    })

    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('drops the signed-url memo when the session ends', async () => {
    // `logout()` signs out without a reload, so nothing in the tab is torn
    // down — the module-level cache in lib/fileDownload.ts included. Keying it
    // to the acting session is what stops the next member reading a link
    // minted for this one; emptying it here is so the links stop existing at
    // the moment they stop being wanted.
    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('session')).toHaveTextContent('anonymous')
    })
    expect(clearSignedUrlCache).not.toHaveBeenCalled()

    await act(async () => {
      handler('SIGNED_IN', {
        user: {
          id: 'user-1',
          email: 'member@example.com',
          user_metadata: { full_name: 'Member User' },
          app_metadata: { role: 'member' },
        },
      })
    })
    expect(clearSignedUrlCache).not.toHaveBeenCalled()

    await act(async () => {
      handler('SIGNED_OUT', null)
    })

    expect(clearSignedUrlCache).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('session')).toHaveTextContent('anonymous')
  })
})
