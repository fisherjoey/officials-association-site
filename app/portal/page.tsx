'use client'

import Link from 'next/link';
import { useRole } from '@/contexts/RoleContext';
import {
  IconBooks,
  IconNews,
  IconNotebook,
  IconCalendar,
  IconGavel,
  IconClipboard,
  IconSettings,
  IconUser,
  IconUsers,
  IconExternalLink,
  IconCalendarEvent,
  IconBallBasketball,
  IconBrandDiscord,
  IconArchive,
  IconReportAnalytics,
  IconMail
} from '@tabler/icons-react';
import UpcomingEventsWidget from '@/components/dashboard/UpcomingEventsWidget';
import LatestAnnouncementWidget from '@/components/dashboard/LatestAnnouncementWidget';
import LatestNewsletterWidget from '@/components/dashboard/LatestNewsletterWidget';
import SchedulerUpdatesWidget from '@/components/dashboard/SchedulerUpdatesWidget';
import { ORG_SHORT_NAME, NEWSLETTER_NAME, EXTERNAL_LINKS } from '@/lib/siteConfig'

export default function PortalDashboard() {
  const { user } = useRole();

  // Define sections based on role
  const officialSections = [
    {
      href: '/portal/profile',
      title: 'My Profile',
      description: 'View and update your personal information and activity history',
      icon: IconUser,
      badge: null
    },
    {
      href: '/portal/resources',
      title: 'Resources',
      description: 'Access rulebooks, training materials, forms, and official documents',
      icon: IconBooks,
      badge: null
    },
    {
      href: '/portal/news',
      title: 'News & Announcements',
      description: `Stay updated with the latest ${ORG_SHORT_NAME} news, events, and important announcements`,
      icon: IconNews,
      badge: null
    },
    {
      href: '/portal/newsletter',
      title: NEWSLETTER_NAME,
      description: 'Read our monthly newsletter with in-depth articles and officiating insights',
      icon: IconNotebook,
      badge: null
    },
    {
      href: '/portal/calendar',
      title: 'Calendar',
      description: 'View upcoming games, training sessions, and important dates',
      icon: IconCalendar,
      badge: null
    },
    {
      href: '/portal/rule-modifications',
      title: 'Rule Modifications',
      description: `Review ${ORG_SHORT_NAME}-specific rule modifications and interpretations`,
      icon: IconGavel,
      badge: null
    }
  ];

  const executiveSections = [
    ...officialSections,
    {
      href: '/portal/members',
      title: 'Members Directory',
      description: 'Manage member profiles, track activities, and view member information',
      icon: IconUsers,
      badge: 'EXEC'
    },
    {
      href: '/portal/evaluations',
      title: 'Evaluations',
      description: 'View and manage official evaluations and performance assessments',
      icon: IconClipboard,
      badge: 'EXEC'
    }
  ];

  const adminSections = [
    ...executiveSections,
    {
      href: '/portal/admin',
      title: 'Portal Admin',
      description: 'Manage public website content and system settings',
      icon: IconSettings,
      badge: 'ADMIN'
    },
    {
      href: '/portal/admin/logs',
      title: 'System Logs',
      description: 'View application logs and audit trail',
      icon: IconReportAnalytics,
      badge: 'ADMIN'
    }
  ];

  // Select sections based on role
  const sections = user.role === 'admin' 
    ? adminSections 
    : user.role === 'executive' 
      ? executiveSections 
      : officialSections;

  return (
    <div className="space-y-4">
      {/* Welcome Section */}
      <div className="bg-white dark:bg-portal-surface rounded-lg border border-gray-200 dark:border-portal-border p-3 sm:p-4 relative overflow-hidden portal-animate">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-primary to-orange-400" />
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-brand-primary mb-0.5">Welcome back</p>
            <h1 className="font-heading text-lg sm:text-xl font-extrabold text-gray-900 dark:text-white tracking-tight">
              {user.name}
            </h1>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-semibold bg-orange-50 dark:bg-portal-accent/10 text-brand-primary border border-orange-200 dark:border-portal-accent/20">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-primary" />
            {user.role === 'admin' ? 'Administrator' :
             user.role === 'executive' ? 'Executive Member' :
             user.role === 'evaluator' ? 'Evaluator' :
             user.role === 'mentor' ? 'Mentor' :
             'Official'}
          </span>
        </div>
      </div>

      {/* Dashboard Widgets Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 portal-animate">
        {/* Latest Announcement */}
        <LatestAnnouncementWidget />

        {/* Upcoming Events stacked with Scheduler Updates beneath */}
        <div className="space-y-4">
          <UpcomingEventsWidget />
          <SchedulerUpdatesWidget />
        </div>
      </div>

      {/* Latest Newsletter - Full Width */}
      <LatestNewsletterWidget />

      {/* Quick Links Section */}
      <div className="bg-white dark:bg-portal-surface rounded-lg border border-gray-200 dark:border-portal-border p-3 sm:p-4">
        <h3 className="font-heading text-sm sm:text-base font-semibold text-gray-900 dark:text-white mb-3">Quick Links</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {/* Portal Links */}
          <Link
            href="/portal/profile"
            className="flex items-center gap-2 p-2.5 bg-white dark:bg-portal-surface rounded-md border border-gray-200 dark:border-portal-border hover:border-orange-200 dark:hover:border-portal-accent/30 hover:shadow-sm transition-all duration-200"
          >
            <div className="bg-orange-50 dark:bg-portal-accent/10 p-1.5 rounded-lg">
              <IconUser className="h-5 w-5 text-orange-600 dark:text-portal-accent flex-shrink-0" />
            </div>
            <span className="text-sm font-medium text-gray-900 dark:text-white">My Profile</span>
          </Link>
          <Link
            href="/portal/resources"
            className="flex items-center gap-2 p-2.5 bg-white dark:bg-portal-surface rounded-md border border-gray-200 dark:border-portal-border hover:border-orange-200 dark:hover:border-portal-accent/30 hover:shadow-sm transition-all duration-200"
          >
            <div className="bg-blue-50 dark:bg-blue-500/[0.06] p-1.5 rounded-lg">
              <IconBooks className="h-5 w-5 text-blue-600 dark:text-blue-300/60 flex-shrink-0" />
            </div>
            <span className="text-sm font-medium text-gray-900 dark:text-white">Resources</span>
          </Link>
          <Link
            href="/portal/news"
            className="flex items-center gap-2 p-2.5 bg-white dark:bg-portal-surface rounded-md border border-gray-200 dark:border-portal-border hover:border-orange-200 dark:hover:border-portal-accent/30 hover:shadow-sm transition-all duration-200"
          >
            <div className="bg-purple-50 dark:bg-purple-500/[0.06] p-1.5 rounded-lg">
              <IconNews className="h-5 w-5 text-purple-600 dark:text-purple-300/60 flex-shrink-0" />
            </div>
            <span className="text-sm font-medium text-gray-900 dark:text-white">News</span>
          </Link>
          <Link
            href="/portal/calendar"
            className="flex items-center gap-2 p-2.5 bg-white dark:bg-portal-surface rounded-md border border-gray-200 dark:border-portal-border hover:border-orange-200 dark:hover:border-portal-accent/30 hover:shadow-sm transition-all duration-200"
          >
            <div className="bg-green-50 dark:bg-green-500/[0.06] p-1.5 rounded-lg">
              <IconCalendar className="h-5 w-5 text-green-600 dark:text-green-300/60 flex-shrink-0" />
            </div>
            <span className="text-sm font-medium text-gray-900 dark:text-white">Calendar</span>
          </Link>
          <Link
            href="/portal/newsletter"
            className="flex items-center gap-2 p-2.5 bg-white dark:bg-portal-surface rounded-md border border-gray-200 dark:border-portal-border hover:border-orange-200 dark:hover:border-portal-accent/30 hover:shadow-sm transition-all duration-200"
          >
            <div className="bg-amber-50 dark:bg-amber-500/[0.06] p-1.5 rounded-lg">
              <IconNotebook className="h-5 w-5 text-amber-600 dark:text-amber-300/60 flex-shrink-0" />
            </div>
            <span className="text-sm font-medium text-gray-900 dark:text-white">Newsletter</span>
          </Link>
          <Link
            href="/portal/rule-modifications"
            className="flex items-center gap-2 p-2.5 bg-white dark:bg-portal-surface rounded-md border border-gray-200 dark:border-portal-border hover:border-orange-200 dark:hover:border-portal-accent/30 hover:shadow-sm transition-all duration-200"
          >
            <div className="bg-red-50 dark:bg-red-500/[0.06] p-1.5 rounded-lg">
              <IconGavel className="h-5 w-5 text-red-600 dark:text-red-300/60 flex-shrink-0" />
            </div>
            <span className="text-sm font-medium text-gray-900 dark:text-white">Rule Modifications</span>
          </Link>
          {user.role !== 'official' && (
            <>
              <Link
                href="/portal/members"
                className="flex items-center gap-2 p-2.5 bg-white dark:bg-portal-surface rounded-md border border-gray-200 dark:border-portal-border hover:border-orange-200 dark:hover:border-portal-accent/30 hover:shadow-sm transition-all duration-200"
              >
                <div className="bg-indigo-50 dark:bg-indigo-500/[0.06] p-1.5 rounded-lg">
                  <IconUsers className="h-5 w-5 text-indigo-600 dark:text-indigo-300/60 flex-shrink-0" />
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-white">Members</span>
              </Link>
              <Link
                href="/portal/evaluations"
                className="flex items-center gap-2 p-2.5 bg-white dark:bg-portal-surface rounded-md border border-gray-200 dark:border-portal-border hover:border-orange-200 dark:hover:border-portal-accent/30 hover:shadow-sm transition-all duration-200"
              >
                <div className="bg-teal-50 dark:bg-teal-500/[0.06] p-1.5 rounded-lg">
                  <IconClipboard className="h-5 w-5 text-teal-600 dark:text-teal-300/60 flex-shrink-0" />
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-white">Evaluations</span>
              </Link>
            </>
          )}
          {user.role === 'admin' && (
            <>
              <Link
                href="/portal/admin"
                className="flex items-center gap-2 p-2.5 bg-white dark:bg-portal-surface rounded-md border border-gray-200 dark:border-portal-border hover:border-orange-200 dark:hover:border-portal-accent/30 hover:shadow-sm transition-all duration-200"
              >
                <div className="bg-slate-100 dark:bg-slate-700 p-1.5 rounded-lg">
                  <IconSettings className="h-5 w-5 text-slate-600 dark:text-slate-400 flex-shrink-0" />
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-white">Portal Admin</span>
              </Link>
              <Link
                href="/portal/admin/logs"
                className="flex items-center gap-2 p-2.5 bg-white dark:bg-portal-surface rounded-md border border-gray-200 dark:border-portal-border hover:border-orange-200 dark:hover:border-portal-accent/30 hover:shadow-sm transition-all duration-200"
              >
                <div className="bg-slate-100 dark:bg-slate-700 p-1.5 rounded-lg">
                  <IconReportAnalytics className="h-5 w-5 text-slate-600 dark:text-slate-400 flex-shrink-0" />
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-white">System Logs</span>
              </Link>
              <Link
                href="/portal/admin/email-history"
                className="flex items-center gap-2 p-2.5 bg-white dark:bg-portal-surface rounded-md border border-gray-200 dark:border-portal-border hover:border-orange-200 dark:hover:border-portal-accent/30 hover:shadow-sm transition-all duration-200"
              >
                <div className="bg-slate-100 dark:bg-slate-700 p-1.5 rounded-lg">
                  <IconMail className="h-5 w-5 text-slate-600 dark:text-slate-400 flex-shrink-0" />
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-white">Email History</span>
              </Link>
            </>
          )}
          {/* External links -- rendered only for the services configured in lib/siteConfig.ts */}
          {EXTERNAL_LINKS.assigning && (
            <a
              href={EXTERNAL_LINKS.assigning}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-2.5 bg-white dark:bg-portal-surface rounded-md border border-gray-200 dark:border-portal-border hover:border-orange-200 dark:hover:border-portal-accent/30 hover:shadow-sm transition-all duration-200"
            >
              <div className="bg-gray-100 dark:bg-portal-hover p-1.5 rounded-lg">
                <IconCalendarEvent className="h-5 w-5 text-gray-600 dark:text-gray-400 flex-shrink-0" />
              </div>
              <span className="text-sm font-medium text-gray-900 dark:text-white">Game Assignments</span>
              <IconExternalLink className="h-3 w-3 text-gray-400 ml-auto flex-shrink-0" />
            </a>
          )}
          {EXTERNAL_LINKS.filmStudy && (
            <a
              href={EXTERNAL_LINKS.filmStudy}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-2.5 bg-white dark:bg-portal-surface rounded-md border border-gray-200 dark:border-portal-border hover:border-orange-200 dark:hover:border-portal-accent/30 hover:shadow-sm transition-all duration-200"
            >
              <div className="bg-gray-100 dark:bg-portal-hover p-1.5 rounded-lg">
                <IconBallBasketball className="h-5 w-5 text-gray-600 dark:text-gray-400 flex-shrink-0" />
              </div>
              <span className="text-sm font-medium text-gray-900 dark:text-white">Film Study</span>
              <IconExternalLink className="h-3 w-3 text-gray-400 ml-auto flex-shrink-0" />
            </a>
          )}
          {EXTERNAL_LINKS.community && (
            <a
              href={EXTERNAL_LINKS.community}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-2.5 bg-white dark:bg-portal-surface rounded-md border border-gray-200 dark:border-portal-border hover:border-orange-200 dark:hover:border-portal-accent/30 hover:shadow-sm transition-all duration-200"
            >
              <div className="bg-gray-100 dark:bg-portal-hover p-1.5 rounded-lg">
                <IconBrandDiscord className="h-5 w-5 text-gray-600 dark:text-gray-400 flex-shrink-0" />
              </div>
              <span className="text-sm font-medium text-gray-900 dark:text-white">Member Community</span>
              <IconExternalLink className="h-3 w-3 text-gray-400 ml-auto flex-shrink-0" />
            </a>
          )}
          {EXTERNAL_LINKS.resourceCentre && (
            <a
              href={EXTERNAL_LINKS.resourceCentre}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-2.5 bg-white dark:bg-portal-surface rounded-md border border-gray-200 dark:border-portal-border hover:border-orange-200 dark:hover:border-portal-accent/30 hover:shadow-sm transition-all duration-200"
            >
              <div className="bg-gray-100 dark:bg-portal-hover p-1.5 rounded-lg">
                <IconArchive className="h-5 w-5 text-gray-600 dark:text-gray-400 flex-shrink-0" />
              </div>
              <span className="text-sm font-medium text-gray-900 dark:text-white">Resource Centre</span>
              <IconExternalLink className="h-3 w-3 text-gray-400 ml-auto flex-shrink-0" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}