'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '@/contexts/AuthContext'
import { membersAPI } from '@/lib/api'
import { IconUser, IconPhone, IconHome, IconAlertCircle, IconLogout } from '@tabler/icons-react'
import { memberRegistrationSchema, type MemberRegistrationFormData } from '@/lib/schemas'
import { PROVINCES } from '@/lib/constants'
import { friendlyErrorFromThrown } from '@/lib/userFacingError'
import { ORG_SHORT_NAME } from '@/lib/siteConfig'

interface MemberRegistrationProps {
  onComplete: () => void
}

export default function MemberRegistration({ onComplete }: MemberRegistrationProps) {
  const { user, logout } = useAuth()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MemberRegistrationFormData>({
    resolver: zodResolver(memberRegistrationSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      phone: '',
      address: '',
      city: '',
      province: 'AB',
      postal_code: '',
      emergency_contact_name: '',
      emergency_contact_phone: '',
    },
  })

  const onFormSubmit = async (data: MemberRegistrationFormData) => {
    setError(null)
    setIsSubmitting(true)

    try {
      const fullName = `${data.first_name.trim()} ${data.last_name.trim()}`
      const profile = {
        name: fullName,
        phone: data.phone.trim(),
        address: data.address.trim(),
        city: data.city.trim(),
        province: data.province,
        postal_code: data.postal_code.trim().toUpperCase(),
        emergency_contact_name: data.emergency_contact_name.trim(),
        emergency_contact_phone: data.emergency_contact_phone.trim(),
      }

      // Look up by user_id first, then email. If a member row already
      // exists for this user (e.g. from the invite flow or an admin
      // bulk-add), update it instead of POSTing a fresh row —
      // otherwise the same auth user ends up with two member records.
      let existing: any = user?.id ? await membersAPI.getByUserId(user.id) : null
      if (!existing && user?.email) {
        existing = await membersAPI.getByEmail(user.email)
      }

      if (existing && existing.id) {
        await membersAPI.update({
          id: existing.id,
          user_id: user?.id ?? existing.user_id,
          email: existing.email || user?.email,
          ...profile,
          status: existing.status || 'active',
          role: existing.role || 'official',
        })
      } else {
        await membersAPI.create({
          user_id: user?.id,
          email: user?.email,
          ...profile,
          status: 'active',
          role: 'official',
        })
      }

      onComplete()
    } catch (err) {
      console.error('Registration error:', err)
      setError(friendlyErrorFromThrown(err).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputClassName = (hasError: boolean) => {
    const baseClass = "w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
    return hasError
      ? `${baseClass} border-red-500 bg-red-50`
      : `${baseClass} border-gray-300`
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <IconUser size={32} className="text-orange-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Complete Your Profile</h1>
          <p className="text-gray-600 mt-2">
            Welcome to {ORG_SHORT_NAME}! Please fill in your information to complete your registration.
          </p>
          <p className="text-sm text-gray-500 mt-1">
            All fields are required.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <IconAlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <IconUser size={20} />
              Basic Information
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="first_name" className="block text-sm font-medium text-gray-700 mb-1">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="first_name"
                  {...register('first_name')}
                  placeholder="John"
                  className={inputClassName(!!errors.first_name)}
                />
                {errors.first_name && (
                  <p className="mt-1 text-sm text-red-600">{errors.first_name.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="last_name" className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="last_name"
                  {...register('last_name')}
                  placeholder="Smith"
                  className={inputClassName(!!errors.last_name)}
                />
                {errors.last_name && (
                  <p className="mt-1 text-sm text-red-600">{errors.last_name.message}</p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                id="phone"
                {...register('phone')}
                placeholder="(403) 555-0100"
                className={inputClassName(!!errors.phone)}
              />
              {errors.phone && (
                <p className="mt-1 text-sm text-red-600">{errors.phone.message}</p>
              )}
            </div>

            <div className="p-3 bg-gray-50 rounded-lg flex items-center justify-between">
              <p className="text-sm text-gray-600">
                <span className="font-medium">Email:</span> {user?.email}
              </p>
              <button
                type="button"
                onClick={logout}
                className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1"
              >
                <IconLogout size={16} />
                Sign out
              </button>
            </div>
          </div>

          {/* Address */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <IconHome size={20} />
              Address
            </h2>

            <div>
              <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
                Street Address <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="address"
                {...register('address')}
                placeholder="123 Main Street"
                className={inputClassName(!!errors.address)}
              />
              {errors.address && (
                <p className="mt-1 text-sm text-red-600">{errors.address.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1">
                  City <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="city"
                  {...register('city')}
                  className={inputClassName(!!errors.city)}
                />
                {errors.city && (
                  <p className="mt-1 text-sm text-red-600">{errors.city.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="province" className="block text-sm font-medium text-gray-700 mb-1">
                  Province <span className="text-red-500">*</span>
                </label>
                <select
                  id="province"
                  {...register('province')}
                  className="w-full pl-3 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                >
                  {PROVINCES.map(prov => (
                    <option key={prov.value} value={prov.value}>{prov.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="postal_code" className="block text-sm font-medium text-gray-700 mb-1">
                  Postal Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="postal_code"
                  {...register('postal_code')}
                  placeholder="T2P 1J9"
                  className={`${inputClassName(!!errors.postal_code)} uppercase`}
                />
                {errors.postal_code && (
                  <p className="mt-1 text-sm text-red-600">{errors.postal_code.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* Emergency Contact */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <IconPhone size={20} />
              Emergency Contact
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="emergency_contact_name" className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="emergency_contact_name"
                  {...register('emergency_contact_name')}
                  placeholder="Jane Smith"
                  className={inputClassName(!!errors.emergency_contact_name)}
                />
                {errors.emergency_contact_name && (
                  <p className="mt-1 text-sm text-red-600">{errors.emergency_contact_name.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="emergency_contact_phone" className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Phone <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  id="emergency_contact_phone"
                  {...register('emergency_contact_phone')}
                  placeholder="(403) 555-0100"
                  className={inputClassName(!!errors.emergency_contact_phone)}
                />
                {errors.emergency_contact_phone && (
                  <p className="mt-1 text-sm text-red-600">{errors.emergency_contact_phone.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="pt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-orange-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-orange-700 focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Completing Registration...' : 'Complete Registration'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
