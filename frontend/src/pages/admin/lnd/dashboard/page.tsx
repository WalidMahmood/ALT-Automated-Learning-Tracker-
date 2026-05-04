/**
 * L&D Dashboard Page
 * 
 * Main landing page for the LND section.
 * Shows course statistics, health status, and quick links.
 */
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAppSelector, useAppDispatch } from '@/lib/store/hooks'
import { fetchLndDashboardStats, fetchLndHealth } from '@/lib/store/slices/lndDashboardSlice'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  BookOpen,
  Users,
  GraduationCap,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  Wifi,
  WifiOff,
  ArrowRight,
  Monitor,
  Globe,
  Building2,
} from 'lucide-react'

export default function LndDashboardPage() {
  const dispatch = useAppDispatch()
  const { stats, health, loading, error } = useAppSelector((state) => state.lndDashboard)

  useEffect(() => {
    dispatch(fetchLndDashboardStats())
    dispatch(fetchLndHealth())
  }, [dispatch])

  // Sidecar offline state
  if (health?.lnd_sidecar === 'offline' || error?.includes('offline')) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">L&D Dashboard</h1>
          <p className="text-muted-foreground">Learning & Development Planning</p>
        </div>
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center gap-4 pt-6">
            <WifiOff className="h-10 w-10 text-destructive" />
            <div>
              <h3 className="font-semibold text-destructive">L&D Service Offline</h3>
              <p className="text-sm text-muted-foreground">
                The LND sidecar service is not running. Please start it on port 8001.
              </p>
              <code className="mt-2 block text-xs bg-muted p-2 rounded font-mono">
                cd backend\lnd_sidecar && uvicorn app.main:app --port 8001
              </code>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">L&D Dashboard</h1>
          <p className="text-muted-foreground">Learning & Development Planning & Analytics</p>
        </div>
        <div className="flex items-center gap-2">
          {health?.lnd_sidecar === 'online' ? (
            <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30">
              <Wifi className="h-3 w-3 mr-1" /> Service Online
            </Badge>
          ) : (
            <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30">
              <AlertTriangle className="h-3 w-3 mr-1" /> Checking...
            </Badge>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 w-24 bg-muted rounded" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-16 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : stats ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Courses
              </CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_courses}</div>
              <p className="text-xs text-muted-foreground">
                {stats.active_courses} active
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Employees
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_students}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Enrollments
              </CardTitle>
              <GraduationCap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_enrollments}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Completion Rate
              </CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.completion_rate ? `${stats.completion_rate.toFixed(1)}%` : '—'}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Course Type Breakdown */}
      {stats?.courses_by_type && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-950/50">
                <Monitor className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-base">Onsite Courses</CardTitle>
                <CardDescription>In-person training sessions</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.courses_by_type['onsite'] || 0}</div>
              <Link to="/admin/lnd/courses/onsite/planning" className="mt-2 inline-flex items-center text-sm text-primary hover:underline">
                View courses <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-950/50">
                <Globe className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <CardTitle className="text-base">Online Courses</CardTitle>
                <CardDescription>LMS / Moodle courses</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.courses_by_type['online'] || 0}</div>
              <Link to="/admin/lnd/courses/online/all" className="mt-2 inline-flex items-center text-sm text-primary hover:underline">
                View courses <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-950/50">
                <Building2 className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <CardTitle className="text-base">External Courses</CardTitle>
                <CardDescription>Third-party training</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.courses_by_type['external'] || 0}</div>
              <Link to="/admin/lnd/courses/external/planning" className="mt-2 inline-flex items-center text-sm text-primary hover:underline">
                View courses <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Button asChild variant="outline" className="h-auto py-4 justify-start">
          <Link to="/admin/lnd/courses" className="flex items-center gap-3">
            <BookOpen className="h-5 w-5 text-primary" />
            <div className="text-left">
              <div className="font-medium">Course Management</div>
              <div className="text-xs text-muted-foreground">Create & manage courses</div>
            </div>
          </Link>
        </Button>

        <Button asChild variant="outline" className="h-auto py-4 justify-start">
          <Link to="/admin/lnd/employees" className="flex items-center gap-3">
            <Users className="h-5 w-5 text-primary" />
            <div className="text-left">
              <div className="font-medium">Employees</div>
              <div className="text-xs text-muted-foreground">View & manage employees</div>
            </div>
          </Link>
        </Button>

        <Button asChild variant="outline" className="h-auto py-4 justify-start">
          <Link to="/admin/lnd/mentors" className="flex items-center gap-3">
            <GraduationCap className="h-5 w-5 text-primary" />
            <div className="text-left">
              <div className="font-medium">Mentors</div>
              <div className="text-xs text-muted-foreground">Manage training mentors</div>
            </div>
          </Link>
        </Button>

        <Button asChild variant="outline" className="h-auto py-4 justify-start">
          <Link to="/admin/lnd/reports" className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-primary" />
            <div className="text-left">
              <div className="font-medium">L&D Reports</div>
              <div className="text-xs text-muted-foreground">Generate training reports</div>
            </div>
          </Link>
        </Button>
      </div>
    </div>
  )
}
