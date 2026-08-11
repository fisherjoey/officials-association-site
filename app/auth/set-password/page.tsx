'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/api/client'
import { IconLock, IconLoader2, IconAlertCircle, IconCheck } from '@tabler/icons-react'
import { ORG_SHORT_NAME } from '@/lib/siteConfig'

function SetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const type = searchParams.get('type') || 'invite'

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)

  const supabase = getSupabaseBrowserClient()

  // Check if user is authenticated
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()

        if (sessionError) {
          console.error('Session error:', sessionError)
          setError('Your session has expired. Please request a new link.')
          setCheckingAuth(false)
          return
        }

        if (!session) {
          // No session - redirect to login with message
          router.push('/login?message=' + encodeURIComponent('Please sign in or request a new invite link'))
          return
        }

        setIsAuthenticated(true)
        setCheckingAuth(false)
      } catch (err: any) {
        console.error('Auth check error:', err)
        setError('Unable to verify your session. Please try again.')
        setCheckingAuth(false)
      }
    }
    checkAuth()
    // Depend on the client itself, never `supabase.auth`. Both are equally
    // stable — the client is a module-level singleton — but a dependency array
    // is evaluated during render, and on an unconfigured build the client is a
    // Proxy that throws on any property read. Reading `.auth` here put that
    // throw outside the try/catch above and white-screened the route.
  }, [router, supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setIsLoading(true)

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password
      })

      if (updateError) {
        // Handle specific Supabase error codes with user-friendly messages
        const errorMessage = getErrorMessage(updateError)
        setError(errorMessage)
        return
      }

      // Success - redirect based on type
      if (type === 'invite') {
        // New user - redirect to complete profile
        router.push('/auth/complete-profile')
      } else {
        // Password reset - redirect to portal
        router.push('/portal')
      }
    } catch (err: any) {
      console.error('Password update error:', err)
      if (err.message?.includes('fetch') || err.message?.includes('network')) {
        setError('Network error. Please check your connection and try again.')
      } else {
        setError(err.message || 'An unexpected error occurred. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  // Convert Supabase errors to user-friendly messages
  function getErrorMessage(error: { message: string; status?: number }): string {
    const message = error.message.toLowerCase()

    if (message.includes('session') || message.includes('expired') || message.includes('invalid')) {
      return 'Your session has expired. Please request a new link.'
    }
    if (message.includes('weak') || message.includes('strength')) {
      return 'Password is too weak. Please use a stronger password with letters, numbers, and symbols.'
    }
    if (message.includes('same') || message.includes('different')) {
      return 'New password must be different from your current password.'
    }
    if (message.includes('rate') || message.includes('limit') || message.includes('too many')) {
      return 'Too many attempts. Please wait a few minutes and try again.'
    }
    if (error.status === 401 || message.includes('unauthorized')) {
      return 'Session expired. Please request a new password reset link.'
    }
    if (error.status === 422 || message.includes('unprocessable')) {
      return 'Invalid password format. Please try a different password.'
    }

    // Return original message if no match
    return error.message
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <IconLoader2 className="h-12 w-12 text-orange-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    // Show error state if we have an error, otherwise return null (redirecting)
    if (error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
          <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400 mb-4">
              <IconAlertCircle size={24} />
              <h1 className="text-lg font-semibold">Authentication Error</h1>
            </div>
            <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
            <a
              href="/login"
              className="inline-block w-full text-center py-2 px-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
            >
              Go to Login
            </a>
          </div>
        </div>
      )
    }
    return null
  }

  const isReset = type === 'reset'
  const title = isReset ? 'Reset Your Password' : 'Create Your Password'
  const description = isReset
    ? 'Enter a new password for your account'
    : `Welcome to ${ORG_SHORT_NAME}! Please create a password to secure your account.`

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <IconLock size={32} className="text-orange-600 dark:text-orange-400" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {title}
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            {description}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
              <IconAlertCircle size={20} />
              <p>{error}</p>
            </div>
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                New Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <IconLock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none block w-full pl-10 pr-3 py-3 border border-gray-300 dark:border-gray-600 rounded-lg placeholder-gray-400 text-gray-900 dark:text-white bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="Enter new password"
                  minLength={8}
                />
              </div>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Must be at least 8 characters
              </p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Confirm Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <IconCheck className={`h-5 w-5 ${password && confirmPassword && password === confirmPassword ? 'text-green-500' : 'text-gray-400'}`} />
                </div>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="appearance-none block w-full pl-10 pr-3 py-3 border border-gray-300 dark:border-gray-600 rounded-lg placeholder-gray-400 text-gray-900 dark:text-white bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="Confirm new password"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-lg shadow-sm text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {isLoading ? (
              <>
                <IconLoader2 className="h-5 w-5 animate-spin" />
                Setting password...
              </>
            ) : (
              isReset ? 'Reset Password' : 'Create Password & Continue'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <IconLoader2 className="h-12 w-12 text-orange-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    }>
      <SetPasswordForm />
    </Suspense>
  )
}
