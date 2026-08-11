'use client'

import { useState } from 'react'
import { useMember } from '@/contexts/MemberContext'
import MemberRegistration from './MemberRegistration'

interface MemberGuardProps {
  children: React.ReactNode
}

export default function MemberGuard({ children }: MemberGuardProps) {
  const { isLoading, isRegistered, refreshMember } = useMember()
  const [justRegistered, setJustRegistered] = useState(false)

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // Show registration form if not registered
  if (!isRegistered && !justRegistered) {
    return (
      <MemberRegistration
        onComplete={async () => {
          setJustRegistered(true)
          await refreshMember()
        }}
      />
    )
  }

  // User is registered, show portal content
  return <>{children}</>
}
