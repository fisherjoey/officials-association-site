'use client'

import React from 'react';
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
import { NEWSLETTER_NAME, EXTERNAL_LINKS, MODULES, isRouteEnabled } from '@/lib/siteConfig'
import { describePrincipal } from '@/lib/roles'

export default function PortalDashboard() {
  const { user, principal, hasRole, can } = useRole();

  // Quick Links, as data rather than as a wall of near-identical <Link>s. The
  // colours differ per tile and nothing else does, so a list is what this is.
  const allQuickLinks: {
    href: string
    label: string
    icon: React.ComponentType<{ className?: string }>
    iconWrapClass: string
    iconClass: string
    /**
     * Who is allowed to see the tile. Omitted means every signed-in member.
     *
     * A predicate rather than a staff/admin flag, because the answers do not
     * all sit on one ladder. The roster is executive business; the evaluation
     * library belongs to whoever holds the evaluator grant, at any rung. A
     * single flag could only say "not an ordinary member", which is what
     * conflated the two before `lib/roles.ts` split the rung from the grant.
     */
    allow?: () => boolean
  }[] = [
    { href: '/portal/profile', label: 'My Profile', icon: IconUser, iconWrapClass: 'bg-orange-50 dark:bg-portal-accent/10', iconClass: 'text-orange-600 dark:text-portal-accent' },
    { href: '/portal/resources', label: 'Resources', icon: IconBooks, iconWrapClass: 'bg-blue-50 dark:bg-blue-500/[0.06]', iconClass: 'text-blue-600 dark:text-blue-300/60' },
    { href: '/portal/news', label: 'News', icon: IconNews, iconWrapClass: 'bg-purple-50 dark:bg-purple-500/[0.06]', iconClass: 'text-purple-600 dark:text-purple-300/60' },
    { href: '/portal/calendar', label: 'Calendar', icon: IconCalendar, iconWrapClass: 'bg-green-50 dark:bg-green-500/[0.06]', iconClass: 'text-green-600 dark:text-green-300/60' },
    { href: '/portal/newsletter', label: NEWSLETTER_NAME, icon: IconNotebook, iconWrapClass: 'bg-amber-50 dark:bg-amber-500/[0.06]', iconClass: 'text-amber-600 dark:text-amber-300/60' },
    { href: '/portal/rule-modifications', label: 'Rule Modifications', icon: IconGavel, iconWrapClass: 'bg-red-50 dark:bg-red-500/[0.06]', iconClass: 'text-red-600 dark:text-red-300/60' },
    { href: '/portal/members', label: 'Members', icon: IconUsers, iconWrapClass: 'bg-indigo-50 dark:bg-indigo-500/[0.06]', iconClass: 'text-indigo-600 dark:text-indigo-300/60', allow: () => hasRole('executive') },
    { href: '/portal/evaluations', label: 'Evaluations', icon: IconClipboard, iconWrapClass: 'bg-teal-50 dark:bg-teal-500/[0.06]', iconClass: 'text-teal-600 dark:text-teal-300/60', allow: () => hasRole('executive') || can('evaluator') },
    { href: '/portal/admin', label: 'Portal Admin', icon: IconSettings, iconWrapClass: 'bg-slate-100 dark:bg-slate-700', iconClass: 'text-slate-600 dark:text-slate-400', allow: () => hasRole('admin') },
    { href: '/portal/admin/logs', label: 'System Logs', icon: IconReportAnalytics, iconWrapClass: 'bg-slate-100 dark:bg-slate-700', iconClass: 'text-slate-600 dark:text-slate-400', allow: () => hasRole('admin') },
    { href: '/portal/admin/email-history', label: 'Email History', icon: IconMail, iconWrapClass: 'bg-slate-100 dark:bg-slate-700', iconClass: 'text-slate-600 dark:text-slate-400', allow: () => hasRole('admin') },
  ];

  // Two gates, and they answer different questions. `allow` decides who is
  // permitted to see a link. isRouteEnabled decides whether the page behind it
  // was built at all: a disabled module is absent from the static export, so a
  // surviving link would be a silent 404 for everyone, admins included. Both
  // have to pass.
  //
  // The role-shaped `sections` arrays that used to sit here were dead: nothing
  // rendered them. The tiles below are the dashboard's only link list.
  const quickLinks = allQuickLinks
    .filter(link => (link.allow ? link.allow() : true))
    .filter(link => isRouteEnabled(link.href));

  return (
    <div className="space-y-4">
      {/* Welcome Section */}
      <div className="bg-white dark:bg-portal-surface rounded-lg border border-gray-200 dark:border-portal-border p-3 sm:p-4 relative overflow-hidden portal-animate">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-primary to-orange-400" />
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-brand-primary mb-0.5">Welcome back</p>
            <h1 className="font-heading text-lg sm:text-xl font-extrabold text-gray-900 dark:text-white tracking-tight">
              {user?.name}
            </h1>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-semibold bg-orange-50 dark:bg-portal-accent/10 text-brand-primary border border-orange-200 dark:border-portal-accent/20">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-primary" />
            {/* Rung first, grants in parentheses: "Executive (Evaluator)".
                The old ladder could only show one of the two. */}
            {describePrincipal(principal)}
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
          {MODULES.schedulerUpdates && <SchedulerUpdatesWidget />}
        </div>
      </div>

      {/* Latest Newsletter - Full Width. Both widgets link into their module's
          route, so they come down with it. */}
      {MODULES.newsletter && <LatestNewsletterWidget />}

      {/* Quick Links Section */}
      <div className="bg-white dark:bg-portal-surface rounded-lg border border-gray-200 dark:border-portal-border p-3 sm:p-4">
        <h3 className="font-heading text-sm sm:text-base font-semibold text-gray-900 dark:text-white mb-3">Quick Links</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {quickLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-2 p-2.5 bg-white dark:bg-portal-surface rounded-md border border-gray-200 dark:border-portal-border hover:border-orange-200 dark:hover:border-portal-accent/30 hover:shadow-sm transition-all duration-200"
            >
              <div className={`${link.iconWrapClass} p-1.5 rounded-lg`}>
                <link.icon className={`h-5 w-5 ${link.iconClass} flex-shrink-0`} />
              </div>
              <span className="text-sm font-medium text-gray-900 dark:text-white">{link.label}</span>
            </Link>
          ))}
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