'use client'

import { useState } from 'react'
import Link from 'next/link'
import { IconMail, IconLoader2, IconCheck, IconAlertCircle } from '@tabler/icons-react'
import { ORG_SHORT_NAME, ORG_LOGO_URL, ORG_LOGO_ALT } from '@/lib/siteConfig'

export default function GetInvitePage() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<{
    success: boolean
    message: string
    alreadyActive?: boolean
  } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email.trim()) return

    setIsLoading(true)
    setResult(null)

    try {
      const res = await fetch('/api/supabase-auth-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'request_invite',
          email: email.trim().toLowerCase()
        })
      })

      const data = await res.json()
      setResult(data)
    } catch (err) {
      setResult({
        success: false,
        message: 'An error occurred. Please try again.'
      })
    } finally {
      setIsLoading(false)
    }
  }

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
            <p className="text-gray-300 text-sm mt-1">Request Account Invite</p>
          </div>

          {/* Content */}
          <div className="p-6">
            {!result ? (
              <>
                <p className="text-gray-600 dark:text-gray-400 mb-6 text-center">
                  Enter your email address to receive a fresh invite link to set up your account.
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your.email@example.com"
                      required
                      disabled={isLoading}
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:opacity-50"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading || !email.trim()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                  >
                    {isLoading ? (
                      <>
                        <IconLoader2 size={20} className="animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <IconMail size={20} />
                        Send Invite Link
                      </>
                    )}
                  </button>
                </form>
              </>
            ) : (
              <div className="text-center py-4">
                {result.alreadyActive ? (
                  <>
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <IconAlertCircle size={32} className="text-blue-600 dark:text-blue-400" />
                    </div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                      Account Already Active
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                      {result.message}
                    </p>
                    <Link
                      href="/login"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
                    >
                      Go to Login
                    </Link>
                  </>
                ) : result.success ? (
                  <>
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                      <IconCheck size={32} className="text-green-600 dark:text-green-400" />
                    </div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                      Check Your Email
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                      {result.message}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                      <IconAlertCircle size={32} className="text-amber-600 dark:text-amber-400" />
                    </div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                      Request Received
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                      {result.message}
                    </p>
                  </>
                )}

                <button
                  onClick={() => {
                    setResult(null)
                    setEmail('')
                  }}
                  className="mt-4 text-orange-500 hover:text-orange-600 font-medium"
                >
                  Try another email
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Already have an account?{' '}
              <Link href="/login" className="text-orange-500 hover:text-orange-600 font-medium">
                Sign in here
              </Link>
            </p>
          </div>
        </div>

        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
          Not a member? Contact {ORG_SHORT_NAME} to join.
        </p>
      </div>
    </div>
  )
}
