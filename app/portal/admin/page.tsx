'use client'

import React, { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRole } from '@/contexts/RoleContext'
import {
  IconWorld,
  IconArticle,
  IconCalendarEvent,
  IconFileDescription,
  IconUserCheck,
  IconLayoutDashboard,
  IconReportAnalytics,
  IconUsersGroup,
  IconMail,
  IconClipboardList,
  IconMessageCircle,
} from '@tabler/icons-react'

export default function PortalAdmin() {
  const router = useRouter()
  const { user } = useRole()

  useEffect(() => {
    if (user.role !== 'admin' && user.role !== 'executive') {
      router.push('/portal')
    }
  }, [user.role, router])

  const adminSections: {
    title: string
    description: string
    icon: React.ComponentType<{ className?: string }>
    links: { label: string; href: string; icon?: React.ComponentType<{ className?: string }> }[]
  }[] = [
    {
      title: 'Public Website Content',
      description: 'Manage all public-facing website content',
      icon: IconWorld,
      links: [
        { label: 'News Articles', href: '/portal/admin/public-content/news', icon: IconArticle },
        { label: 'Training Events', href: '/portal/admin/public-content/training', icon: IconCalendarEvent },
        { label: 'Resources', href: '/portal/admin/public-content/resources', icon: IconFileDescription },
        { label: 'Officials Profiles', href: '/portal/admin/public-content/officials', icon: IconUserCheck },
        { label: 'Executive Team', href: '/portal/admin/public-content/executive-team', icon: IconUsersGroup },
        { label: 'Page Content (Home/About)', href: '/portal/admin/public-content/pages', icon: IconLayoutDashboard },
      ]
    },
    {
      title: 'System Logs',
      description: 'Monitor application activity and audit trail',
      icon: IconReportAnalytics,
      links: [
        { label: 'View All Logs', href: '/portal/admin/logs' },
      ]
    },
    {
      title: 'Email History',
      description: 'View all emails sent through the system',
      icon: IconMail,
      links: [
        { label: 'View Email History', href: '/portal/admin/email-history', icon: IconMail },
      ]
    },
    {
      title: 'Contact Submissions',
      description: 'View and manage public contact form messages',
      icon: IconMessageCircle,
      links: [
        { label: 'View Contact Submissions', href: '/portal/admin/contact-submissions', icon: IconMessageCircle },
      ]
    },
    {
      title: 'OSA Submissions',
      description: 'View and manage Officiating Services Agreement requests',
      icon: IconClipboardList,
      links: [
        { label: 'View OSA Submissions', href: '/portal/admin/osa-submissions', icon: IconClipboardList },
      ]
    },
  ]

  return (
    <div className="p-6 portal-animate">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-bold font-heading tracking-tight text-gray-900 dark:text-white mb-2">Portal Administration</h1>
        <p className="text-gray-600 dark:text-gray-300">Manage public website content and view system logs</p>
      </div>

      {/* Admin Sections Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {adminSections.map((section, idx) => (
          <div key={idx} className="bg-white dark:bg-portal-surface rounded-lg border border-gray-200 dark:border-portal-border hover:shadow-lg transition-shadow">
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <section.icon className="h-8 w-8 text-orange-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{section.title}</h3>
              <p className="text-gray-600 dark:text-gray-300 text-sm mb-4">{section.description}</p>
              <div className="space-y-2">
                {section.links.map((link, linkIdx) => (
                  <Link
                    key={linkIdx}
                    href={link.href}
                    className="flex items-center justify-between text-sm text-blue-400 hover:text-blue-300 py-1"
                  >
                    <span className="flex items-center gap-2">
                      {link.icon && <link.icon className="h-4 w-4" />}
                      {link.label}
                    </span>
                    <span>→</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Role-based Access Info */}
      <div className="mt-8 p-4 bg-blue-900/20 border border-blue-800 rounded-lg">
        <h3 className="font-semibold text-blue-400 mb-2">Access Levels</h3>
        <div className="text-sm text-blue-400 space-y-1">
          <p>• <strong>Executives:</strong> Can create and edit public website content</p>
          <p>• <strong>Admins:</strong> Full access to all content and system logs</p>
        </div>
      </div>
    </div>
  )
}
