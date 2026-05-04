
import React, { useCallback } from "react"

import { Link, useLocation } from 'react-router-dom'
import { useAppSelector, useAppDispatch } from '@/lib/store/hooks'
import { fetchDashboardStats } from '@/lib/store/slices/entriesSlice'
import { fetchTopics } from '@/lib/store/slices/topicsSlice'
import {
  Calendar,
  ClipboardList,
  FileText,
  FolderKanban,
  Home,
  Users,
  ShieldAlert,
  BarChart3,
  GraduationCap,
  BookOpen,
  ChevronDown,
} from 'lucide-react'

interface NavItem {
  title: string
  href: string
  icon: React.ReactNode
  adminOnly?: boolean
  learnerOnly?: boolean
  superuserOnly?: boolean
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
    title: 'My Projects',
    href: '/projects',
    icon: <FolderKanban className="h-4 w-4" />,
    learnerOnly: true,
  },
  {
    title: 'Reports',
    href: '/reports',
    icon: <BarChart3 className="h-4 w-4" />,
    adminOnly: true,
  },
  {
    title: 'Entry Review',
    href: '/admin/entries',
    icon: <FileText className="h-4 w-4" />,
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
    title: 'Projects',
    href: '/admin/projects',
    icon: <FolderKanban className="h-4 w-4" />,
    adminOnly: true,
  },
  {
    title: 'Audit Logs',
    href: '/admin/audit',
    icon: <ShieldAlert className="h-4 w-4" />,
    superuserOnly: true,
  },
]

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar,
} from '@/components/ui/sidebar'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ChevronsUpDown, LogOut, User as UserIcon } from 'lucide-react'
import api from '@/lib/api'
import { logout } from '@/lib/store/slices/authSlice'

export function AppSidebar() {
  const { pathname } = useLocation()
  const dispatch = useAppDispatch()
  const { user } = useAppSelector((state) => state.auth)
  const { isMobile, setOpenMobile } = useSidebar()

  const filteredNavItems = navItems.filter((item) => {
    if (item.adminOnly && user?.role !== 'admin') return false
    if (item.learnerOnly && user?.role !== 'learner') return false
    if (item.superuserOnly && !user?.is_superuser) return false
    return true
  })

  // Group items
  const mainItems = filteredNavItems.filter(i => !i.adminOnly && !i.superuserOnly)
  const adminItems = filteredNavItems.filter(i => i.adminOnly || i.superuserOnly)

  const handleNavigation = () => {
    if (isMobile) setOpenMobile(false)
  }

  // Prefetch dashboard data on hover/focus so it's ready before click
  const prefetchDashboard = useCallback(() => {
    if (user?.role === 'admin') {
      dispatch(fetchDashboardStats(false))
      dispatch(fetchTopics(false))
    }
  }, [dispatch, user?.role])

  const initials = user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U'

  return (
    <Sidebar variant="inset">
      <SidebarContent>
        {mainItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Application</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {mainItems.map((item) => {
                  const isActive = pathname === item.href
                  const isDashboard = item.href === '/dashboard'
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                        <Link 
                          to={item.href} 
                          onClick={handleNavigation}
                          onMouseEnter={isDashboard ? prefetchDashboard : undefined}
                          onFocus={isDashboard ? prefetchDashboard : undefined}
                        >
                          {item.icon}
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {adminItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => {
                  const isActive = pathname === item.href
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                        <Link to={item.href} onClick={handleNavigation}>
                          {item.icon}
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}

                {/* ── L&D Planning Collapsible Sub-menu ── */}
                {user?.role === 'admin' && (
                  <Collapsible defaultOpen={pathname.startsWith('/admin/lnd')} className="group/lnd">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          isActive={pathname.startsWith('/admin/lnd')}
                          tooltip="L&D Planning"
                        >
                          <GraduationCap className="h-4 w-4" />
                          <span>L&D Planning</span>
                          <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/lnd:rotate-180" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {[
                            { title: 'L&D Dashboard', href: '/admin/lnd', icon: <BarChart3 className="h-3.5 w-3.5" /> },
                            { title: 'Courses', href: '/admin/lnd/courses', icon: <BookOpen className="h-3.5 w-3.5" /> },
                            { title: 'Employees', href: '/admin/lnd/employees', icon: <Users className="h-3.5 w-3.5" /> },
                            { title: 'Mentors', href: '/admin/lnd/mentors', icon: <GraduationCap className="h-3.5 w-3.5" /> },
                            { title: 'L&D Reports', href: '/admin/lnd/reports', icon: <FileText className="h-3.5 w-3.5" /> },
                          ].map((sub) => (
                            <SidebarMenuSubItem key={sub.href}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={pathname === sub.href || (sub.href !== '/admin/lnd' && pathname.startsWith(sub.href))}
                              >
                                <Link to={sub.href} onClick={handleNavigation}>
                                  {sub.icon}
                                  <span>{sub.title}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-primary text-primary-foreground text-xs">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{user?.name}</span>
                    <span className="truncate text-xs text-muted-foreground capitalize">{user?.role}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                side={isMobile ? 'bottom' : 'right'}
                align="end"
                sideOffset={4}
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarFallback className="rounded-lg bg-primary text-primary-foreground">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">{user?.name}</span>
                      <span className="truncate text-xs">{user?.email}</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { handleNavigation(); window.location.href = '/profile' }}>
                  <UserIcon className="mr-2 h-4 w-4" />
                  Profile Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={async () => {
                    try {
                      const refreshToken = localStorage.getItem('refreshToken')
                      if (refreshToken) {
                        await api.post('/users/auth/logout/', { refresh: refreshToken })
                      }
                    } catch (err) {
                      console.error('Logout error:', err)
                    } finally {
                      dispatch(logout())
                    }
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
