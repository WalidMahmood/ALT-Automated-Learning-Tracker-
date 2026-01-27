
import React from "react"

import { Link, useLocation } from 'react-router-dom'
import { useAppSelector, useAppDispatch } from '@/lib/store/hooks'
import { setSidebarOpen } from '@/lib/store/slices/uiSlice'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Calendar,
  ChevronLeft,
  ClipboardList,
  FileText,
  Home,
  Layers,
  Settings,
  Users,
  X,
} from 'lucide-react'

interface NavItem {
  title: string
  href: string
  icon: React.ReactNode
  adminOnly?: boolean
  learnerOnly?: boolean
}

const navItems: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: <Home className="h-4 w-4" />,
  },
  {
    title: 'Calendar',
    href: '/calendar',
    icon: <Calendar className="h-4 w-4" />,
    learnerOnly: true,
  },
  {
    title: 'My Training Plan',
    href: '/training-plan',
    icon: <ClipboardList className="h-4 w-4" />,
    learnerOnly: true,
  },
  {
    title: 'Entry Review',
    href: '/admin/entries',
    icon: <FileText className="h-4 w-4" />,
    adminOnly: true,
  },
  {
    title: 'Topic Management',
    href: '/admin/topics',
    icon: <Layers className="h-4 w-4" />,
    adminOnly: true,
  },
  {
    title: 'User Management',
    href: '/admin/users',
    icon: <Users className="h-4 w-4" />,
    adminOnly: true,
  },
  {
    title: 'Training Plans',
    href: '/admin/training-plans',
    icon: <ClipboardList className="h-4 w-4" />,
    adminOnly: true,
  },
  {
    title: 'Leave Requests',
    href: '/admin/leave',
    icon: <Calendar className="h-4 w-4" />,
    adminOnly: true,
  },
]

export function AppSidebar() {
  const { pathname } = useLocation()
  const dispatch = useAppDispatch()
  const { sidebarOpen } = useAppSelector((state) => state.ui)
  const { user } = useAppSelector((state) => state.auth)

  const filteredNavItems = navItems.filter((item) => {
    if (item.adminOnly && user?.role !== 'admin') return false
    if (item.learnerOnly && user?.role !== 'learner') return false
    return true
  })

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
          onClick={() => dispatch(setSidebarOpen(false))}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-300 md:static md:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Mobile close button */}
        <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-4 md:hidden">
          <span className="font-semibold text-sidebar-foreground">Menu</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => dispatch(setSidebarOpen(false))}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 py-4">
          <nav className="space-y-1 px-3">
            {filteredNavItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={() => dispatch(setSidebarOpen(false))}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
                  )}
                >
                  {item.icon}
                  {item.title}
                </Link>
              )
            })}
          </nav>
        </ScrollArea>

        {/* Footer */}
        <div className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-3 rounded-md bg-sidebar-accent/50 px-3 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground text-xs font-medium">
              {user?.name?.split(' ').map((n) => n[0]).join('').toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {user?.name}
              </p>
              <p className="text-xs text-sidebar-foreground/60 truncate">
                {user?.role === 'admin' ? 'Administrator' : 'Learner'}
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
