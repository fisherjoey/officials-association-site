'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import SearchBox from '../ui/SearchBox'
import SocialLinks from './SocialLinks'
import { ORG_SHORT_NAME, ORG_TAGLINE, ORG_LOGO_URL, ORG_LOGO_ALT } from '@/lib/siteConfig'

export default function Header() {
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Helper function to check if a link is active
  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname?.startsWith(href)
  }

  // Check if we're on portal pages
  const isPortalPage = pathname?.startsWith('/portal') || pathname?.startsWith('/theme-demo')

  // Close mobile menu when route changes
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  // Prevent body scroll when mobile menu is open (only if not on portal page)
  useEffect(() => {
    if (!isPortalPage && mobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [mobileMenuOpen, isPortalPage])

  // Don't render main header on portal pages
  if (isPortalPage) {
    return null
  }

  return (
    <header className="sticky top-0 z-50">
      {/* Top Row: Logo + Utility Navigation */}
      <div className="bg-brand-dark text-white">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center py-3 md:py-4">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 md:gap-4">
              <Image
                src={ORG_LOGO_URL}
                alt={ORG_LOGO_ALT}
                width={45} 
                height={45}
                className="rounded invert md:w-[60px] md:h-[60px]"
              />
              <div>
                <h2 className="text-lg md:text-2xl font-bold">{ORG_SHORT_NAME}</h2>
                <p className="text-xs md:text-sm text-gray-300 hidden sm:block">{ORG_TAGLINE}</p>
              </div>
            </Link>
            
            {/* Desktop Utility */}
            <div className="hidden md:flex items-center gap-6">
              {/* Social Links */}
              <SocialLinks
                size={24}
                linkClassName="text-white hover:text-brand-primary transition-colors"
              />
              <SearchBox />
              <Link
                href="/portal"
                className="text-white hover:text-brand-primary transition-colors font-medium text-base px-4 py-2 border border-white/20 rounded hover:border-brand-primary"
              >
                Member Portal
              </Link>
            </div>
            
            {/* Mobile Menu Button */}
            <button
              className="md:hidden p-2 -mr-2"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>
      
      {/* Bottom Row: Main Navigation - Desktop Only */}
      <nav className="bg-brand-secondary text-white hidden md:block">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center">
            <ul className="flex gap-6 py-5">
              <li><Link href="/" className={`transition-colors px-3 py-2 text-base font-medium ${isActive('/') ? 'text-brand-primary' : 'hover:text-brand-primary'}`}>Home</Link></li>
              <li><Link href="/about" className={`transition-colors px-3 py-2 text-base font-medium ${isActive('/about') ? 'text-brand-primary' : 'hover:text-brand-primary'}`}>About</Link></li>
              <li><Link href="/become-a-referee" className={`transition-colors px-3 py-2 text-base font-medium ${isActive('/become-a-referee') ? 'text-brand-primary' : 'hover:text-brand-primary'}`}>Become a Referee</Link></li>
              <li><Link href="/get-officials" className={`transition-colors px-3 py-2 text-base font-medium ${isActive('/get-officials') ? 'text-brand-primary' : 'hover:text-brand-primary'}`}>Book Referees</Link></li>
              <li><Link href="/new-officials" className={`transition-colors px-3 py-2 text-base font-medium ${isActive('/new-officials') ? 'text-brand-primary' : 'hover:text-brand-primary'}`}>Blue Whistles</Link></li>
              <li><Link href="/contact" className={`transition-colors px-3 py-2 text-base font-medium ${isActive('/contact') ? 'text-brand-primary' : 'hover:text-brand-primary'}`}>Contact</Link></li>
            </ul>
          </div>
        </div>
      </nav>

      {/* Mobile Menu Slide-in Panel */}
      {mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => setMobileMenuOpen(false)}
          />
          
          {/* Menu Panel */}
          <div className="md:hidden fixed right-0 top-0 h-full w-64 bg-brand-secondary text-white z-50 transform transition-transform duration-300 ease-in-out shadow-2xl">
            {/* Menu Header */}
            <div className="bg-brand-dark p-4 flex justify-between items-center">
              <span className="font-bold text-lg">Menu</span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 -mr-2"
                aria-label="Close menu"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Search Box Mobile */}
            <div className="p-4 border-b border-white/20">
              <SearchBox />
            </div>
            
            {/* Menu Items */}
            <nav className="py-4">
              <Link href="/" className={`block px-4 py-3 transition-colors ${isActive('/') ? 'bg-brand-primary' : 'hover:bg-white/10'}`}>Home</Link>
              <Link href="/about" className={`block px-4 py-3 transition-colors ${isActive('/about') ? 'bg-brand-primary' : 'hover:bg-white/10'}`}>About</Link>
              <Link href="/become-a-referee" className={`block px-4 py-3 transition-colors ${isActive('/become-a-referee') ? 'bg-brand-primary' : 'hover:bg-white/10'}`}>Become a Referee</Link>
              <Link href="/get-officials" className={`block px-4 py-3 transition-colors ${isActive('/get-officials') ? 'bg-brand-primary' : 'hover:bg-white/10'}`}>Book Referees</Link>
              <Link href="/new-officials" className={`block px-4 py-3 transition-colors ${isActive('/new-officials') ? 'bg-brand-primary' : 'hover:bg-white/10'}`}>Blue Whistles</Link>
              <Link href="/contact" className={`block px-4 py-3 transition-colors ${isActive('/contact') ? 'bg-brand-primary' : 'hover:bg-white/10'}`}>Contact</Link>

              {/* Portal Button */}
              <div className="px-4 py-3 mt-4 border-t border-white/20">
                <Link
                  href="/portal"
                  className="block text-center bg-brand-primary text-white py-2 px-4 rounded font-medium hover:bg-orange-600 transition-colors"
                >
                  Member Portal
                </Link>
              </div>
            </nav>
          </div>
        </>
      )}
    </header>
  )
}