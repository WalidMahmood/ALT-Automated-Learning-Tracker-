
import React from "react"

import { useAppSelector } from '@/lib/store/hooks'
import { LoginForm } from '@/components/auth/login-form'
import { AppHeader } from './app-header'
import { AppSidebar } from './app-sidebar'
import { LeaveRequestModal } from '@/components/forms/leave-request-modal'
import { ThemeProvider } from '@/components/providers/theme-provider'

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
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
          <AppSidebar />
          <main className="flex-1 overflow-auto">
            <div className="container py-6 px-4 md:px-6 lg:px-8 max-w-7xl">
              {children}
            </div>
          </main>
        </div>
        <LeaveRequestModal />
      </div>
    </ThemeProvider>
  )
}
