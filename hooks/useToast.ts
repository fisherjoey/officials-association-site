'use client'

import { useCallback } from 'react'
import { toast } from 'sonner'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export function useToastHook() {
  const showToast = useCallback((
    type: ToastType,
    title: string,
    message?: string,
    duration?: number
  ) => {
    const content = message ? `${title}: ${message}` : title

    switch (type) {
      case 'success':
        toast.success(title, { description: message, duration })
        break
      case 'error':
        toast.error(title, { description: message, duration: duration || 7000 })
        break
      case 'warning':
        toast.warning(title, { description: message, duration })
        break
      case 'info':
      default:
        toast.info(title, { description: message, duration })
        break
    }
  }, [])

  // Convenience methods
  const success = useCallback((title: string, message?: string, duration?: number) => {
    toast.success(title, { description: message, duration })
  }, [])

  const error = useCallback((title: string, message?: string, duration?: number) => {
    toast.error(title, { description: message, duration: duration || 7000 })
  }, [])

  const warning = useCallback((title: string, message?: string, duration?: number) => {
    toast.warning(title, { description: message, duration })
  }, [])

  const info = useCallback((title: string, message?: string, duration?: number) => {
    toast.info(title, { description: message, duration })
  }, [])

  return {
    showToast,
    success,
    error,
    warning,
    info
  }
}

// Re-export for backwards compatibility
export { useToastHook as useToast }
