'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { getSupabaseBrowserClient } from '@/lib/api/client'
import { membersAPI } from '@/lib/api'
import { clearSignedUrlCache } from '@/lib/fileDownload'
import { clientLogger } from '@/lib/clientLogger'
import type { User as SupabaseUser, Session } from '@supabase/supabase-js'
import {
  ANONYMOUS,
  principalFromMemberRow,
  type Capability,
  type Principal,
  type StructuralRole,
} from '@/lib/roles'

interface User {
  id: string
  email: string
  name: string
  /**
   * Rung on the org ladder, from the roster row. `null` for a signed-in account
   * that is not on the roster yet — the state `MemberGuard` renders the
   * registration form for. See `lib/roles.ts`.
   */
  role: StructuralRole | null
  /** Capability grants, orthogonal to `role`. */
  capabilities: readonly Capability[]
  user_metadata?: any
  app_metadata?: any
}

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<{ error?: string }>
  logout: () => Promise<void>
  signup: (email: string, password: string, name: string) => Promise<{ error?: string }>
  resetPassword: (email: string) => Promise<{ error?: string }>
  supabaseUser: SupabaseUser | null
  getAccessToken: () => Promise<string | undefined>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Create Supabase browser client
const supabase = getSupabaseBrowserClient()

/**
 * Resolve the signed-in user to a structural role plus capability grants, from
 * their roster row.
 *
 * This is the browser's copy of `getPrincipal()` in
 * `netlify/functions/_shared/handler.ts`, and the two have to keep agreeing:
 * this one decides which tiles render, that one decides whether to answer, and
 * a disagreement is a button that 403s. They agree because they read the same
 * two columns through the same `principalFromMemberRow()`.
 *
 * It used to read `app_metadata.role || user_metadata.role`, which was the
 * client half of the escalation the function layer carried — the account could
 * write its own `user_metadata` with a plain `PUT /auth/v1/user`. Nothing here
 * was ever a security boundary; the API is. But a browser that believes a
 * self-declared admin is a browser full of controls that fail, and a screenshot
 * of an admin dashboard is a convincing thing to be wrong about.
 *
 * ## Cost
 *
 * One roster fetch per sign-in, folded into the lookup `syncUserToMembers` was
 * already doing, so a signed-in session costs the same request it did before.
 * `MemberContext` fetches the fuller row separately for the profile screens.
 */
async function resolvePrincipal(supabaseUser: SupabaseUser | null): Promise<Principal> {
  if (!supabaseUser) return ANONYMOUS
  try {
    const row = await membersAPI.getByUserId(supabaseUser.id)
    return principalFromMemberRow(row)
  } catch (error) {
    // Fail closed. A user who looks like nobody sees the registration screen;
    // a user who wrongly looks like an admin sees controls that 403.
    clientLogger.warn(
      'auth',
      'principal_lookup_failed',
      'Could not read the roster row; treating this session as having no role',
      { reason: error instanceof Error ? error.message : String(error) }
    )
    return ANONYMOUS
  }
}

/**
 * Put a first-time signer-in on the roster, and report who they are once they
 * are on it.
 *
 * The roster row is now the only thing that confers anything, so this is also
 * the moment a new account acquires a rung. It acquires the bottom one:
 * `membersAPI.create` goes through the `members` function, which refuses a
 * non-admin caller anything but the default rung and refuses capabilities
 * outright, and the guard trigger in migration 0015 says the same at the
 * database. There is no first-login shortcut into a grant, on purpose.
 */
async function syncUserToMembers(supabaseUser: SupabaseUser): Promise<Principal> {
  try {
    // Check if member already exists by user_id (Supabase auth id)
    const existingMember = await membersAPI.getByUserId(supabaseUser.id)
    if (existingMember) return principalFromMemberRow(existingMember)

    const created = await membersAPI.create({
      user_id: supabaseUser.id,
      email: supabaseUser.email!,
      name: supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || supabaseUser.email!,
      status: 'active'
    })
    console.log('Created new member record for:', supabaseUser.email)
    return principalFromMemberRow(created)
  } catch (error) {
    // Don't block login if sync fails - just log the error
    console.error('Failed to sync user to members table:', error)
    return ANONYMOUS
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [devRoleIndex, setDevRoleIndex] = useState(0)

  // Check if authentication should be disabled in development
  const isDevMode = process.env.NODE_ENV === 'development'
  const disableAuthInDev = process.env.NEXT_PUBLIC_DISABLE_AUTH_DEV === 'true'
  const shouldBypassAuth = isDevMode && disableAuthInDev

  // Dev users for cycling through roles and capability grants. The evaluator
  // entry is a plain member who holds the evaluator capability, which is the
  // shape the model actually produces — the old entry made "evaluator" a rung,
  // and testing against it hid the fact that no policy could see it.
  //
  // `role` and `capabilities` here stand in for a roster row, which is where a
  // real session gets both. They carried a matching `app_metadata` block too,
  // back when that was a second source for the same answer; it is not one now,
  // and leaving it would suggest otherwise to whoever reads this next.
  const devUsers: User[] = [
    {
      id: 'dev-user-admin',
      email: 'admin@example.com',
      name: 'Dev Admin User',
      role: 'admin',
      capabilities: [],
      user_metadata: { full_name: 'Dev Admin User' }
    },
    {
      id: 'dev-user-executive',
      email: 'executive@example.com',
      name: 'Dev Executive User',
      role: 'executive',
      capabilities: [],
      user_metadata: { full_name: 'Dev Executive User' }
    },
    {
      id: 'dev-user-evaluator',
      email: 'evaluator@example.com',
      name: 'Dev Evaluator User',
      role: 'member',
      capabilities: ['evaluator'],
      user_metadata: { full_name: 'Dev Evaluator User' }
    },
    {
      id: 'dev-user-member',
      email: 'member@example.com',
      name: 'Dev Member User',
      role: 'member',
      capabilities: [],
      user_metadata: { full_name: 'Dev Member User' }
    }
  ]

  // Convert Supabase user to our User type. The principal is supplied rather
  // than derived here: it comes off the roster row, which is a fetch, so this
  // stays the pure part.
  const mapSupabaseUser = (sbUser: SupabaseUser, principal: Principal): User => ({
    id: sbUser.id,
    email: sbUser.email!,
    name: sbUser.user_metadata?.full_name || sbUser.user_metadata?.name || sbUser.email!,
    role: principal.role,
    capabilities: principal.capabilities,
    user_metadata: sbUser.user_metadata,
    app_metadata: sbUser.app_metadata
  })

  /**
   * Take up a session: show it as signed in with no rung, then fill the rung in
   * from the roster.
   *
   * The order matters. Rendering nothing until the roster answers would blank
   * the portal on every page load; rendering an optimistic rung would flash
   * controls that the API then refuses. Signed-in-with-nothing is the only
   * intermediate state that is never wrong in the permissive direction.
   */
  const adoptSession = async (sbUser: SupabaseUser, { register }: { register: boolean }) => {
    setSupabaseUser(sbUser)
    setUser(mapSupabaseUser(sbUser, ANONYMOUS))
    const principal = register
      ? await syncUserToMembers(sbUser)
      : await resolvePrincipal(sbUser)
    setUser(mapSupabaseUser(sbUser, principal))
  }

  useEffect(() => {
    // If authentication is bypassed in development, create a mock user
    if (shouldBypassAuth) {
      setUser(devUsers[devRoleIndex])
      setIsLoading(false)
      return
    }

    // Check for existing session
    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()

        if (error) {
          console.error('Error getting session:', error)
          setIsLoading(false)
          return
        }

        if (session?.user) {
          // Set user context for logging
          clientLogger.setUser(session.user.id, session.user.email!)
          // Awaited, so `isLoading` covers the roster lookup too and no
          // consumer sees a signed-in user whose rung has not arrived.
          await adoptSession(session.user, { register: true })
        }
      } catch (error) {
        console.error('Error initializing auth:', error)
        clientLogger.error('auth', 'init_error', 'Error initializing auth', error instanceof Error ? error : undefined)
      } finally {
        setIsLoading(false)
      }
    }

    initializeAuth()

    // Set up auth state change listener.
    //
    // When Supabase env vars are absent, getSupabaseBrowserClient() returns a
    // stub whose every property access throws (see lib/api/client.ts). That
    // throw is synchronous, so unlike the one inside initializeAuth() — which
    // its own try/catch absorbs — it escapes the effect body and hits React's
    // error boundary, blanking /login, /forgot-password and /portal for anyone
    // who cloned the repo before configuring Supabase. There is no session to
    // listen for without a client, so degrade to "signed out" and carry on.
    // Nothing here is an auth check: a real request still constructs a real
    // client and still fails loudly at request time.
    const handleAuthStateChange = async (event: string, session: any) => {
      console.log('Auth state changed:', event)

      if (event === 'SIGNED_IN' && session?.user) {
        // Set user context for logging
        clientLogger.setUser(session.user.id, session.user.email!)
        clientLogger.info('auth', 'signed_in', `User signed in: ${session.user.email}`)
        // Sync user to members table on login, and take the rung from the row
        await adoptSession(session.user, { register: true })

        // Redirect intentionally NOT done here. The login page owns
        // post-sign-in navigation via its own useEffect — having both
        // fire on the same auth event caused intermittent flicker
        // and duplicate history entries (audit #21).
      } else if (event === 'SIGNED_OUT') {
        clientLogger.info('auth', 'signed_out', 'User signed out')
        clientLogger.clearUser()
        // `logout()` below does not reload the page, so nothing else in the tab
        // is torn down — the module-level memo in lib/fileDownload.ts included.
        // That memo is keyed to the acting session and so cannot hand the next
        // member a link minted for this one, but the links are of no further use
        // to anybody and sign-out is when to say so.
        clearSignedUrlCache()
        setSupabaseUser(null)
        setUser(null)
      } else if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        if (!session?.user) return
        // Re-read the roster rather than trusting the refreshed token. A rung
        // taken away should stop rendering controls within the hour, and a rung
        // written into the token by its own holder should render nothing at
        // all — which is the same code path, so there is only one to get right.
        await adoptSession(session.user, { register: false })
      }
    }

    let subscription: { unsubscribe: () => void } | null = null

    try {
      subscription = supabase.auth.onAuthStateChange(handleAuthStateChange).data.subscription
    } catch (error) {
      clientLogger.warn(
        'auth',
        'auth_listener_unavailable',
        'Supabase is not configured; treating the session as signed out',
        { reason: error instanceof Error ? error.message : String(error) }
      )
      setSupabaseUser(null)
      setUser(null)
      setIsLoading(false)
    }

    // Cleanup subscription
    return () => {
      subscription?.unsubscribe()
    }
  }, [shouldBypassAuth, devRoleIndex])

  const login = async (email: string, password: string): Promise<{ error?: string }> => {
    if (shouldBypassAuth) {
      return {}
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (error) {
        clientLogger.warn('auth', 'login_failed', `Login failed: ${error.message}`, { email })
        return { error: error.message }
      }

      return {}
    } catch (error: any) {
      clientLogger.error('auth', 'login_error', 'Login error', error instanceof Error ? error : undefined, { email })
      return { error: error.message || 'An unexpected error occurred' }
    }
  }

  const logout = async (): Promise<void> => {
    if (shouldBypassAuth) {
      // Cycle to next dev user role
      const nextIndex = (devRoleIndex + 1) % devUsers.length
      setDevRoleIndex(nextIndex)
      setUser(devUsers[nextIndex])
      return
    }

    // Set flag so AuthGuard knows not to open login modal
    sessionStorage.setItem('justLoggedOut', 'true')
    await supabase.auth.signOut()
  }

  const signup = async (email: string, password: string, name: string): Promise<{ error?: string }> => {
    if (shouldBypassAuth) {
      return {}
    }

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
            name: name
          }
        }
      })

      if (error) {
        clientLogger.warn('auth', 'signup_failed', `Signup failed: ${error.message}`, { email })
        return { error: error.message }
      }

      clientLogger.info('auth', 'signup_success', `User signed up: ${email}`)
      return {}
    } catch (error: any) {
      clientLogger.error('auth', 'signup_error', 'Signup error', error instanceof Error ? error : undefined, { email })
      return { error: error.message || 'An unexpected error occurred' }
    }
  }

  const resetPassword = async (email: string): Promise<{ error?: string }> => {
    try {
      // Use our custom endpoint that sends via Microsoft Graph
      const response = await fetch('/.netlify/functions/auth-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })

      const data = await response.json()

      if (!response.ok) {
        clientLogger.warn('auth', 'reset_password_failed', `Password reset failed: ${data.error}`, { email })
        return { error: data.error || 'Failed to send reset email' }
      }

      // Belt-and-suspenders: even if the server returned 2xx, treat
      // an explicit `success: false` as an error so we don't show the
      // "check your email" UI when nothing was sent.
      if (data && data.success === false) {
        clientLogger.warn('auth', 'reset_password_failed', `Password reset reported failure: ${data.error}`, { email })
        return { error: data.error || 'Failed to send reset email' }
      }

      clientLogger.info('auth', 'reset_password_requested', `Password reset requested for: ${email}`)
      return {}
    } catch (error: any) {
      clientLogger.error('auth', 'reset_password_error', 'Password reset error', error instanceof Error ? error : undefined, { email })
      return { error: error.message || 'An unexpected error occurred' }
    }
  }

  const getAccessToken = async (): Promise<string | undefined> => {
    if (shouldBypassAuth) {
      // Return a mock token for dev mode
      return 'dev-mock-token'
    }
    try {
      const { data: { session }, error } = await supabase.auth.getSession()
      if (error) {
        console.error('Error getting access token:', error)
        return undefined
      }
      return session?.access_token
    } catch (error) {
      console.error('Error getting access token:', error)
      return undefined
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        signup,
        resetPassword,
        supabaseUser,
        getAccessToken
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}