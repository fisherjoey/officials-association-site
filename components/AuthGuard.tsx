'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter, usePathname } from 'next/navigation'
import { IconLoader2 } from '@tabler/icons-react'

interface AuthGuardProps {
  children: React.ReactNode
  requireAuth?: boolean
  redirectTo?: string
}

// Check if URL hash contains a Supabase auth token that needs processing
function hasAuthToken(): boolean {
  if (typeof window === 'undefined') return false
  const hash = window.location.hash

  // Supabase uses URL hash for auth tokens
  // Formats: #access_token=... or #error=... or #type=recovery
  return hash.includes('access_token=') ||
         hash.includes('refresh_token=') ||
         hash.includes('type=recovery') ||
         hash.includes('type=signup') ||
         hash.includes('type=invite') ||
         hash.includes('error_code=') ||
         hash.includes('error_description=')
}

export default function AuthGuard({
  children,
  requireAuth = true,
  redirectTo = '/login'
}: AuthGuardProps) {
  const { isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [hasRedirected, setHasRedirected] = useState(false)
  const [hasToken, setHasToken] = useState(false)

  // Check if authentication should be disabled in development
  const isDevMode = process.env.NODE_ENV === 'development'
  const disableAuthInDev = process.env.NEXT_PUBLIC_DISABLE_AUTH_DEV === 'true'
  const shouldBypassAuth = isDevMode && disableAuthInDev

  // Check for auth tokens on mount
  useEffect(() => {
    setHasToken(hasAuthToken())
  }, [])

  useEffect(() => {
    // Don't redirect if there's an auth token in the URL - Supabase will handle it
    if (hasToken) {
      return
    }

    // If not authenticated and auth is required, redirect to login page
    if (!shouldBypassAuth && !isAuthenticated && !isLoading && requireAuth && !hasRedirected) {
      setHasRedirected(true)

      // Check if user just logged out - redirect to home in that case
      const justLoggedOut = sessionStorage.getItem('justLoggedOut')
      if (justLoggedOut) {
        sessionStorage.removeItem('justLoggedOut')
        router.push('/')
        return
      }

      // Store intended destination for after login. Preserve the
      // query string so deep-linked content (news?id=…, calendar?evt=…
      // etc.) doesn't drop back to the index page after login.
      const search = typeof window !== 'undefined' ? window.location.search : ''
      const target = pathname + search
      sessionStorage.setItem('redirectAfterLogin', target)
      router.push(`/login?redirect=${encodeURIComponent(target)}`)
    }
  }, [isAuthenticated, isLoading, requireAuth, pathname, shouldBypassAuth, hasRedirected, router, hasToken])

  // If auth is bypassed in development, always allow access
  if (shouldBypassAuth) {
    return <>{children}</>
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <IconLoader2 className="h-12 w-12 text-orange-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  // Not authenticated and auth is required - show loading while redirecting or processing token
  if (!isAuthenticated && requireAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <IconLoader2 className="h-12 w-12 text-orange-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">
            {hasToken ? 'Processing your request...' : 'Redirecting to login...'}
          </p>
        </div>
      </div>
    )
  }

  // Authenticated or auth not required
  return <>{children}</>
}