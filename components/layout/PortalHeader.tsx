'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useRole } from '@/contexts/RoleContext'
import {
  IconHome,
  IconBooks,
  IconNews,
  IconNotebook,
  IconLock,
  IconExternalLink,
  IconChevronDown,
  IconX,
  IconMenu2,
  IconCalendar,
  IconGavel,
  IconUserCircle,
  IconShield,
  IconUsers,
  IconMail,
  IconChartBar,
  IconClipboardCheck,
  IconClockEdit
} from '@tabler/icons-react'
import ThemeToggle from '../ui/ThemeToggle'

import { useAuth } from '@/contexts/AuthContext'
import {
  ORG_SHORT_NAME,
  ORG_TAGLINE,
  ORG_LOGO_URL,
  ORG_LOGO_ALT,
  NEWSLETTER_NAME,
  isRouteEnabled,
} from '@/lib/siteConfig'
import { describePrincipal } from '@/lib/roles'

export default function PortalHeader() {
  const { user, principal, hasRole } = useRole()
  const { logout } = useAuth()
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [updatesMenuOpen, setUpdatesMenuOpen] = useState(false)
  const updatesMenuRef = useRef<HTMLLIElement>(null)
  const pathname = usePathname()

  // Close updates dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (updatesMenuRef.current && !updatesMenuRef.current.contains(e.target as Node)) {
        setUpdatesMenuOpen(false)
      }
    }
    if (updatesMenuOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [updatesMenuOpen])

  // Close mobile menu and dropdowns on route change
  useEffect(() => {
    setMobileMenuOpen(false)
    setUpdatesMenuOpen(false)
    setProfileMenuOpen(false)
  }, [pathname])

  // Check if in dev mode
  const isDevMode = process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_DISABLE_AUTH_DEV === 'true'

  // The badge shows the rung; the label spells out the rung and any grants.
  // These used to be two switches over one flat role, so a person could be
  // shown as an evaluator or as an executive but never as both — the badge
  // was reporting whichever of the two the resolver happened to pick.
  const roleBadgeColor = !principal.role
    ? 'bg-gray-500'
    : principal.role === 'admin'
      ? 'bg-red-500'
      : principal.role === 'executive'
        ? 'bg-purple-500'
        : 'bg-blue-500'

  const roleLabel = describePrincipal(principal)

  type PortalLink = { href: string; label: string; icon: typeof IconHome; external?: boolean; executive?: boolean }

  // Two independent gates, and both have to pass. isRouteEnabled() asks
  // whether the module is switched on in lib/siteConfig.ts, which decides
  // whether the page reached the static export at all; a link to a module that
  // is off is a silent 404 rather than a broken build. hasRole() asks whether
  // this member is allowed to see it. Neither answers the other's question, so
  // the role check narrows the list and the module filter runs over whatever
  // is left.
  const primaryLinks: PortalLink[] = [
    { href: '/portal', label: 'Dashboard', icon: IconHome },
    { href: '/portal/calendar', label: 'Calendar', icon: IconCalendar },
    { href: '/portal/resources', label: 'Resources', icon: IconBooks },
    { href: '/portal/evaluations', label: 'Evaluations', icon: IconClipboardCheck },
  ].filter(link => isRouteEnabled(link.href))

  const staffLinks: PortalLink[] = (
    hasRole('executive')
      ? [{ href: '/portal/mail', label: 'Send Email', icon: IconMail }]
      : []
  ).filter(link => isRouteEnabled(link.href))

  const topLinks: PortalLink[] = [...primaryLinks, ...staffLinks]

  const updatesLinks: PortalLink[] = [
    { href: '/portal/news', label: 'News & Announcements', icon: IconNews },
    { href: '/portal/scheduler-updates', label: 'Scheduler Updates', icon: IconClockEdit },
    { href: '/portal/rule-modifications', label: 'Rule Modifications', icon: IconGavel },
    { href: '/portal/newsletter', label: NEWSLETTER_NAME, icon: IconNotebook },
  ].filter(link => isRouteEnabled(link.href))

  const updatesIsActive = updatesLinks.some(l => pathname === l.href)
  const allLinks = [...primaryLinks, ...updatesLinks, ...staffLinks]

  return (
    <header className="sticky top-0 z-50">
      {/* Main Portal Header */}
      <div className="bg-brand-dark text-white">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center py-3 sm:py-4">
            {/* Logo and Portal Name */}
            <Link href="/portal" className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
              <Image
                src={ORG_LOGO_URL}
                alt={ORG_LOGO_ALT}
                width={32}
                height={32}
                className="rounded invert sm:w-10 sm:h-10"
              />
              <div className="min-w-0">
                <h1 className="text-sm sm:text-lg font-bold truncate">{ORG_SHORT_NAME} Portal</h1>
                <p className="text-xs text-gray-400 hidden sm:block">{ORG_TAGLINE}</p>
              </div>
            </Link>

            {/* Desktop User Menu */}
            <div className="hidden md:flex items-center gap-4">
              <Link
                href="/"
                className="text-sm text-slate-400 hover:text-portal-accent transition-colors"
              >
                ← Public Site
              </Link>
              <ThemeToggle className="text-white" />
              <div className="relative">
                <button
                  onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                  className="flex items-center gap-2 hover:bg-white/5 px-3 py-2 rounded"
                >
                  <div className="h-8 w-8 bg-orange-500 rounded-lg flex items-center justify-center text-sm font-bold">
                    {(user?.name ?? '').split(' ').map(n => n[0]).join('')}
                  </div>
                  <span className="font-medium">{user?.name}</span>
                  <span className={`px-2 py-0.5 text-xs rounded-md font-medium ${roleBadgeColor}`}>
                    {roleLabel}
                  </span>
                  <IconChevronDown className="h-4 w-4" />
                </button>

                {/* Profile Dropdown */}
                {profileMenuOpen && (
                  <div className="absolute right-0 mt-3 w-48 bg-white dark:bg-portal-surface rounded-xl border border-zinc-200 dark:border-portal-border shadow-lg py-1 z-50">
                    <button
                      onClick={logout}
                      className="block w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-zinc-100 dark:hover:bg-portal-hover"
                    >
                      {isDevMode ? 'Switch Role' : 'Logout'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Mobile Theme Toggle and Menu Button */}
            <div className="md:hidden flex items-center gap-2">
              <Link
                href="/"
                className="text-sm text-slate-400 hover:text-portal-accent transition-colors"
              >
                ← Public Site
              </Link>
              <ThemeToggle className="text-white" />
              <button
                className="p-2"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? (
                  <IconX className="h-6 w-6" />
                ) : (
                  <IconMenu2 className="h-6 w-6" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Portal Navigation */}
      <nav className="bg-brand-secondary text-white border-t border-white/10">
        <div className="container mx-auto px-4">
          {/* Desktop Navigation */}
          <ul className="hidden md:flex">
            {topLinks.map(link => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 rounded-t-md transition-all duration-200 ${
                    pathname === link.href
                      ? 'text-brand-primary bg-brand-primary/5 border-brand-primary font-semibold'
                      : 'text-slate-300 border-transparent hover:text-white hover:bg-white/[0.05]'
                  }`}
                >
                  <link.icon className="h-4 w-4" />
                  <span>{link.label}</span>
                </Link>
              </li>
            ))}

            {/* Updates Dropdown */}
            {updatesLinks.length > 0 && (
            <li className="relative" ref={updatesMenuRef}>
              <button
                onClick={() => setUpdatesMenuOpen(!updatesMenuOpen)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 rounded-t-md transition-all duration-200 ${
                  updatesIsActive
                    ? 'text-brand-primary bg-brand-primary/5 border-brand-primary font-semibold'
                    : 'text-slate-300 border-transparent hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                <IconNews className="h-4 w-4" />
                <span>Updates</span>
                <IconChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${updatesMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {updatesMenuOpen && (
                <div className="absolute left-0 top-full mt-0 w-56 bg-brand-dark rounded-b-xl border border-white/10 border-t-0 shadow-lg py-1 z-50">
                  {updatesLinks.map(link => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setUpdatesMenuOpen(false)}
                      className={`flex items-center gap-2.5 px-4 py-2.5 text-sm transition-all duration-200 ${
                        pathname === link.href
                          ? 'text-brand-primary bg-brand-primary/5 font-semibold'
                          : 'text-slate-300 hover:text-white hover:bg-white/[0.05]'
                      }`}
                    >
                      <link.icon className="h-4 w-4" />
                      <span>{link.label}</span>
                    </Link>
                  ))}
                </div>
              )}
            </li>
            )}
          </ul>

          {/* Mobile Navigation */}
          {mobileMenuOpen && (
            <div className="md:hidden py-2 space-y-1">
              {/* User Info */}
              <div className="px-4 py-3 border-b border-white/10">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-10 w-10 bg-orange-500 rounded-lg flex items-center justify-center font-bold">
                    {(user?.name ?? '').split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{user?.name}</span>
                      <span className={`px-2 py-0.5 text-xs rounded-md font-medium ${roleBadgeColor}`}>
                        {roleLabel}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400">{user?.email || ''}</div>
                  </div>
                </div>
              </div>

              {/* Mobile Links — all flat, grouped visually */}
              {allLinks.map((link, i) => {
                // Insert a subtle section label before the updates group
                const showUpdatesHeader = updatesLinks.length > 0 && i === primaryLinks.length
                return (
                  <div key={link.href}>
                    {showUpdatesHeader && (
                      <div className="px-4 pt-3 pb-1">
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Updates</span>
                      </div>
                    )}
                    <Link
                      href={link.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all duration-200 ${
                        pathname === link.href
                          ? 'text-brand-primary bg-brand-primary/5 font-semibold'
                          : 'text-slate-300 hover:text-white hover:bg-white/[0.05]'
                      }`}
                    >
                      <link.icon className="h-4 w-4" />
                      <span>{link.label}</span>
                    </Link>
                  </div>
                )
              })}

              <hr className="border-white/10" />

              <button
                onClick={logout}
                className="block w-full text-left px-4 py-2 text-red-400 hover:bg-white/10"
              >
                {isDevMode ? 'Switch Role (Dev)' : 'Logout'}
              </button>
            </div>
          )}
        </div>
      </nav>

    </header>
  )
}