'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/api/client'
import { readFriendlyError, friendlyErrorFromThrown } from '@/lib/userFacingError'
import { IconUser, IconLoader2, IconAlertCircle, IconCheck, IconPhone, IconHome, IconUserHeart } from '@tabler/icons-react'
import { ORG_SHORT_NAME } from '@/lib/siteConfig'

const PHONE_REGEX = /^\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$/
const POSTAL_CODE_REGEX = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/
const NAME_REGEX = /^[A-Za-z][A-Za-z\s\-']*[A-Za-z]$/

interface ProfileForm {
  name: string
  phone: string
  address: string
  city: string
  province: string
  postal_code: string
  emergency_contact_name: string
  emergency_contact_phone: string
}

interface FieldErrors {
  name?: string
  phone?: string
  address?: string
  city?: string
  postal_code?: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
}

function validateProfileForm(form: ProfileForm): FieldErrors {
  const errors: FieldErrors = {}
  if (!form.name.trim() || form.name.trim().length < 2) {
    errors.name = 'Name must be at least 2 characters'
  } else if (!NAME_REGEX.test(form.name.trim())) {
    errors.name = 'Please enter a valid name (letters, spaces, hyphens, apostrophes only)'
  }
  if (form.phone && form.phone.replace(/\D/g, '').length < 10) {
    errors.phone = 'Please enter a valid phone number (at least 10 digits)'
  }
  if (form.address && form.address.trim().length < 5) {
    errors.address = 'Please enter a valid street address'
  }
  if (form.city && form.city.trim().length < 2) {
    errors.city = 'Please enter a valid city name'
  }
  if (form.postal_code && !POSTAL_CODE_REGEX.test(form.postal_code.trim())) {
    errors.postal_code = 'Please enter a valid postal code (e.g., A1A 1A1)'
  }
  if (form.emergency_contact_phone && form.emergency_contact_phone.replace(/\D/g, '').length < 10) {
    errors.emergency_contact_phone = 'Please enter a valid phone number (at least 10 digits)'
  }
  return errors
}

function CompleteProfileForm() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [memberId, setMemberId] = useState<string | null>(null)

  const [form, setForm] = useState<ProfileForm>({
    name: '',
    phone: '',
    address: '',
    city: '',
    province: 'AB',
    postal_code: '',
    emergency_contact_name: '',
    emergency_contact_phone: ''
  })

  const supabase = getSupabaseBrowserClient()

  // Check auth and load existing member data
  useEffect(() => {
    const checkAuthAndLoadMember = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()

        if (sessionError || !session) {
          router.push('/login?message=' + encodeURIComponent('Please sign in to complete your profile'))
          return
        }

        setUserEmail(session.user.email || null)

        const API_BASE = process.env.NODE_ENV === 'production'
          ? '/.netlify/functions'
          : 'http://localhost:9000/.netlify/functions'

        const authHeaders = {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        }

        // First try to fetch member by user_id
        let member = null
        const userIdResponse = await fetch(`${API_BASE}/members?user_id=${session.user.id}`, { headers: authHeaders })
        if (userIdResponse.ok) {
          const data = await userIdResponse.json()
          if (data && data.id) member = data
        }

        // If not found by user_id, try by email (handles cases where user_id wasn't linked properly)
        if (!member && session.user.email) {
          const emailResponse = await fetch(`${API_BASE}/members?email=${encodeURIComponent(session.user.email)}`, { headers: authHeaders })
          if (emailResponse.ok) {
            const data = await emailResponse.json()
            if (data && data.id) {
              member = data
              // If found by email, update the user_id link for future lookups
              await fetch(`${API_BASE}/members`, {
                method: 'PUT',
                headers: authHeaders,
                body: JSON.stringify({
                  id: member.id,
                  user_id: session.user.id
                })
              })
            }
          }
        }

        if (member) {
          setMemberId(member.id)
          // Pre-fill form with existing data
          // Don't pre-fill name if it's just the email prefix (placeholder from bulk add)
          const emailPrefix = member.email?.split('@')[0]?.toLowerCase() || ''
          const isPlaceholderName = member.name && emailPrefix &&
            member.name.toLowerCase() === emailPrefix
          setForm({
            name: isPlaceholderName ? '' : (member.name || ''),
            phone: member.phone || '',
            address: member.address || '',
            city: member.city || '',
            province: member.province || 'AB',
            postal_code: member.postal_code || '',
            emergency_contact_name: member.emergency_contact_name || '',
            emergency_contact_phone: member.emergency_contact_phone || ''
          })
        }

        setCheckingAuth(false)
      } catch (err: any) {
        console.error('Auth check error:', err)
        setError('Unable to verify your session. Please try again.')
        setCheckingAuth(false)
      }
    }
    checkAuthAndLoadMember()
    // Depend on the client itself, never `supabase.auth`. Both are equally
    // stable — the client is a module-level singleton — but a dependency array
    // is evaluated during render, and on an unconfigured build the client is a
    // Proxy that throws on any property read. Reading `.auth` here put that
    // throw outside the try/catch above and white-screened the route.
  }, [router, supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setFieldErrors({})

    const validationErrors = validateProfileForm(form)
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors)
      return
    }

    if (!memberId) {
      setError('Unable to find your member record. Please contact support or try requesting a new invite.')
      return
    }

    setIsLoading(true)

    try {
      const API_BASE = process.env.NODE_ENV === 'production'
        ? '/.netlify/functions'
        : 'http://localhost:9000/.netlify/functions'

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('Your session expired. Please sign in again.')
      }

      // Update member record
      const response = await fetch(`${API_BASE}/members`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: memberId,
          ...form
        })
      })

      if (!response.ok) {
        const friendly = await readFriendlyError(response)
        throw new Error(friendly.message)
      }

      // Success - redirect to portal
      router.push('/portal')
    } catch (err) {
      console.error('Profile update error:', err)
      setError(friendlyErrorFromThrown(err).message)
    } finally {
      setIsLoading(false)
    }
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <IconUser size={32} className="text-orange-600 dark:text-orange-400" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Complete Your Profile
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Welcome to {ORG_SHORT_NAME}! Please fill in your details to complete your account setup.
          </p>
          {userEmail && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
              Signed in as {userEmail}
            </p>
          )}
        </div>

        {error && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
              <IconAlertCircle size={20} />
              <p>{error}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 space-y-6">
          {/* Basic Information */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
              <IconUser size={20} />
              Basic Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={100}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent ${fieldErrors.name ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
                  placeholder="Enter your full name"
                />
                {fieldErrors.name && <p className="mt-1 text-sm text-red-600">{fieldErrors.name}</p>}
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  maxLength={20}
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent ${fieldErrors.phone ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
                  placeholder="e.g. 555-123-4567"
                />
                {fieldErrors.phone && <p className="mt-1 text-sm text-red-600">{fieldErrors.phone}</p>}
              </div>
            </div>
          </div>

          {/* Address */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
              <IconHome size={20} />
              Address
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Street Address
                </label>
                <input
                  type="text"
                  maxLength={200}
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent ${fieldErrors.address ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
                  placeholder="123 Main Street"
                />
                {fieldErrors.address && <p className="mt-1 text-sm text-red-600">{fieldErrors.address}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  City
                </label>
                <input
                  type="text"
                  maxLength={100}
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent ${fieldErrors.city ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
                />
                {fieldErrors.city && <p className="mt-1 text-sm text-red-600">{fieldErrors.city}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Province
                </label>
                <select
                  value={form.province}
                  onChange={(e) => setForm({ ...form, province: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                >
                  <option value="AB">Alberta</option>
                  <option value="BC">British Columbia</option>
                  <option value="SK">Saskatchewan</option>
                  <option value="MB">Manitoba</option>
                  <option value="ON">Ontario</option>
                  <option value="QC">Quebec</option>
                  <option value="NB">New Brunswick</option>
                  <option value="NS">Nova Scotia</option>
                  <option value="PE">Prince Edward Island</option>
                  <option value="NL">Newfoundland and Labrador</option>
                  <option value="YT">Yukon</option>
                  <option value="NT">Northwest Territories</option>
                  <option value="NU">Nunavut</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Postal Code
                </label>
                <input
                  type="text"
                  value={form.postal_code}
                  onChange={(e) => setForm({ ...form, postal_code: e.target.value.toUpperCase() })}
                  className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent ${fieldErrors.postal_code ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
                  placeholder="A1A 1A1"
                  maxLength={7}
                />
                {fieldErrors.postal_code && <p className="mt-1 text-sm text-red-600">{fieldErrors.postal_code}</p>}
              </div>
            </div>
          </div>

          {/* Emergency Contact */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
              <IconUserHeart size={20} />
              Emergency Contact
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Contact Name
                </label>
                <input
                  type="text"
                  maxLength={100}
                  value={form.emergency_contact_name}
                  onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="Emergency contact name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Contact Phone
                </label>
                <input
                  type="tel"
                  maxLength={20}
                  value={form.emergency_contact_phone}
                  onChange={(e) => setForm({ ...form, emergency_contact_phone: e.target.value })}
                  className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent ${fieldErrors.emergency_contact_phone ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
                  placeholder="e.g. 555-123-4567"
                />
                {fieldErrors.emergency_contact_phone && <p className="mt-1 text-sm text-red-600">{fieldErrors.emergency_contact_phone}</p>}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center items-center gap-2 py-3 px-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {isLoading ? (
                <>
                  <IconLoader2 className="h-5 w-5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <IconCheck size={20} />
                  Save & Continue
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function CompleteProfilePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <IconLoader2 className="h-12 w-12 text-orange-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    }>
      <CompleteProfileForm />
    </Suspense>
  )
}
