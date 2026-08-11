'use client'

import React, { ReactNode } from 'react'
import { Disclosure, DisclosureButton, DisclosurePanel, Transition } from '@headlessui/react'
import { IconChevronRight } from '@tabler/icons-react'

interface AccordionProps {
  children: ReactNode
  defaultOpen?: boolean
}

interface AccordionButtonProps {
  children: ReactNode | ((props: { open: boolean }) => ReactNode)
  className?: string
}

interface AccordionPanelProps {
  children: ReactNode
  className?: string
  unmount?: boolean
}

export function Accordion({ children, defaultOpen = false }: AccordionProps) {
  return (
    <Disclosure defaultOpen={defaultOpen}>
      {children}
    </Disclosure>
  )
}

export function AccordionButton({ children, className = '' }: AccordionButtonProps) {
  return (
    <DisclosureButton className={`w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 rounded ${className}`}>
      {({ open }: { open: boolean }) => (
        (typeof children === 'function' ? children({ open }) : children) as React.ReactElement
      )}
    </DisclosureButton>
  )
}

export function AccordionPanel({ children, className = '', unmount = true }: AccordionPanelProps) {
  return (
    <Transition
      enter="transition duration-150 ease-out"
      enterFrom="transform opacity-0 -translate-y-1"
      enterTo="transform opacity-100 translate-y-0"
      leave="transition duration-100 ease-in"
      leaveFrom="transform opacity-100 translate-y-0"
      leaveTo="transform opacity-0 -translate-y-1"
    >
      <DisclosurePanel unmount={unmount} className={className}>
        {children}
      </DisclosurePanel>
    </Transition>
  )
}

export function AccordionChevron({ open, className = '' }: { open: boolean; className?: string }) {
  return (
    <IconChevronRight
      className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${open ? 'rotate-90' : ''} ${className}`}
    />
  )
}
