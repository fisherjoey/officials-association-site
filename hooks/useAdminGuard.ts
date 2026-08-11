'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useRole } from '@/contexts/RoleContext'

/**
 * Redirect non-admin users away from admin-only pages. Server-side
 * gates remain authoritative — this keeps non-admins from seeing the
 * page chrome and "Failed to fetch" toasts when they shouldn't be
 * here at all.
 */
export function useAdminGuard(redirectTo = '/portal') {
  const router = useRouter()
  const { user } = useRole()

  useEffect(() => {
    if (user.role !== 'admin') {
      router.push(redirectTo)
    }
  }, [user.role, router, redirectTo])
}
