/**
 * L&D Courses Page
 * 
 * Lists courses from the LND sidecar, filtered by type and status.
 * Supports onsite, online, and external course types.
 */
import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAppSelector, useAppDispatch } from '@/lib/store/hooks'
import { fetchLndCourses } from '@/lib/store/slices/lndDashboardSlice'
import { lndLmsAPI } from '@/lib/lnd-api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  BookOpen,
  Calendar,
  Users,
  MapPin,
  ArrowLeft,
  Monitor,
  Globe,
  Building2,
  Search,
} from 'lucide-react'
import CreateCourseDialog from './CreateCourseDialog'

const courseTypeConfig = {
  onsite: { label: 'Onsite', icon: Monitor, color: 'text-blue-600' },
  online: { label: 'Online', icon: Globe, color: 'text-emerald-600' },
  external: { label: 'External', icon: Building2, color: 'text-violet-600' },
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  planning: { label: 'Planning', variant: 'secondary' },
  upcoming: { label: 'Upcoming', variant: 'outline' },
  ongoing: { label: 'Ongoing', variant: 'default' },
  completed: { label: 'Completed', variant: 'secondary' },
}

export default function LndCoursesPage() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { type, status } = useParams<{ type?: string; status?: string }>()
  const { courses, coursesLoading, error } = useAppSelector((state) => state.lndDashboard)

  const activeType = type || 'onsite'
  const activeStatus = status || 'planning'

  // State for LMS online courses (fetched separately)
  const [lmsCourses, setLmsCourses] = useState<any[]>([])
  const [lmsLoading, setLmsLoading] = useState(false)
  const [lmsError, setLmsError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (activeType === 'online') {
      // Fetch from LMS cache endpoint
      setLmsLoading(true)
      setLmsError(null)
      lndLmsAPI.getCourses(true)
        .then((res) => {
          const data = res.data
          // Handle both { courses: [...] } and direct array response
          const courseList = Array.isArray(data) ? data : (data as any).courses || []
          setLmsCourses(courseList)
        })
        .catch((err) => {
          setLmsError(err.response?.status === 503
            ? 'L&D service is offline'
            : err.response?.data?.detail || 'Failed to fetch online courses')
        })
        .finally(() => setLmsLoading(false))
    } else {
      dispatch(fetchLndCourses({ course_type: activeType, status: activeStatus === 'all' ? undefined : activeStatus }))
    }
  }, [dispatch, activeType, activeStatus])

  const statuses = activeType === 'online'
    ? ['all']
    : ['planning', 'upcoming', 'ongoing', 'completed']

  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  const handleCourseCreated = () => {
    dispatch(fetchLndCourses({ course_type: activeType, status: activeStatus === 'all' ? undefined : activeStatus }))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/admin/lnd"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Course Management</h1>
            <p className="text-muted-foreground">Manage L&D training courses</p>
          </div>
        </div>
        {activeType !== 'online' && (
          <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
            + Add New Course
          </Button>
        )}
      </div>

      {/* Type Tabs */}
      <Tabs value={activeType} onValueChange={(v) => navigate(`/admin/lnd/courses/${v}/${v === 'online' ? 'all' : 'planning'}`)}>
        <TabsList>
          {Object.entries(courseTypeConfig).map(([key, cfg]) => (
            <TabsTrigger key={key} value={key} className="gap-2">
              <cfg.icon className="h-4 w-4" />
              {cfg.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Status Tabs */}
      {statuses.length > 1 && (
        <Tabs value={activeStatus} onValueChange={(v) => navigate(`/admin/lnd/courses/${activeType}/${v}`)}>
          <TabsList>
            {statuses.map((s) => (
              <TabsTrigger key={s} value={s} className="capitalize">{s}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      {/* Error State */}
      {(activeType === 'online' ? lmsError : error) && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6 text-destructive text-sm">{activeType === 'online' ? lmsError : error}</CardContent>
        </Card>
      )}

      {/* Online Courses - from LMS cache */}
      {activeType === 'online' ? (
        <>
          {/* Search bar for online courses */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search courses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {lmsLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader><div className="h-5 w-40 bg-muted rounded" /></CardHeader>
                  <CardContent><div className="h-4 w-24 bg-muted rounded" /></CardContent>
                </Card>
              ))}
            </div>
          ) : (() => {
            const filtered = lmsCourses.filter((c) =>
              (c.fullname || c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
              (c.shortname || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
              (c.categoryname || '').toLowerCase().includes(searchQuery.toLowerCase())
            )
            return filtered.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <BookOpen className="h-12 w-12 mb-4 opacity-30" />
                  <p>{searchQuery ? 'No courses match your search' : 'No online courses synced yet'}</p>
                  <p className="text-xs mt-1">Run a daily sync to populate LMS courses</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{filtered.length} course{filtered.length !== 1 ? 's' : ''} from Moodle LMS</p>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {filtered.map((course: any) => (
                    <Card key={course.id} className="hover:shadow-md transition-shadow group">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-base group-hover:text-primary transition-colors line-clamp-2">
                            {course.fullname || course.name}
                          </CardTitle>
                          {course.visible === 1 ? (
                            <Badge variant="default" className="ml-2 shrink-0">Active</Badge>
                          ) : (
                            <Badge variant="secondary" className="ml-2 shrink-0">Hidden</Badge>
                          )}
                        </div>
                        {course.shortname && (
                          <p className="text-xs text-muted-foreground font-mono">{course.shortname}</p>
                        )}
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                          {course.categoryname && (
                            <Badge variant="outline" className="text-xs">{course.categoryname}</Badge>
                          )}
                          {course.enrollment_count != null && (
                            <span className="flex items-center gap-1">
                              <Users className="h-3.5 w-3.5" />
                              {course.enrollment_count} enrolled
                            </span>
                          )}
                          {course.is_mandatory && (
                            <Badge variant="destructive" className="text-xs">Mandatory</Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )
          })()}
        </>
      ) : (
        /* Onsite / External courses from sidecar courses table */
        <>
          {coursesLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader><div className="h-5 w-40 bg-muted rounded" /></CardHeader>
                  <CardContent><div className="h-4 w-24 bg-muted rounded" /></CardContent>
                </Card>
              ))}
            </div>
          ) : courses.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <BookOpen className="h-12 w-12 mb-4 opacity-30" />
                <p>No {activeType} courses in {activeStatus} status</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {courses.map((course) => (
                <Card key={course.id} className="hover:shadow-md transition-shadow cursor-pointer group">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base group-hover:text-primary transition-colors line-clamp-2">
                        {course.name}
                      </CardTitle>
                      <Badge variant={statusConfig[course.status]?.variant || 'secondary'} className="ml-2 shrink-0">
                        {course.status}
                      </Badge>
                    </div>
                    {course.batch_code && (
                      <p className="text-xs text-muted-foreground font-mono">{course.batch_code}</p>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                      {course.start_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {new Date(course.start_date).toLocaleDateString()}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {course.enrollment_count || 0} enrolled
                      </span>
                      {course.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {course.location}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Create Course Dialog */}
      <CreateCourseDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        courseType={activeType as 'onsite' | 'external'}
        onSuccess={handleCourseCreated}
      />
    </div>
  )
}

