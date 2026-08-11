'use client'

import PortalHeader from '@/components/layout/PortalHeader';
import { AuthProvider } from '@/contexts/AuthContext';
import { RoleProvider } from '@/contexts/RoleContext';
import { MemberProvider } from '@/contexts/MemberContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import AuthGuard from '@/components/AuthGuard';
import MemberGuard from '@/components/portal/MemberGuard';

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AuthGuard requireAuth={true}>
          <RoleProvider>
            <MemberProvider>
              <ToastProvider>
                <MemberGuard>
                  <div className="min-h-screen bg-zinc-50 dark:bg-portal-bg transition-colors">
                    <PortalHeader />

                    {/* Portal Content */}
                    <main className="container mx-auto px-2 sm:px-4 py-2 sm:py-4">
                      <div className="max-w-7xl mx-auto">
                        {children}
                      </div>
                    </main>
                  </div>
                </MemberGuard>
              </ToastProvider>
            </MemberProvider>
          </RoleProvider>
        </AuthGuard>
      </AuthProvider>
    </ThemeProvider>
  );
}