'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { membersAPI } from '@/lib/api'

interface Member {
  id: string
  netlify_user_id: string
  name: string
  email: string
  phone?: string
  certification_level?: string
  rank?: number
  status: string
  role: string
  address?: string
  city?: string
  province?: string
  postal_code?: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
  custom_fields?: Record<string, any>
  notes?: string
  created_at: string
  updated_at: string
}

interface MemberContextType {
  member: Member | null
  isLoading: boolean
  isRegistered: boolean
  error: string | null
  refreshMember: () => Promise<void>
}

const MemberContext = createContext<MemberContextType | undefined>(undefined)

export function MemberProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()
  const [member, setMember] = useState<Member | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchMember = async () => {
    if (!user?.id) {
      setMember(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Try user_id first (Supabase Auth), then fall back to netlify_user_id (legacy), then email
      let memberData = null

      try {
        memberData = await membersAPI.getByUserId(user.id)
      } catch (err: any) {
        // 404 or API_ERROR means not found by user_id - try netlify_user_id
        if (err.statusCode === 404 || err.message?.includes('404') || err.code === 'API_ERROR') {
          // Continue to try netlify_user_id
        } else {
          throw err // Re-throw other errors
        }
      }

      // If not found by user_id, try netlify_user_id for legacy records
      if (!memberData) {
        try {
          memberData = await membersAPI.getByNetlifyId(user.id)
        } catch (err: any) {
          // 404 or API_ERROR is expected - try email next
          if (!(err.statusCode === 404 || err.message?.includes('404') || err.code === 'API_ERROR')) {
            throw err
          }
        }
      }

      // If still not found, try email lookup (for migrated users with old netlify_user_id)
      if (!memberData && user.email) {
        try {
          memberData = await membersAPI.getByEmail(user.email)
          // If found by email, update the member record with the new user_id
          if (memberData && !memberData.user_id) {
            console.log('Linking member to Supabase Auth user by email...')
            await membersAPI.update({ id: memberData.id, user_id: user.id })
            memberData.user_id = user.id
          }
        } catch (err: any) {
          // 404 or API_ERROR is expected for new users
          if (!(err.statusCode === 404 || err.message?.includes('404') || err.code === 'API_ERROR')) {
            throw err
          }
        }
      }

      // API returns null if member doesn't exist
      setMember(memberData || null)
    } catch (err: any) {
      console.error('Error fetching member:', err)
      setError(err.message || 'Failed to load member data')
      setMember(null)
    } finally {
      setIsLoading(false)
    }
  }

  // Fetch member when auth user changes
  useEffect(() => {
    if (!authLoading) {
      if (isAuthenticated && user) {
        fetchMember()
      } else {
        setMember(null)
        setIsLoading(false)
      }
    }
  }, [user?.id, isAuthenticated, authLoading])

  const refreshMember = async () => {
    await fetchMember()
  }

  return (
    <MemberContext.Provider
      value={{
        member,
        isLoading: authLoading || isLoading,
        isRegistered: !!member,
        error,
        refreshMember
      }}
    >
      {children}
    </MemberContext.Provider>
  )
}

export function useMember() {
  const context = useContext(MemberContext)
  if (context === undefined) {
    throw new Error('useMember must be used within a MemberProvider')
  }
  return context
}
