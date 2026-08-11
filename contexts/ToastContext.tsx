'use client'

import { createContext, useContext, ReactNode } from 'react'
import { toast, Toaster } from 'sonner'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ToastContextType {
  addToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const addToast = (message: string, type: ToastType = 'info') => {
    switch (type) {
      case 'success':
        toast.success(message)
        break
      case 'error':
        toast.error(message, { duration: 7000 })
        break
      case 'warning':
        toast.warning(message)
        break
      case 'info':
      default:
        toast.info(message)
        break
    }
  }

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 5000,
        }}
        richColors
      />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

// Export toast directly for more advanced usage
export { toast }
