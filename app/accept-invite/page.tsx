'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { IconLoader2, IconAlertCircle, IconCheck } from '@tabler/icons-react'
import { ORG_SHORT_NAME, ORG_LOGO_URL, ORG_LOGO_ALT } from '@/lib/siteConfig'

function AcceptInviteContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [status, setStatus] = useState<'loading' | 'error' | 'success' | 'redirecting'>('loading')
  const [message, setMessage] = useState('')
  const [errorType, setErrorType] = useState<'invalid' | 'used' | 'active' | 'general'>('general')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setErrorType('invalid')
      setMessage('No invite token provided. Please use the link from your email.')
      return
    }

    const redeemToken = async () => {
      try {
        const API_BASE = process.env.NODE_ENV === 'production'
          ? '/.netlify/functions'
          : 'http://localhost:9000/.netlify/functions'

        const res = await fetch(`${API_BASE}/accept-invite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        })

        const data = await res.json()

        if (data.success && data.redirectUrl) {
          setStatus('redirecting')
          setMessage('Redirecting to complete your account setup...')
          // Recover from a stuck redirect — if the navigation hasn't
          // moved the page in 10 seconds (Supabase magic-link slow or
          // unreachable), surface an error instead of an indefinite
          // spinner.
          setTimeout(() => {
            setStatus('error')
            setErrorType('general')
            setMessage('The invite redirect is taking too long. Please try again or request a new invite.')
          }, 10_000)
          window.location.href = data.redirectUrl
        } else if (data.alreadyUsed) {
          setStatus('error')
          setErrorType('used')
          setMessage(data.message || 'This invite has already been used.')
        } else if (data.alreadyActive) {
          setStatus('error')
          setErrorType('active')
          setMessage(data.message || 'Your account is already active.')
        } else {
          setStatus('error')
          setErrorType('general')
          setMessage(data.message || 'Unable to process your invite.')
        }
      } catch (err) {
        setStatus('error')
        setErrorType('general')
        setMessage('An error occurred. Please try again or request a new invite.')
      }
    }

    redeemToken()
  }, [token])

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
          {/* Header */}
          <div className="bg-gray-900 dark:bg-gray-950 p-6 text-center border-b-4 border-orange-500">
            <img
              src={ORG_LOGO_URL}
              alt={ORG_LOGO_ALT}
              className="w-16 h-16 mx-auto mb-3"
            />
            <h1 className="text-xl font-bold text-white">{ORG_SHORT_NAME} Member Portal</h1>
            <p className="text-gray-300 text-sm mt-1">Accept Invitation</p>
          </div>

          {/* Content */}
          <div className="p-6">
            {(status === 'loading' || status === 'redirecting') && (
              <div className="text-center py-8">
                <IconLoader2 size={48} className="animate-spin text-orange-500 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400">
                  {status === 'loading' ? 'Validating your invite...' : message}
                </p>
              </div>
            )}

            {status === 'error' && (
              <div className="text-center py-4">
                <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${
                  errorType === 'active'
                    ? 'bg-blue-100 dark:bg-blue-900/30'
                    : 'bg-red-100 dark:bg-red-900/30'
                }`}>
                  <IconAlertCircle size={32} className={
                    errorType === 'active'
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-red-600 dark:text-red-400'
                  } />
                </div>

                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  {errorType === 'invalid' && 'Invalid Invite Link'}
                  {errorType === 'used' && 'Invite Already Used'}
                  {errorType === 'active' && 'Account Already Active'}
                  {errorType === 'general' && 'Unable to Process Invite'}
                </h2>

                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  {message}
                </p>

                <div className="space-y-3">
                  {errorType === 'active' || errorType === 'used' ? (
                    <Link
                      href="/login"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
                    >
                      Go to Login
                    </Link>
                  ) : (
                    <Link
                      href="/get-invite"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-medium transition-colors"
                    >
                      Request New Invite
                    </Link>
                  )}
                </div>
              </div>
            )}

            {status === 'success' && (
              <div className="text-center py-4">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <IconCheck size={32} className="text-green-600 dark:text-green-400" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  Invite Accepted!
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  {message}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Need help?{' '}
              <a href="/contact?category=general" className="text-orange-500 hover:text-orange-600 font-medium">
                Contact {ORG_SHORT_NAME}
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// Loading fallback for Suspense
function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
          <div className="bg-gray-900 dark:bg-gray-950 p-6 text-center border-b-4 border-orange-500">
            <img
              src={ORG_LOGO_URL}
              alt={ORG_LOGO_ALT}
              className="w-16 h-16 mx-auto mb-3"
            />
            <h1 className="text-xl font-bold text-white">{ORG_SHORT_NAME} Member Portal</h1>
            <p className="text-gray-300 text-sm mt-1">Accept Invitation</p>
          </div>
          <div className="p-6">
            <div className="text-center py-8">
              <IconLoader2 size={48} className="animate-spin text-orange-500 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400">Loading...</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AcceptInviteContent />
    </Suspense>
  )
}
