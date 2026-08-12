'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { getSupabaseBrowserClient } from '@/lib/api/client'
import { membersAPI } from '@/lib/api'
import { clearSignedUrlCache } from '@/lib/fileDownload'
import { clientLogger } from '@/lib/clientLogger'
import type { User as SupabaseUser, Session } from '@supabase/supabase-js'
import {
  toPrincipal,
  type Capability,
  type Principal,
  type StructuralRole,
} from '@/lib/roles'

interface User {
  id: string
  email: string
  name: string
  /** Rung on the org ladder. See `lib/roles.ts`. */
  role: StructuralRole
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
 * Resolve a Supabase auth user to a structural role plus capability grants.
 *
 * This mirrors `getPrincipal()` in `netlify/functions/_shared/handler.ts` and
 * has to keep mirroring it — the browser deciding which tiles to render and the
 * function deciding whether to answer must agree, or the portal shows a control
 * that 403s. Both now defer to `toPrincipal()` so there is one resolver rather
 * than two implementations of the same precedence rules.
 *
 * The `user_metadata` fallback below is the known hole documented in the
 * README (PLAT-33): `user_metadata` is writable by the user with a plain
 * authenticated call, so an account with no server-set `app_metadata.role` can
 * name its own role. Preserved deliberately — removing it here without removing
 * it in the function layer would only desynchronise the two, and the fix is
 * tracked separately.
 *
 * The explicit `capabilities` list is read from `app_metadata` and nowhere else.
 * That is narrower than it looks, and is not a boundary: `role` and `roles`
 * below still fall back to `user_metadata`, and `toPrincipal()` derives a
 * capability from either of them, so `user_metadata.role = 'evaluator'` yields
 * a member holding the evaluator grant. PLAT-33 therefore reaches the
 * capability grants as well as the rung. Closing it means dropping the
 * `user_metadata` fallback from the role fields, not just withholding the
 * `capabilities` key from it.
 */
function getPrincipal(supabaseUser: SupabaseUser | null): Principal {
  if (!supabaseUser) return toPrincipal(null)

  return toPrincipal({
    // `||` not `??`, matching the resolver this replaces: an empty-string role
    // in app_metadata falls through to user_metadata rather than winning.
    role: supabaseUser.app_metadata?.role || supabaseUser.user_metadata?.role,
    roles: [
      ...(supabaseUser.app_metadata?.roles ?? []),
      ...(supabaseUser.user_metadata?.roles ?? []),
    ],
    capabilities: supabaseUser.app_metadata?.capabilities,
  })
}

// Sync Supabase Auth user with members table
async function syncUserToMembers(supabaseUser: SupabaseUser): Promise<void> {
  try {
    // Check if member already exists by user_id (Supabase auth id)
    const existingMember = await membersAPI.getByUserId(supabaseUser.id)

    if (!existingMember) {
      const principal = getPrincipal(supabaseUser)
      // Create new member record.
      //
      // Only the structural role is mirrored onto the roster row. Capabilities
      // are deliberately not: `members.capabilities` is what the RLS policies
      // read, the guard trigger in 0015 refuses to let an unprivileged session
      // set it, and seeding it from auth metadata on first login would be that
      // session granting itself the thing the trigger exists to withhold.
      // Capabilities are granted by an admin through the roster, and there is
      // no first-login shortcut into them on purpose.
      await membersAPI.create({
        user_id: supabaseUser.id,
        email: supabaseUser.email!,
        name: supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || supabaseUser.email!,
        role: principal.role ?? undefined,
        status: 'active'
      })
      console.log('Created new member record for:', supabaseUser.email)
    }
  } catch (error) {
    // Don't block login if sync fails - just log the error
    console.error('Failed to sync user to members table:', error)
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
  // entry is now a plain member who holds the evaluator capability, which is
  // the shape the model actually produces — the old entry made "evaluator" a
  // rung, and testing against it hid the fact that no policy could see it.
  const devUsers: User[] = [
    {
      id: 'dev-user-admin',
      email: 'admin@example.com',
      name: 'Dev Admin User',
      role: 'admin',
      capabilities: [],
      user_metadata: { full_name: 'Dev Admin User' },
      app_metadata: { roles: ['admin'] }
    },
    {
      id: 'dev-user-executive',
      email: 'executive@example.com',
      name: 'Dev Executive User',
      role: 'executive',
      capabilities: [],
      user_metadata: { full_name: 'Dev Executive User' },
      app_metadata: { roles: ['executive'] }
    },
    {
      id: 'dev-user-evaluator',
      email: 'evaluator@example.com',
      name: 'Dev Evaluator User',
      role: 'member',
      capabilities: ['evaluator'],
      user_metadata: { full_name: 'Dev Evaluator User' },
      app_metadata: { roles: ['member'], capabilities: ['evaluator'] }
    },
    {
      id: 'dev-user-member',
      email: 'member@example.com',
      name: 'Dev Member User',
      role: 'member',
      capabilities: [],
      user_metadata: { full_name: 'Dev Member User' },
      app_metadata: { roles: ['member'] }
    }
  ]

  // Convert Supabase user to our User type
  const mapSupabaseUser = (sbUser: SupabaseUser): User => {
    const principal = getPrincipal(sbUser)
    return {
      id: sbUser.id,
      email: sbUser.email!,
      name: sbUser.user_metadata?.full_name || sbUser.user_metadata?.name || sbUser.email!,
      role: principal.role ?? 'member',
      capabilities: principal.capabilities,
      user_metadata: sbUser.user_metadata,
      app_metadata: sbUser.app_metadata
    }
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
          setSupabaseUser(session.user)
          setUser(mapSupabaseUser(session.user))
          // Set user context for logging
          clientLogger.setUser(session.user.id, session.user.email!)
          // Sync existing user to members table
          syncUserToMembers(session.user)
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
        setSupabaseUser(session.user)
        setUser(mapSupabaseUser(session.user))
        // Set user context for logging
        clientLogger.setUser(session.user.id, session.user.email!)
        clientLogger.info('auth', 'signed_in', `User signed in: ${session.user.email}`)
        // Sync user to members table on login
        syncUserToMembers(session.user)

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
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        setSupabaseUser(session.user)
        setUser(mapSupabaseUser(session.user))
      } else if (event === 'USER_UPDATED' && session?.user) {
        setSupabaseUser(session.user)
        setUser(mapSupabaseUser(session.user))
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