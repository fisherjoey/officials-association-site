'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  IconMenu2,
  IconX,
  IconHome,
  IconInfoCircle,
  IconCalendar,
  IconUserCheck,
  IconPhone,
  IconLogin,
  IconSearch,
  IconChevronRight
} from '@tabler/icons-react'
import { ORG_SHORT_NAME, ORG_TAGLINE, ORG_LOGO_URL, ORG_LOGO_ALT, EXTERNAL_LINKS } from '@/lib/siteConfig'

export default function MobileHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const pathname = usePathname()
  
  // Check if we're on portal pages - don't show main header on portal
  const isPortalPage = pathname?.startsWith('/portal')

  // Close menu when route changes
  useEffect(() => {
    setMobileMenuOpen(false)
    setSearchOpen(false)
  }, [pathname])

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }

    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [mobileMenuOpen])

  // Don't render main header on portal pages — after the hooks above, so
  // hook call order stays identical across renders regardless of route.
  if (isPortalPage) {
    return null
  }

  const navLinks = [
    { href: '/', label: 'Home', icon: IconHome },
    { href: '/about', label: 'About Us', icon: IconInfoCircle },
    { href: '/calendar', label: 'Calendar', icon: IconCalendar },
    { href: '/become-a-referee', label: 'Become a Referee', icon: IconUserCheck },
    { href: '/contact', label: 'Contact', icon: IconPhone },
  ]

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname?.startsWith(href)
  }

  return (
    <>
      {/* Mobile Header */}
      <header className="sticky top-0 z-50 bg-brand-dark text-white shadow-lg">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3">
              <Image
                src={ORG_LOGO_URL}
                alt={ORG_LOGO_ALT}
                width={40} 
                height={40}
                className="rounded invert"
              />
              <div className="hidden sm:block">
                <h2 className="text-xl font-bold">{ORG_SHORT_NAME}</h2>
                <p className="text-xs text-gray-300 -mt-1">{ORG_TAGLINE}</p>
              </div>
            </Link>

            {/* Mobile Controls */}
            <div className="flex items-center gap-2">
              {/* Search Button */}
              <button
                onClick={() => {
                  setSearchOpen(!searchOpen)
                  setMobileMenuOpen(false)
                }}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                aria-label="Search"
              >
                <IconSearch className="h-6 w-6" />
              </button>

              {/* Menu Button */}
              <button
                onClick={() => {
                  setMobileMenuOpen(!mobileMenuOpen)
                  setSearchOpen(false)
                }}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                aria-label="Menu"
              >
                {mobileMenuOpen ? (
                  <IconX className="h-6 w-6" />
                ) : (
                  <IconMenu2 className="h-6 w-6" />
                )}
              </button>
            </div>
          </div>

          {/* Search Bar (Expandable) */}
          {searchOpen && (
            <div className="pb-4 -mt-2 animate-slideDown">
              <form className="relative" onSubmit={(e) => {
                e.preventDefault()
                // Handle search submission
              }}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-300 focus:outline-none focus:border-brand-primary focus:bg-white/20 transition-colors"
                  autoFocus
                />
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded"
                >
                  <IconSearch className="h-5 w-5" />
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Desktop Navigation (Hidden on Mobile) */}
        <nav className="hidden lg:block bg-gradient-to-r from-slate-800 to-slate-900 border-t border-white/10">
          <div className="container mx-auto px-4">
            <ul className="flex">
              {navLinks.map(link => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                      isActive(link.href)
                        ? 'border-brand-primary bg-white/10 text-brand-primary'
                        : 'border-transparent hover:bg-white/5 hover:border-white/20'
                    }`}
                  >
                    <link.icon className="h-4 w-4" />
                    <span>{link.label}</span>
                  </Link>
                </li>
              ))}
              <li className="ml-auto">
                <Link
                  href={EXTERNAL_LINKS.resourceCentre || '/portal'}
                  target={EXTERNAL_LINKS.resourceCentre ? '_blank' : undefined}
                  rel={EXTERNAL_LINKS.resourceCentre ? 'noopener noreferrer' : undefined}
                  className="flex items-center gap-2 px-4 py-3 bg-brand-primary hover:bg-orange-600 transition-colors"
                >
                  <IconLogin className="h-4 w-4" />
                  <span>Member Portal</span>
                </Link>
                {/* Original portal link - commented out temporarily */}
                {/* <Link
                  href="/portal"
                  className="flex items-center gap-2 px-4 py-3 bg-brand-primary hover:bg-orange-600 transition-colors"
                >
                  <IconLogin className="h-4 w-4" />
                  <span>Member Portal</span>
                </Link> */}
              </li>
            </ul>
          </div>
        </nav>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
          
          {/* Menu Panel */}
          <div className="fixed top-16 right-0 bottom-0 w-full sm:w-80 bg-white z-40 lg:hidden animate-slideInRight overflow-y-auto">
            <nav className="py-4">
              {/* Main Navigation */}
              <div className="px-4 pb-2 mb-2 border-b">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Navigation</h3>
              </div>
              
              {navLinks.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                    isActive(link.href)
                      ? 'bg-brand-primary/10 text-brand-primary border-l-4 border-brand-primary'
                      : 'text-gray-700 hover:bg-gray-50 border-l-4 border-transparent'
                  }`}
                >
                  <link.icon className="h-5 w-5" />
                  <span className="font-medium">{link.label}</span>
                  <IconChevronRight className="h-4 w-4 ml-auto text-gray-400" />
                </Link>
              ))}

              {/* Portal Section */}
              <div className="px-4 pt-4 pb-2 mt-4 border-t">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Member Area</h3>
              </div>
              
              <Link
                href={EXTERNAL_LINKS.resourceCentre || '/portal'}
                target={EXTERNAL_LINKS.resourceCentre ? '_blank' : undefined}
                rel={EXTERNAL_LINKS.resourceCentre ? 'noopener noreferrer' : undefined}
                className="flex items-center gap-3 px-4 py-3 mx-4 bg-brand-primary text-white rounded-lg hover:bg-orange-600 transition-colors"
              >
                <IconLogin className="h-5 w-5" />
                <span className="font-medium">Member Portal</span>
              {/* Original portal link - commented out temporarily */}
              {/* <Link
                href="/portal"
                className="flex items-center gap-3 px-4 py-3 mx-4 bg-brand-primary text-white rounded-lg hover:bg-orange-600 transition-colors"
              >
                <IconLogin className="h-5 w-5" />
                <span className="font-medium">Member Portal</span> */}
              </Link>

              {/* Contact Info */}
              <div className="px-4 pt-6 mt-6 border-t">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Quick Contact</h3>
                <div className="text-sm text-gray-600">
                  <Link href="/contact?category=general" className="text-brand-primary hover:text-brand-secondary">Contact Us</Link>
                </div>
              </div>

              {/* Social Links */}
              <div className="px-4 pt-6">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Follow Us</h3>
                <div className="flex gap-3">
                  <a href="#" className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                    <svg className="h-5 w-5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                  </a>
                  <a href="#" className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                    <svg className="h-5 w-5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
                    </svg>
                  </a>
                  <a href="#" className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                    <svg className="h-5 w-5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zM5.838 12a6.162 6.162 0 1112.324 0 6.162 6.162 0 01-12.324 0zM12 16a4 4 0 110-8 4 4 0 010 8zm4.965-10.405a1.44 1.44 0 112.881.001 1.44 1.44 0 01-2.881-.001z"/>
                    </svg>
                  </a>
                </div>
              </div>
            </nav>
          </div>
        </>
      )}

      <style jsx>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slideInRight {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }

        .animate-slideDown {
          animation: slideDown 0.3s ease-out;
        }

        .animate-slideInRight {
          animation: slideInRight 0.3s ease-out;
        }
      `}</style>
    </>
  )
}