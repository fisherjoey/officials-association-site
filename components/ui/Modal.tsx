'use client'

import { Fragment, ReactNode, useEffect, useState } from 'react'
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react'
import { IconX } from '@tabler/icons-react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  showCloseButton?: boolean
}

const sizeStyles = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-6xl h-[80vh]',
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showCloseButton = true,
}: ModalProps) {
  // Check if dark mode is enabled by looking at localStorage or parent dark class
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    // Check localStorage for portal theme
    const storedTheme = localStorage.getItem('portal-theme')
    setIsDark(storedTheme === 'dark')

    // Also listen for changes
    const handleStorage = () => {
      const theme = localStorage.getItem('portal-theme')
      setIsDark(theme === 'dark')
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [isOpen])

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog onClose={onClose} className={`relative z-50 ${isDark ? 'dark' : ''}`}>
        {/* Backdrop */}
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true" />
        </TransitionChild>

        {/* Full-screen container for centering */}
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel
                className={`relative bg-white dark:bg-portal-surface rounded-2xl shadow-2xl shadow-black/10 border border-zinc-200 dark:border-portal-border w-full ${sizeStyles[size]} ${size === 'full' ? 'flex flex-col' : ''}`}
              >
                {title && (
                  <div className="border-b border-zinc-200 dark:border-portal-border px-6 py-4">
                    <DialogTitle className="font-heading text-xl font-semibold text-gray-900 dark:text-zinc-100">
                      {title}
                    </DialogTitle>
                  </div>
                )}

                {showCloseButton && (
                  <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 transition-colors"
                    aria-label="Close modal"
                  >
                    <IconX className="w-6 h-6" />
                  </button>
                )}

                <div className={`p-6 ${size === 'full' ? 'flex-1 overflow-hidden' : ''}`}>
                  {children}
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
