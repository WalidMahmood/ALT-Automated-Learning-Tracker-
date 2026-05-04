/**
 * LMS Courses Tab
 *
 * Standalone component for the Training Plan Detail page.
 * Shows LMS courses that can be added to a training plan.
 * Displays as an expandable card below the curated topics section.
 */
import { useState, useEffect } from 'react'
import { lmsBridgeAPI } from '@/lib/lnd-bridge-api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import {
  Globe,
  Search,
  Plus,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronUp,
  BookOpen,
} from 'lucide-react'
import type { LMSCourse } from '@/lib/lnd-types'

interface LMSCoursesTabProps {
  /** Current plan topic IDs (lms_course_id values already in the plan) */
  existingLmsCourseIds: number[]
  /** Called when admin adds an LMS course to the plan */
  onAddCourse: (course: LMSCourse) => void
  /** Whether the plan is in edit mode */
  editable?: boolean
}

export function LMSCoursesTab({ existingLmsCourseIds, onAddCourse, editable = false }: LMSCoursesTabProps) {
  const [courses, setCourses] = useState<LMSCourse[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!expanded) return
    const fetchCourses = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await lmsBridgeAPI.getCourses(true)
        setCourses(res.data.courses || [])
      } catch (err: any) {
        if (err.response?.status === 503) {
          setError('LND service is offline — cannot load LMS courses')
        } else {
          setError('Failed to load LMS courses')
        }
      } finally {
        setLoading(false)
      }
    }
    fetchCourses()
  }, [expanded])

  const filtered = courses.filter(c =>
    !search ||
    c.fullname.toLowerCase().includes(search.toLowerCase()) ||
    c.shortname.toLowerCase().includes(search.toLowerCase()) ||
    c.categoryname?.toLowerCase().includes(search.toLowerCase())
  )

  const handleAdd = (course: LMSCourse) => {
    onAddCourse(course)
    toast.success(`Added LMS course: ${course.shortname}`)
  }

  return (
    <Card className="border-dashed border-emerald-300 dark:border-emerald-800">
      <CardHeader
        className="cursor-pointer hover:bg-muted/30 transition-colors py-3"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Globe className="h-4 w-4 text-emerald-600" />
            LMS Courses (Moodle)
            {existingLmsCourseIds.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {existingLmsCourseIds.length} added
              </Badge>
            )}
          </CardTitle>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search LMS courses..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-8 text-sm"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>
          )}

          {/* Loading */}
          {loading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading LMS courses...
            </div>
          ) : (
            <ScrollArea className="max-h-[300px]">
              <div className="space-y-1">
                {filtered.length === 0 && !loading && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {search ? `No courses matching "${search}"` : 'No LMS courses available'}
                  </p>
                )}
                {filtered.map((course) => {
                  const alreadyAdded = existingLmsCourseIds.includes(course.id)
                  return (
                    <div
                      key={course.id}
                      className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <BookOpen className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          <span className="text-sm font-medium truncate">{course.fullname}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 ml-5">
                          <span className="text-xs text-muted-foreground font-mono">{course.shortname}</span>
                          {course.categoryname && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1">{course.categoryname}</Badge>
                          )}
                        </div>
                      </div>
                      <div className="ml-2 shrink-0">
                        {alreadyAdded ? (
                          <Badge variant="secondary" className="gap-1 text-xs">
                            <CheckCircle2 className="h-3 w-3" /> Added
                          </Badge>
                        ) : editable ? (
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleAdd(course)}>
                            <Plus className="h-3 w-3" /> Add
                          </Button>
                        ) : (
                          <Badge variant="outline" className="text-xs">View only</Badge>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      )}
    </Card>
  )
}
