'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/api/client'
import { IconAlertCircle, IconX, IconLoader2 } from '@tabler/icons-react'

export default function AuthErrorHandler() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    const handleAuthFromHash = async () => {
      // Check for auth params in URL hash
      if (typeof window === 'undefined' || !window.location.hash) return

      // Don't process on auth pages - they handle their own auth
      const pathname = window.location.pathname
      if (pathname.startsWith('/auth/') || pathname.startsWith('/login')) return

      const hashParams = new URLSearchParams(window.location.hash.substring(1))
      const errorCode = hashParams.get('error')
      const errorCodeAlt = hashParams.get('error_code')
      const errorDescription = hashParams.get('error_description')
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')
      const type = hashParams.get('type')

      // Handle errors
      if (errorCode || errorCodeAlt) {
        const friendlyError = getAuthErrorMessage(errorCode || errorCodeAlt || '', errorDescription)
        setError(friendlyError)
        setIsVisible(true)

        // Clear the hash from URL without triggering a reload
        window.history.replaceState(null, '', window.location.pathname)
        return
      }

      // Handle successful auth redirect (for old invites that redirect to root)
      if (accessToken && refreshToken) {
        setIsProcessing(true)

        try {
          const supabase = getSupabaseBrowserClient()

          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          })

          // Clear the hash from URL
          window.history.replaceState(null, '', window.location.pathname)

          if (sessionError) {
            console.error('Session error:', sessionError)
            setError(getAuthErrorMessage(sessionError.message))
            setIsVisible(true)
            setIsProcessing(false)
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
        } catch (err: any) {
          console.error('Auth processing error:', err)
          setError('An error occurred while signing in. Please try again.')
          setIsVisible(true)
          setIsProcessing(false)
        }
      }
    }

    handleAuthFromHash()
  }, [router])

  // Convert error codes/messages to user-friendly messages
  function getAuthErrorMessage(codeOrMessage: string, description?: string | null): string {
    const msg = (codeOrMessage + ' ' + (description || '')).toLowerCase()

    if (msg.includes('otp_expired') || msg.includes('expired')) {
      return 'This link has expired. Please request a new invite or password reset link.'
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
      return 'Access denied. The link may be invalid or expired.'
    }
    if (msg.includes('invalid')) {
      return 'This link is invalid. Please request a new one.'
    }

    // Format description for display
    if (description) {
      return description.replace(/\+/g, ' ')
    }

    return 'Authentication failed. Please try again or request a new link.'
  }

  const handleClose = () => {
    setIsVisible(false)
  }

  // Show processing state
  if (isProcessing) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-6 text-center">
          <IconLoader2 className="h-12 w-12 text-orange-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Completing sign in...</p>
        </div>
      </div>
    )
  }

  if (!isVisible || !error) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-6 animate-in fade-in zoom-in duration-200">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3 text-red-600">
            <IconAlertCircle size={28} />
            <h2 className="text-xl font-semibold">Link Expired</h2>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <IconX size={24} />
          </button>
        </div>

        <p className="text-gray-600 mb-6">{error}</p>

        <div className="flex gap-3">
          <a
            href="/login"
            className="flex-1 text-center py-2.5 px-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium transition-colors"
          >
            Go to Login
          </a>
          <button
            onClick={handleClose}
            className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}
