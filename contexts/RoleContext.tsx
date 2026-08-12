'use client'

import { createContext, useContext, useMemo, ReactNode } from 'react'
import { useAuth } from './AuthContext'
import {
  ANONYMOUS,
  can as canDo,
  hasRole as hasRoleAtLeast,
  type Capability,
  type Principal,
  type StructuralRole,
} from '@/lib/roles'

/**
 * The portal's view of who is signed in.
 *
 * `user` is null when nobody is. It used to be
 * `{ name: 'Guest', role: 'official' }` — a logged-out visitor wearing a
 * member's role shape — which every `user.role === …` check in the portal then
 * evaluated as a real member. Nothing downstream had a way to tell "signed out"
 * from "signed in with the lowest role", because the two were the same object.
 *
 * Ask the questions through `hasRole` and `can` rather than comparing
 * `principal.role` yourself. Both are false for a signed-out principal, which is
 * the behaviour every caller wants and the one the old fallback quietly denied
 * them.
 */
export interface PortalUser {
  name: string
  role: StructuralRole
  capabilities: readonly Capability[]
  level?: number
  avatar?: string
  email?: string
}

interface RoleContextType {
  /** Null when nobody is signed in. */
  user: PortalUser | null
  /** Always present; `{ role: null, capabilities: [] }` when signed out. */
  principal: Principal
  isAuthenticated: boolean
  /** True when the signed-in user sits at or above `minimum` on the ladder. */
  hasRole: (minimum: StructuralRole) => boolean
  /** True when the signed-in user holds this capability grant. */
  can: (capability: Capability) => boolean
}

const RoleContext = createContext<RoleContextType | undefined>(undefined)

export function RoleProvider({ children }: { children: ReactNode }) {
  const { user: authUser } = useAuth()

  const value = useMemo<RoleContextType>(() => {
    const user: PortalUser | null = authUser
      ? {
          name: authUser.name,
          role: authUser.role,
          capabilities: authUser.capabilities,
          email: authUser.email,
          level: authUser.user_metadata?.level,
          avatar: authUser.user_metadata?.avatar,
        }
      : null

    const principal: Principal = user
      ? { role: user.role, capabilities: user.capabilities }
      : ANONYMOUS

    return {
      user,
      principal,
      isAuthenticated: user !== null,
      hasRole: (minimum: StructuralRole) => hasRoleAtLeast(principal, minimum),
      can: (capability: Capability) => canDo(principal, capability),
    }
  }, [authUser])

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
}

export function useRole() {
  const context = useContext(RoleContext)
  if (context === undefined) {
    throw new Error('useRole must be used within a RoleProvider')
  }
  return context
}
