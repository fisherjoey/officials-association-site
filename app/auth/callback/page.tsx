'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/api/client'
import { IconLoader2, IconAlertCircle } from '@tabler/icons-react'

export default function AuthCallbackPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const supabase = getSupabaseBrowserClient()

        // Get the hash fragment from the URL
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')
        const type = hashParams.get('type')
        const errorCode = hashParams.get('error_code')
        const errorDescription = hashParams.get('error_description')

        // Handle errors from URL
        if (errorCode) {
          const friendlyError = getAuthErrorMessage(errorCode, errorDescription)
          setError(friendlyError)
          return
        }

        // If we have tokens in the hash, set the session
        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          })

          if (sessionError) {
            console.error('Session error:', sessionError)
            setError(getAuthErrorMessage(sessionError.message))
            return
          }

          // Redirect based on type
          if (type === 'recovery') {
            router.push('/auth/set-password?type=reset')
          } else if (type === 'invite' || type === 'signup') {
            router.push('/auth/set-password?type=invite')
          } else {
            router.push('/portal')
          }
          return
        }

        // Try to exchange code for session (PKCE flow)
        const searchParams = new URLSearchParams(window.location.search)
        const code = searchParams.get('code')

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

          if (exchangeError) {
            console.error('Code exchange error:', exchangeError)
            setError(getAuthErrorMessage(exchangeError.message))
            return
          }

          router.push('/portal')
          return
        }

        // No auth params found, redirect to login
        router.push('/login')
      } catch (err: any) {
        console.error('Auth callback error:', err)
        if (err.message?.includes('fetch') || err.message?.includes('network')) {
          setError('Network error. Please check your connection and try again.')
        } else {
          setError('An unexpected error occurred. Please try again or contact support.')
        }
      }
    }

    handleAuthCallback()
  }, [router])

  // Convert error codes/messages to user-friendly messages
  function getAuthErrorMessage(codeOrMessage: string, description?: string | null): string {
    const msg = (codeOrMessage + ' ' + (description || '')).toLowerCase()

    if (msg.includes('expired') || msg.includes('invalid_token')) {
      return 'This link has expired. Please request a new one.'
    }
    if (msg.includes('already') && msg.includes('used')) {
      return 'This link has already been used. Please request a new one.'
    }
    if (msg.includes('not found') || msg.includes('no user')) {
      return 'Account not found. Please check your email or contact support.'
    }
    if (msg.includes('rate') || msg.includes('limit') || msg.includes('too many')) {
      return 'Too many attempts. Please wait a few minutes and try again.'
    }
    if (msg.includes('access_denied') || msg.includes('unauthorized')) {
      return 'Access denied. Please request a new link or contact support.'
    }

    // Return description if available, otherwise generic message
    return description || 'Authentication failed. Please try again or request a new link.'
  }

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <IconLoader2 className="h-12 w-12 text-orange-600 animate-spin mx-auto mb-4" />
        <p className="text-gray-600 dark:text-gray-400">Completing sign in...</p>
      </div>
    </div>
  )
}
