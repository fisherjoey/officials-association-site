'use client'

import { useEffect } from 'react'
import { STORAGE_PREFIX } from '@/lib/siteConfig'

export default function ClearLocalStorage() {
  useEffect(() => {
    // Clear everything this app has written under its storage prefix
    if (typeof window !== 'undefined') {
      const keys = Object.keys(localStorage).filter(key => key.startsWith(STORAGE_PREFIX))
      keys.forEach(key => localStorage.removeItem(key))
    }
  }, [])

  return null
}