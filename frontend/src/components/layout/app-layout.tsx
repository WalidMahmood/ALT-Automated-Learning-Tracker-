
import React from "react"

import { useAppSelector } from '@/lib/store/hooks'
import { LoginForm } from '@/components/auth/login-form'
import { AppHeader } from './app-header'
import { AppSidebar } from './app-sidebar'
import { LeaveRequestModal } from '@/components/forms/leave-request-modal'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const { isAuthenticated } = useAppSelector((state) => state.auth)

  if (!isAuthenticated) {
    return (
      <ThemeProvider>
        <LoginForm />
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="relative flex min-h-screen flex-col bg-background">
          <AppHeader />
          <main className="flex-1 overflow-auto">
            <div className="container py-6 px-4 md:px-6 lg:px-8 max-w-7xl">
              {children}
            </div>
          </main>
          <LeaveRequestModal />
        </SidebarInset>
      </SidebarProvider>
    </ThemeProvider>
  )
}
