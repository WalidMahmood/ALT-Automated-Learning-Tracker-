import React, { useState, useMemo, useEffect } from 'react'

import { useAppSelector, useAppDispatch } from '@/lib/store/hooks'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpDown,
  BookOpen,
  Brain,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock,
  Eye,
  FileSearch,
  FileText,
  Flag,
  HelpCircle,
  Info,
  Layers,
  Lightbulb,
  Loader2,
  Minus,
  Scale,
  Search,
  ShieldAlert,
  ShieldCheck,
  Target,
  Timer,
  TrendingUp,
  Users,
  XCircle,
  Zap,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import type {
  Entry, User, Topic,
  TrainingPlan,
  PlanAssignment,
  NodeResult,
  FinalDecisionResult,
} from '@/lib/types'
import { OverrideModal } from '@/components/admin/override-modal'
import { mockUsers } from '@/lib/mock-data'

import { fetchEntries } from '@/lib/store/slices/entriesSlice'
import { fetchTopics } from '@/lib/store/slices/topicsSlice'
import { fetchTrainingPlans, fetchUserAssignments } from '@/lib/store/slices/trainingPlansSlice'
import { fetchUsers } from '@/lib/store/slices/usersSlice'
import { fetchLeaveRequests } from '@/lib/store/slices/leaveRequestsSlice'
import { fetchAllProjects } from '@/lib/store/slices/projectsSlice'
import type { Project } from '@/lib/types'
import { EntryDetailView } from '@/components/admin/entry-detail-view'

export default function DashboardPage() {
  const dispatch = useAppDispatch()

  const isAdmin = useAppSelector((state) => state.auth.user?.role === 'admin')

  useEffect(() => {
    dispatch(fetchEntries({}))
    dispatch(fetchTopics())
    dispatch(fetchTrainingPlans())
    dispatch(fetchLeaveRequests())
    dispatch(fetchUserAssignments())

    if (isAdmin) {
      dispatch(fetchUsers())
      dispatch(fetchAllProjects({}))
    }
  }, [dispatch, isAdmin])

  // Auto-refresh polling for admin - refetch entries every 5 seconds for real-time updates
  useEffect(() => {
    if (!isAdmin) return

    const intervalId = setInterval(() => {
      dispatch(fetchEntries({}))
    }, 5000) // Poll every 5 seconds

    return () => clearInterval(intervalId)
  }, [dispatch, isAdmin])

  return <DashboardContent />
}

function DashboardContent() {
  const { user } = useAppSelector((state) => state.auth)
  const { entries } = useAppSelector((state) => state.entries)
  const { topics } = useAppSelector((state) => state.topics)
  const { users } = useAppSelector((state) => state.users)
  const { requests: leaveRequests } = useAppSelector((state) => state.leaveRequests)
  const { plans, userAssignments } = useAppSelector((state) => state.trainingPlans)
  const { projects } = useAppSelector((state) => state.projects)

  const isAdmin = user?.role === 'admin'

  // Calculate stats
  const stats = useMemo(() => {
    if (isAdmin) {
      const allEntries = Array.isArray(entries) ? entries : []
      const flagged = allEntries.filter((e) => e.status === 'flagged' || e.status === 'rejected').length
      const approved = allEntries.filter((e) => e.status === 'approved').length
      // "Needs Review" = AI finished analyzing but decision is 'pending' (low confidence, needs human)
      const needsReview = allEntries.filter((e) => e.status === 'pending' && e.ai_status === 'analyzed').length
      // "Processing" = AI hasn't analyzed yet (still in pipeline or queued)
      const processing = allEntries.filter((e) => e.status === 'pending' && e.ai_status !== 'analyzed').length
      // "Error" = AI analysis failed (connection issues, timeouts, etc.)
      const error = allEntries.filter((e) => e.ai_status === 'error').length
      const pendingLeaves = (Array.isArray(leaveRequests) ? leaveRequests : []).filter((l) => l.status === 'approved').length
      const totalLearners = (Array.isArray(users) ? users : []).filter((u) => u.role === 'learner' && u.is_active).length
      const totalHours = allEntries.reduce((sum, e) => sum + parseFloat(e.hours as any), 0)

      return {
        needsReview,
        processing,
        error,
        flagged,
        approved,
        pendingLeaves,
        totalLearners,
        totalHours,
      }
    }

    // Learner stats
    const userEntries = (Array.isArray(entries) ? entries : []).filter((e) => e.user === user?.id)
    const approved = userEntries.filter((e) => e.status === 'approved').length
    const analyzing = userEntries.filter((e) => e.status === 'pending').length
    const flagged = userEntries.filter((e) => e.status === 'flagged' || e.status === 'rejected').length
    const totalHours = userEntries.reduce((sum, e) => sum + parseFloat(e.hours as any), 0)

    return {
      approved,
      analyzing,
      flagged,
      totalHours,
      totalEntries: userEntries.length,
    }
  }, [isAdmin, entries, leaveRequests, users, user?.id])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {isAdmin ? 'Admin Dashboard' : 'Dashboard'}
        </h1>
        <p className="text-muted-foreground">
          {isAdmin
            ? 'Overview of all learner activities and system status'
            : `Welcome back, ${user?.name}. Here's your learning overview.`}
        </p>
      </div>

      {isAdmin ? (
        <AdminDashboard
          stats={stats}
          entries={entries}
          topics={topics}
          users={users}
          projects={projects}
        />
      ) : (
        <LearnerDashboard
          stats={stats}
          user={user}
          entries={entries}
          topics={topics}
          plans={plans}
          assignments={userAssignments}
        />
      )}
    </div>
  )
}

function AdminDashboard({
  stats,
  entries,
  topics,
  users,
  projects,
}: {
  stats: any,
  entries: Entry[],
  topics: Topic[],
  users: User[],
  projects: Project[],
}) {
  // In-place Drill-down State
  const [drillLevel, setDrillLevel] = useState(0) // 0: Topics, 1: Entries, 2: Details
  const [selectedTopic, setSelectedTopic] = useState<{ id: number, name: string } | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null)
  const [overrideModalOpen, setOverrideModalOpen] = useState(false)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())

  // Level 1: Topic Entries list
  const [topicEntriesPageSize, setTopicEntriesPageSize] = useState(50)
  const [topicEntriesSort, setTopicEntriesSort] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null)
  const [entriesStatusFilter, setEntriesStatusFilter] = useState<'all' | 'pending' | 'needs_review' | 'processing' | 'error' | 'flagged' | 'approved'>('all')
  const [entriesSearchQuery, setEntriesSearchQuery] = useState('')
  const [entriesMinHours, setEntriesMinHours] = useState(0)
  const [entriesMaxHours, setEntriesMaxHours] = useState(0)
  const [entriesStartDate, setEntriesStartDate] = useState('')
  const [entriesEndDate, setEntriesEndDate] = useState('')

  const openFilteredEntries = (statusFilter: 'all' | 'pending' | 'needs_review' | 'processing' | 'error' | 'flagged' | 'approved') => {
    setSelectedTopic(null)
    setEntriesStatusFilter(statusFilter)
    setDrillLevel(1)
  }

  const openTopicEntries = (topicId: number, topicName: string) => {
    setSelectedTopic({ id: topicId, name: topicName })
    setDrillLevel(1)
  }

  const handleEntryClick = (entry: Entry) => {
    setSelectedEntry(entry)
    setDrillLevel(2)
  }

  const handleOverride = (entry: Entry) => {
    setSelectedEntry(entry)
    setOverrideModalOpen(true)
  }

  const goBack = () => {
    if (drillLevel === 2) {
      setDrillLevel(1)
      setSelectedEntry(null)
    } else if (drillLevel === 1) {
      setDrillLevel(0)
      setSelectedTopic(null)
    }
  }

  // Helper: Recursive descendant IDs
  const getDescendantIds = (topicId: number): number[] => {
    const children = topics.filter(t => t.parent_id === topicId)
    return children.reduce((acc, child) => {
      return [...acc, child.id, ...getDescendantIds(child.id)]
    }, [] as number[])
  }

  // Helper: Topic path breadcrumb
  const getTopicPath = (topicId: number): string => {
    const topic = topics.find(t => t.id === topicId)
    if (!topic) return 'Unknown'
    if (!topic.parent_id) return topic.name
    const parent = topics.find(t => t.id === topic.parent_id)
    if (!parent) return topic.name
    return `${getTopicPath(topic.parent_id)} > ${topic.name}`
  }

  // Sorting and Filtering states for Level 0 (Topics)
  const [topicFilter, setTopicFilter] = useState('')
  const [topicSort, setTopicSort] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null) // Default: null (triggers Last Created sort)
  const [topicPageSize, setTopicPageSize] = useState(50)
  const [topicFlaggedFilter, setTopicFlaggedFilter] = useState<'all' | 'has_flagged' | 'no_flagged'>('all')
  const [topicMinEntries, setTopicMinEntries] = useState(0)

  // Level 0: Topic analytics (ROOT LEVEL ONLY with aggregation)
  const topicStats = useMemo(() => {
    // Only show topics that are top-level parents (root)
    const rootTopics = topics.filter(t => t.parent_id === null)

    let results = rootTopics.map(root => {
      const familyIds = [root.id, ...getDescendantIds(root.id)]
      const familyEntries = entries.filter(e => e.topic !== null && familyIds.includes(e.topic))

      return {
        id: root.id,
        name: root.name,
        created_at: root.created_at || new Date().toISOString(),
        entries: familyEntries.length,
        hours: familyEntries.reduce((sum, e) => sum + Number(e.hours || 0), 0),
        flagged: familyEntries.filter(e => e.status === 'flagged' || e.status === 'rejected').length,
        userCount: new Set(familyEntries.map(e => e.user)).size
      }
    })

    // Apply search filter
    if (topicFilter) {
      results = results.filter((t) => t.name.toLowerCase().includes(topicFilter.toLowerCase()))
    }

    // Apply flagged filter
    if (topicFlaggedFilter === 'has_flagged') {
      results = results.filter((t) => t.flagged > 0)
    } else if (topicFlaggedFilter === 'no_flagged') {
      results = results.filter((t) => t.flagged === 0)
    }

    // Apply minimum entries filter
    if (topicMinEntries > 0) {
      results = results.filter((t) => t.entries >= topicMinEntries)
    }

    // Apply sorting
    if (topicSort) {
      results.sort((a, b) => {
        // @ts-ignore
        const aVal = a[topicSort.key]
        // @ts-ignore
        const bVal = b[topicSort.key]
        if (aVal < bVal) return topicSort.direction === 'asc' ? -1 : 1
        if (aVal > bVal) return topicSort.direction === 'asc' ? 1 : -1
        return 0
      })
    } else {
      // Default: Sort by Last Created (Newest First) using created_at
      results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }

    return results.slice(0, topicPageSize)
  }, [entries, topics, topicFilter, topicSort, topicPageSize, topicFlaggedFilter, topicMinEntries])

  // Level 1: Filtered entries for selected topic (+ descendants) OR pending/flagged entries
  const currentTopicEntries = useMemo(() => {
    let results: Entry[] = []

    if (selectedTopic) {
      // Include selected topic AND all its children
      const familyIds = [selectedTopic.id, ...getDescendantIds(selectedTopic.id)]
      results = entries.filter(e => e.topic !== null && familyIds.includes(e.topic))
    } else if (drillLevel === 1) {
      // Show all entries when no topic is selected (status filter handles narrowing)
      results = [...entries]
    }

    // Apply status filter
    if (entriesStatusFilter === 'needs_review') {
      results = results.filter(e => e.status === 'pending' && e.ai_status === 'analyzed')
    } else if (entriesStatusFilter === 'processing') {
      results = results.filter(e => e.status === 'pending' && e.ai_status !== 'analyzed')
    } else if (entriesStatusFilter === 'error') {
      results = results.filter(e => e.ai_status === 'error')
    } else if (entriesStatusFilter === 'flagged') {
      results = results.filter(e => e.status === 'flagged' || e.status === 'rejected')
    } else if (entriesStatusFilter !== 'all') {
      results = results.filter(e => e.status === entriesStatusFilter)
    }

    // Apply search filter
    if (entriesSearchQuery) {
      const query = entriesSearchQuery.toLowerCase()
      results = results.filter(e => {
        const user = mockUsers.find(u => u.id === e.user)
        return (
          user?.name.toLowerCase().includes(query) ||
          e.id.toString().includes(query)
        )
      })
    }

    // Apply hours range filter
    if (entriesMinHours > 0) {
      results = results.filter(e => e.hours >= entriesMinHours)
    }
    if (entriesMaxHours > 0) {
      results = results.filter(e => e.hours <= entriesMaxHours)
    }

    // Apply date range filter
    if (entriesStartDate) {
      results = results.filter(e => e.date >= entriesStartDate)
    }
    if (entriesEndDate) {
      results = results.filter(e => e.date <= entriesEndDate)
    }

    if (topicEntriesSort) {
      results.sort((a, b) => {
        // @ts-ignore
        const aVal = a[topicEntriesSort.key]
        // @ts-ignore
        const bVal = b[topicEntriesSort.key]
        if (aVal < bVal) return topicEntriesSort.direction === 'asc' ? -1 : 1
        if (aVal > bVal) return topicEntriesSort.direction === 'asc' ? 1 : -1
        return 0
      })
    }

    return results.slice(0, topicEntriesPageSize)
  }, [entries, selectedTopic, drillLevel, entriesStatusFilter, entriesSearchQuery, entriesMinHours, entriesMaxHours, entriesStartDate, entriesEndDate, topicEntriesSort, topicEntriesPageSize])

  // Calculate effective benchmark for a topic (sum of children's benchmarks if parent, or direct benchmark if leaf)
  const calculateEffectiveBenchmark = (topicId: number): number => {
    const topic = topics.find(t => t.id === topicId)
    if (!topic) return 0.0

    // Find direct children
    const children = topics.filter(t => t.parent_id === topicId)

    if (children.length > 0) {
      // It's a parent -> Sum children's benchmarks recursively
      return children.reduce((sum, child) => sum + calculateEffectiveBenchmark(child.id), 0)
    }

    // It's a leaf -> Return direct benchmark
    return Number(topic.benchmark_hours) || 0.0
  }



  const requestTopicSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (topicSort && topicSort.key === key && topicSort.direction === 'asc') {
      direction = 'desc'
    }
    setTopicSort({ key, direction })
  }

  const requestEntriesSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (topicEntriesSort && topicEntriesSort.key === key && topicEntriesSort.direction === 'asc') {
      direction = 'desc'
    }
    setTopicEntriesSort({ key, direction })
  }

  return (
    <>
      <OverrideModal
        entry={overrideModalOpen ? selectedEntry : null}
        open={overrideModalOpen}
        onClose={() => {
          setOverrideModalOpen(false)
          // Don't deselect selectedEntry here if we're in Level 2 detail view
          if (drillLevel !== 2) setSelectedEntry(null)
        }}
      />

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Card
          className={cn("hover:bg-muted/50 transition-colors cursor-pointer h-full", stats.approved > 0 && 'border-success')}
          onClick={() => openFilteredEntries('approved')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">{stats.approved}</div>
            <p className="text-xs text-muted-foreground">AI / admin approved</p>
          </CardContent>
        </Card>

        <Card
          className={cn("hover:bg-muted/50 transition-colors cursor-pointer h-full", stats.flagged > 0 && 'border-destructive')}
          onClick={() => openFilteredEntries('flagged')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Flagged</CardTitle>
            <Flag className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.flagged}</div>
            <p className="text-xs text-muted-foreground">Needs attention</p>
          </CardContent>
        </Card>

        <Card
          className={cn("hover:bg-muted/50 transition-colors cursor-pointer h-full", stats.error > 0 && 'border-red-500')}
          onClick={() => openFilteredEntries('error')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Error</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", stats.error > 0 ? "text-red-500" : "")}>
              {stats.error}
            </div>
            <p className="text-xs text-muted-foreground">AI analysis failed</p>
          </CardContent>
        </Card>

        <Card
          className={cn("hover:bg-muted/50 transition-colors cursor-pointer h-full", stats.needsReview > 0 && 'border-orange-400')}
          onClick={() => openFilteredEntries('needs_review')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Needs Review</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", stats.needsReview > 0 ? "text-orange-500" : "")}>
              {stats.needsReview}
            </div>
            <p className="text-xs text-muted-foreground">AI uncertain — human decision needed</p>
          </CardContent>
        </Card>

        <Card
          className={cn("hover:bg-muted/50 transition-colors cursor-pointer h-full")}
          onClick={() => openFilteredEntries('processing')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Processing</CardTitle>
            <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">
              {stats.processing}
            </div>
            <p className="text-xs text-muted-foreground">In AI analysis pipeline</p>
          </CardContent>
        </Card>

        <Link to="/admin/users">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Learners</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalLearners}</div>
              <p className="text-xs text-muted-foreground">Currently enrolled</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Main Content - Dynamic Drill-down Table */}
      <Card className="col-span-full shadow-md">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-6">
          <div className="flex items-center gap-3">
            {drillLevel > 0 && (
              <Button variant="ghost" size="icon" onClick={goBack} className="h-9 w-9">
                <ChevronLeft className="h-5 w-5" />
              </Button>
            )}
            <div>
              <CardTitle className="text-xl">
                {drillLevel === 0 && "Entries Summary"}
                {drillLevel === 1 && (selectedTopic ? `${selectedTopic.name} - Entries` : "Filtered Entries")}
                {drillLevel === 2 && `Entry Details (#${selectedEntry?.id})`}
              </CardTitle>
              <CardDescription>
                {drillLevel === 0 && "View learning activities by topic"}
                {drillLevel === 1 && `Reviewing entries for ${selectedTopic?.name || 'filtered selection'}`}
                {drillLevel === 2 && `Detailed view for entry by ${mockUsers.find(u => u.id === selectedEntry?.user)?.name}`}
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            {drillLevel === 0 && (
              <>
                <Select value={topicFlaggedFilter} onValueChange={(v) => setTopicFlaggedFilter(v as 'all' | 'has_flagged' | 'no_flagged')}>
                  <SelectTrigger className="w-[150px] h-9">
                    <SelectValue placeholder="Flagged Filter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Topics</SelectItem>
                    <SelectItem value="has_flagged">Has Flagged</SelectItem>
                    <SelectItem value="no_flagged">No Flagged</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  placeholder="Min Entries"
                  value={topicMinEntries || ''}
                  onChange={e => setTopicMinEntries(parseInt(e.target.value) || 0)}
                  className="w-[120px] h-9"
                  min="0"
                />
                <Select value={topicPageSize.toString()} onValueChange={(v) => setTopicPageSize(parseInt(v))}>
                  <SelectTrigger className="w-[110px] h-9">
                    <SelectValue placeholder="Show 50" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="50">Show 50</SelectItem>
                    <SelectItem value="100">Show 100</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search topics..."
                    value={topicFilter}
                    onChange={e => setTopicFilter(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
              </>
            )}
            {drillLevel === 1 && (
              <>
                <Select value={entriesStatusFilter} onValueChange={(v) => setEntriesStatusFilter(v as 'all' | 'pending' | 'needs_review' | 'processing' | 'error' | 'flagged' | 'approved')}>
                  <SelectTrigger className="w-[150px] h-9">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="needs_review">Needs Review</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                    <SelectItem value="flagged">Flagged</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  placeholder="Min Hours"
                  value={entriesMinHours || ''}
                  onChange={e => setEntriesMinHours(parseFloat(e.target.value) || 0)}
                  className="w-[110px] h-9"
                  min="0"
                  step="0.5"
                />
                <Input
                  type="number"
                  placeholder="Max Hours"
                  value={entriesMaxHours || ''}
                  onChange={e => setEntriesMaxHours(parseFloat(e.target.value) || 0)}
                  className="w-[110px] h-9"
                  min="0"
                  step="0.5"
                />
                <Input
                  type="date"
                  placeholder="Start Date"
                  value={entriesStartDate}
                  onChange={e => setEntriesStartDate(e.target.value)}
                  className="w-[140px] h-9"
                />
                <Input
                  type="date"
                  placeholder="End Date"
                  value={entriesEndDate}
                  onChange={e => setEntriesEndDate(e.target.value)}
                  className="w-[140px] h-9"
                />
                <Select value={topicEntriesPageSize.toString()} onValueChange={(v) => setTopicEntriesPageSize(parseInt(v))}>
                  <SelectTrigger className="w-[110px] h-9">
                    <SelectValue placeholder="Show 50" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="50">Show 50</SelectItem>
                    <SelectItem value="100">Show 100</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by user or entry #..."
                    value={entriesSearchQuery}
                    onChange={e => setEntriesSearchQuery(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {drillLevel === 0 && (
            <>
              <div className="rounded-lg border overflow-hidden shadow-sm">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead
                        className="py-3 h-11 text-xs uppercase font-bold cursor-pointer hover:text-primary transition-colors"
                        onClick={() => requestTopicSort('name')}
                      >
                        <div className="flex items-center gap-1">
                          Topic Name
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead
                        className="py-3 h-11 text-center text-xs uppercase font-bold cursor-pointer hover:text-primary transition-colors"
                        onClick={() => requestTopicSort('entries')}
                      >
                        <div className="flex items-center justify-center gap-1">
                          Entries
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead
                        className="py-3 h-11 text-center text-xs uppercase font-bold cursor-pointer hover:text-primary transition-colors"
                        onClick={() => requestTopicSort('userCount')}
                      >
                        <div className="flex items-center justify-center gap-1">
                          Users
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topicStats.map((topic) => (
                      <TableRow
                        key={topic.id}
                        className="cursor-pointer hover:bg-muted/30 transition-colors group"
                        onClick={() => openTopicEntries(topic.id, topic.name)}
                      >
                        <TableCell className="py-4 font-medium text-sm">
                          <div className="flex items-center gap-2">
                            <span className="group-hover:text-primary transition-colors text-primary font-semibold">{topic.name}</span>
                            {topic.flagged > 0 && (
                              <Badge variant="destructive" className="h-5 px-1.5 text-xs font-bold">
                                {topic.flagged} FLAGGED
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-4 text-center font-mono text-sm">{topic.entries}</TableCell>
                        <TableCell className="py-4 text-center font-mono text-sm">{topic.userCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {topicStats.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg mt-2 bg-muted/10">
                  <Search className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground text-sm font-medium">No results found for "{topicFilter}"</p>
                  <Button variant="link" size="sm" onClick={() => setTopicFilter('')} className="mt-1">Clear filters</Button>
                </div>
              )}
            </>
          )}

          {drillLevel === 1 && (
            <div className="rounded-lg border overflow-hidden shadow-sm">
              <Table>
                <TableHeader className="bg-muted/40 font-bold">
                  <TableRow>
                    <TableHead
                      className="cursor-pointer hover:text-primary transition-colors"
                      onClick={() => requestEntriesSort('id')}
                    >
                      <div className="flex items-center gap-1">Entry # <ArrowUpDown className="h-3 w-3" /></div>
                    </TableHead>
                    <TableHead>User Name</TableHead>
                    <TableHead>Topic Area</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead
                      className="text-right cursor-pointer hover:text-primary transition-colors"
                      onClick={() => requestEntriesSort('progress_percent')}
                    >
                      <div className="flex items-center justify-end gap-1">Progress % <ArrowUpDown className="h-3 w-3" /></div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentTopicEntries.map((entry) => {
                    const user = users.find((u) => u.id === entry.user)
                    const entryTopic = topics.find(t => t.id === entry.topic)
                    let parentProgress = Math.round(Number(entry.progress_percent) || 0)
                    if (entryTopic?.parent_id) {
                      const parentTopic = topics.find(t => t.id === entryTopic.parent_id)
                      if (parentTopic) {
                        const childTopics = topics.filter(t => t.parent_id === parentTopic.id)
                        if (childTopics.length > 0) {
                          const totalProgress = childTopics.reduce((sum, child) => {
                            const childEntries = entries.filter(e => e.topic === child.id && e.user === entry.user)
                            const maxP = childEntries.length > 0 ? Math.max(...childEntries.map(e => Number(e.progress_percent) || 0)) : 0
                            return sum + maxP
                          }, 0)
                          parentProgress = Math.round(totalProgress / childTopics.length)
                        }
                      }
                    }

                    return (
                      <TableRow
                        key={entry.id}
                        className="cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() => handleEntryClick(entry)}
                      >
                        <TableCell className="font-mono text-xs font-semibold text-primary">#{entry.id}</TableCell>
                        <TableCell className="font-medium">{user?.name}</TableCell>
                        <TableCell className="text-xs font-medium text-muted-foreground/80">
                          {entry.topic ? getTopicPath(entry.topic) : '—'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{entry.date}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {(() => {
                              if (entry.status === 'approved') return <Badge className="text-xs font-bold uppercase bg-success">Approved</Badge>
                              if (entry.status === 'flagged' || entry.status === 'rejected') return <Badge variant="destructive" className="text-xs font-bold uppercase">Flagged</Badge>
                              if (entry.status === 'pending' && entry.ai_status === 'analyzed') return <Badge className="text-xs font-bold uppercase bg-orange-500/15 text-orange-700 border border-orange-500/30">Needs Review</Badge>
                              if (entry.status === 'pending' && entry.ai_status === 'error') return <Badge variant="destructive" className="text-xs font-bold uppercase bg-red-500/15 text-red-700 border border-red-500/30">Error</Badge>
                              return <Badge variant="secondary" className="text-xs font-bold uppercase bg-muted text-muted-foreground">Processing</Badge>
                            })()}
                            {entry.admin_override && (
                              <Badge className="text-xs font-bold uppercase bg-blue-500/15 text-blue-700 border border-blue-500/30 px-1">⚡</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" className="font-mono bg-muted/20">
                            {parentProgress}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              {currentTopicEntries.length === 0 && (
                <div className="p-12 text-center text-muted-foreground">No entries found for this topic.</div>
              )}
            </div>
          )}

          {drillLevel === 2 && selectedEntry && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 p-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="md:col-span-2 space-y-8">
                <div>
                  <h3 className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-widest flex items-center gap-2">
                    <BookOpen className="h-3 w-3" /> Topic
                  </h3>
                  <div className="p-4 bg-muted/20 rounded-xl border text-sm font-medium">
                    {selectedEntry.topic ? getTopicPath(selectedEntry.topic) : '—'}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-widest flex items-center gap-2">
                    <Users className="h-3 w-3" /> Learner Details
                  </h3>
                  <div className="p-4 bg-muted/20 rounded-xl border text-sm font-medium flex items-center justify-between">
                    <span>{users.find(u => u.id === selectedEntry.user)?.name || 'Unknown User'}</span>
                    <span className="text-xs text-muted-foreground">ID: {selectedEntry.user}</span>
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-widest flex items-center gap-2">
                    <FileText className="h-3 w-3" /> Detailed Description
                  </h3>
                  <div className="p-5 bg-card/50 rounded-xl text-sm leading-relaxed border shadow-inner whitespace-pre-wrap min-h-[120px] max-h-[400px] overflow-y-auto break-words">
                    {selectedEntry.learned_text}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-bold text-destructive mb-2 uppercase tracking-widest flex items-center gap-2">
                    <AlertTriangle className="h-3 w-3" /> Blockers Encountered
                  </h3>
                  <div className={cn(
                    "p-5 rounded-xl text-sm border shadow-sm font-medium",
                    selectedEntry.blockers_text ? "bg-destructive/5 text-destructive border-destructive/20" : "bg-muted/10 text-muted-foreground border-border"
                  )}>
                    {(() => {
                      const text = selectedEntry.blockers_text || '';
                      if (!text) return <span className="italic opacity-70">None reported</span>;

                      const parts = text.split(':');
                      const potentialType = parts[0]?.trim();
                      const description = parts.length > 1 ? parts.slice(1).join(':').trim() : text;
                      const validTypes = ['Technical', 'Environmental', 'Personal', 'Resource', 'Other'];

                      if (parts.length > 1 && validTypes.includes(potentialType)) {
                        return (
                          <div className="flex flex-col gap-2 min-w-0">
                            <Badge variant="destructive" className="w-fit px-2 py-0.5 text-xs uppercase font-bold tracking-wider">{potentialType}</Badge>
                            <span className="leading-relaxed text-foreground/80 break-words overflow-hidden" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{description}</span>
                          </div>
                        )
                      }
                      return <span className="break-words" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{text}</span>;
                    })()}
                  </div>
                </div>

                <div className="pt-6 border-t">
                  {/* ── Header with decision badge ── */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/20">
                        <Brain className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-foreground tracking-tight">AI Brain Analysis</h3>
                        <p className="text-xs text-muted-foreground">5-Node v6.0 Dual Pipeline &middot; {selectedEntry.intent?.replace('_', ' ') || 'deep learning'}</p>
                      </div>
                    </div>
                    {selectedEntry.admin_override ? (
                      <Badge className="text-xs font-bold uppercase px-3 py-1 border-0 shadow-sm bg-blue-500/15 text-blue-700 dark:text-blue-400">
                        <Zap className="w-3.5 h-3.5 mr-1.5" />OVERRIDDEN
                      </Badge>
                    ) : selectedEntry.ai_decision && (
                      <Badge className={cn(
                        "text-xs font-bold uppercase px-3 py-1 border-0 shadow-sm",
                        selectedEntry.ai_decision === 'approve' && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
                        selectedEntry.ai_decision === 'flag' && "bg-red-500/15 text-red-700 dark:text-red-400",
                        selectedEntry.ai_decision === 'pending' && "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                      )}>
                        {selectedEntry.ai_decision === 'approve' && <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
                        {selectedEntry.ai_decision === 'flag' && <Flag className="w-3.5 h-3.5 mr-1.5" />}
                        {selectedEntry.ai_decision === 'pending' && <HelpCircle className="w-3.5 h-3.5 mr-1.5" />}
                        {selectedEntry.ai_decision}
                      </Badge>
                    )}
                  </div>

                  {/* ── Confidence Gauge ── */}
                  {selectedEntry.ai_confidence != null && Number(selectedEntry.ai_confidence) >= 0 && (() => {
                    const confidence = Number(selectedEntry.ai_confidence)
                    return (
                      <div className="mb-4 p-3 rounded-lg bg-muted/30 border">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium text-muted-foreground">Confidence Score</span>
                          <span className={cn("text-sm font-bold tabular-nums",
                            confidence >= 85 ? "text-emerald-600" : confidence >= 70 ? "text-amber-600" : "text-red-600"
                          )}>{confidence.toFixed(1)}%</span>
                        </div>
                        <div className="relative h-2.5 w-full rounded-full bg-muted overflow-hidden">
                          <div className={cn("h-full rounded-full transition-all duration-700 ease-out",
                            confidence >= 85 ? "bg-gradient-to-r from-emerald-400 to-emerald-500" :
                              confidence >= 70 ? "bg-gradient-to-r from-amber-400 to-amber-500" :
                                "bg-gradient-to-r from-red-400 to-red-500"
                          )} style={{ width: `${Math.min(confidence, 100)}%` }} />
                          <div className="absolute top-0 left-[70%] w-px h-full bg-foreground/20" title="Flag threshold" />
                          <div className="absolute top-0 left-[85%] w-px h-full bg-foreground/20" title="Approve threshold" />
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-xs text-muted-foreground">0%</span>
                          <div className="flex gap-3">
                            <span className="text-xs text-red-500/70">Pending &lt;70</span>
                            <span className="text-xs text-amber-500/70">Flag 70-84</span>
                            <span className="text-xs text-emerald-500/70">Approve 85+</span>
                          </div>
                          <span className="text-xs text-muted-foreground">100%</span>
                        </div>
                      </div>
                    )
                  })()}

                  {/* ── Main Pipeline Content ── */}
                  {selectedEntry.ai_status === 'timeout' ? (
                    <div className="rounded-xl border p-6 flex flex-col items-center gap-3 text-center bg-amber-50/50 dark:bg-amber-950/10">
                      <Timer className="w-8 h-8 text-amber-600" />
                      <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Analysis Timed Out</p>
                      <p className="text-xs text-muted-foreground">Pipeline exceeded the 25s soft limit. Entry flagged for manual review.</p>
                    </div>
                  ) : selectedEntry.ai_status === 'error' ? (
                    <div className="rounded-xl border p-6 flex flex-col items-center gap-3 text-center bg-red-50/50 dark:bg-red-950/10">
                      <XCircle className="w-8 h-8 text-red-600" />
                      <p className="text-sm font-medium text-red-700 dark:text-red-400">Analysis Error</p>
                      <p className="text-xs text-muted-foreground">AI pipeline failed. Please review manually.</p>
                    </div>
                  ) : selectedEntry.ai_chain_of_thought && Object.keys(selectedEntry.ai_chain_of_thought).length > 0 ? (() => {
                    const cot = selectedEntry.ai_chain_of_thought as Record<string, any>
                    const resolveNode = (key: string) => cot[key] ?? (key === 'final_decision' ? cot['final_reasoning'] : undefined)
                    const isStructured = (val: any): val is NodeResult => val && typeof val === 'object' && 'summary' in val && 'path' in val

                    /* ── Legacy string parser ── */
                    const parseLegacy = (key: string, raw: string) => {
                      let score: number | null = null
                      let path: string = 'logic'
                      const text = String(raw)
                      const scoreMatch = text.match(/Score:\s*(\d+\.?\d*)/i)
                      if (scoreMatch) { let s = parseFloat(scoreMatch[1]); if (s <= 1.0) s = Math.round(s * 100); score = Math.round(Math.min(s, 100)) }
                      if (score === null && key === 'progress_analysis') { const rm = text.match(/(?:Relevance|Progress|Confidence):\s*(\d+\.?\d*)/i); if (rm) { let s = parseFloat(rm[1]); score = s <= 1 ? Math.round(s * 100) : Math.round(Math.min(s, 100)) } }
                      if (key === 'final_decision') {
                        const cm = text.match(/Confidence:\s*(\d+\.?\d*)%/i); if (cm) score = Math.round(parseFloat(cm[1]))
                        const tm = text.match(/Time:\s*(\d+\.?\d*)%?/); const qm = text.match(/Quality:\s*(\d+\.?\d*)%?/); const rm2 = text.match(/Relevance:\s*(\d+\.?\d*)%?/)
                        if (tm && qm && rm2) {
                          const parsedScores = { time: Math.round(parseFloat(tm[1])), quality: Math.round(parseFloat(qm[1])), relevance: Math.round(parseFloat(rm2[1])) }
                          const wm = text.match(/T(\d+)%.*Q(\d+)%.*R(\d+)%/); const parsedWeights = wm ? { time: parseInt(wm[1]), quality: parseInt(wm[2]), relevance: parseInt(wm[3]) } : null
                          const bm = text.match(/Blocker\s*boost:\s*\+?(\d+\.?\d*)%?/i); const pm = text.match(/PENALTY:\s*-?(\d+\.?\d*)%/i); const dm = text.match(/Decision:\s*(\w+)/i)
                          return { score, path, finalData: { scores: parsedScores, weights: parsedWeights, blocker_boost: bm ? parseFloat(bm[1]) : 0, penalty: pm ? `Smart penalty: -${pm[1]}%` : '', reason: '', decision: dm ? dm[1].toLowerCase() : '' } }
                        }
                      }
                      if (/circuit\s*breaker|forced\s*logic|skipped\s*AI/i.test(text)) path = 'breaker'
                      else if (/\bLLM\b.*invok|AI\s*(?:score|analys|legitimacy)/i.test(text) && !/breaker|fallback/i.test(text)) path = 'ai'
                      return { score, path, finalData: null }
                    }

                    const NODE_DEFS = [
                      { key: 'context_analysis', label: 'Context Gatherer', shortLabel: 'Context', desc: 'Gathers all prior entries, copy-paste detection, progress coherence, blockers', icon: <Layers className="w-3.5 h-3.5" />, color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-100 dark:bg-slate-800/40', ring: 'ring-slate-300 dark:ring-slate-700', accent: 'border-l-slate-400' },
                      { key: 'time_analysis', label: 'Time Reasoner', shortLabel: 'Time', desc: 'LLM assesses if hours are reasonable given context, experience & blockers', icon: <Clock className="w-3.5 h-3.5" />, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/40', ring: 'ring-blue-300 dark:ring-blue-700', accent: 'border-l-blue-400' },
                      { key: 'content_analysis', label: 'Content Validator', shortLabel: 'Content', desc: 'LLM validates genuine learning/work, topic match, depth vs hours', icon: <FileSearch className="w-3.5 h-3.5" />, color: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-100 dark:bg-cyan-900/40', ring: 'ring-cyan-300 dark:ring-cyan-700', accent: 'border-l-cyan-400' },
                      { key: 'progress_analysis', label: 'Progress Analyzer', shortLabel: 'Progress', desc: 'LLM checks progress coherence, completion justification, pace', icon: <Target className="w-3.5 h-3.5" />, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/40', ring: 'ring-emerald-300 dark:ring-emerald-700', accent: 'border-l-emerald-400' },
                      { key: 'final_decision', label: 'Verdict Agent', shortLabel: 'Verdict', desc: 'LLM synthesizes all node findings into final connected decision', icon: <Scale className="w-3.5 h-3.5" />, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-100 dark:bg-rose-900/40', ring: 'ring-rose-300 dark:ring-rose-700', accent: 'border-l-rose-500' },
                    ]

                    const activeNodes = NODE_DEFS.filter(n => resolveNode(n.key)).map((n, idx) => {
                      const raw = resolveNode(n.key)
                      const s = isStructured(raw)
                      let score: number | null = null; let path: string | null = null; let legacyFinal: any = null; let pathReason: string | null = null; let llmResponse: string | null = null
                      if (s) { score = raw.score ?? null; path = raw.path; pathReason = (raw as any).path_reason || null; llmResponse = (raw as any).llm_raw_response || null }
                      else { const parsed = parseLegacy(n.key, String(raw)); score = parsed.score; path = parsed.path; legacyFinal = parsed.finalData }
                      const summary = s ? raw.summary : String(raw)
                      const details = s ? (typeof raw.details === 'string' ? raw.details : raw.details ? JSON.stringify(raw.details, null, 2) : null) : null
                      return { ...n, idx, raw, structured: s, score, path, summary, details, legacyFinal, pathReason, llmResponse }
                    })

                    const gradeFor = (score: number | null) => {
                      if (score === null) return { label: '—', color: 'text-muted-foreground', bg: 'bg-muted/50' }
                      if (score >= 90) return { label: 'A+', color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' }
                      if (score >= 80) return { label: 'A', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20' }
                      if (score >= 70) return { label: 'B', color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/30' }
                      if (score >= 50) return { label: 'C', color: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30' }
                      return { label: 'F', color: 'text-red-700 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30' }
                    }

                    const pathMeta = (p: string | null) => {
                      switch (p) {
                        case 'logic': return { label: 'Logic', icon: <ShieldCheck className="w-3 h-3" />, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-800', explain: 'Pure rules & math — no AI model called.' }
                        case 'ai': return { label: 'AI Model', icon: <Brain className="w-3 h-3" />, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-950/30', border: 'border-violet-200 dark:border-violet-800', explain: 'Ollama LLM (llama3.1) invoked for analysis.' }
                        case 'breaker': return { label: 'Breaker', icon: <Timer className="w-3 h-3" />, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800', explain: 'Circuit breaker triggered — AI too slow, fell back to logic.' }
                        case 'skipped': return { label: 'Skipped', icon: <Minus className="w-3 h-3" />, color: 'text-muted-foreground', bg: 'bg-muted/50', border: 'border-muted', explain: 'Node skipped — not applicable for this entry.' }
                        default: return null
                      }
                    }

                    const toggleNodeDash = (key: string) => {
                      setExpandedNodes(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next })
                    }

                    const passCount = activeNodes.filter(n => n.score !== null && n.score >= 50).length
                    const failCount = activeNodes.filter(n => n.score !== null && n.score < 50).length
                    const breakerCount = activeNodes.filter(n => n.path === 'breaker').length

                    return (
                      <div className="space-y-3">
                        {/* ═══ GRAPH SCORECARD ═══ */}
                        <div className="rounded-xl border overflow-hidden">
                          <div className="px-3 py-2.5 bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950/30 dark:to-indigo-950/30 border-b flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <TrendingUp className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                              <span className="text-xs font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">Examiner Scorecard</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              {passCount > 0 && <span className="text-emerald-600 font-semibold">{passCount} Passed</span>}
                              {failCount > 0 && <span className="text-red-600 font-semibold">{failCount} Failed</span>}
                              {breakerCount > 0 && <span className="text-amber-600 font-semibold">{breakerCount} Breaker</span>}
                            </div>
                          </div>
                          {/* Mini Flow Graph */}
                          <div className="px-4 py-3 bg-muted/10">
                            <div className="flex items-center justify-between">
                              {activeNodes.map((n, i) => {
                                const g = gradeFor(n.score)
                                const scoreColor = n.score === null ? 'border-muted bg-muted/30' :
                                  n.score >= 80 ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' :
                                    n.score >= 50 ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30' :
                                      'border-red-400 bg-red-50 dark:bg-red-950/30'
                                return (
                                  <React.Fragment key={n.key}>
                                    {i > 0 && (
                                      <div className="flex-1 flex items-center px-0.5">
                                        <div className="h-px flex-1 bg-border" />
                                        <ArrowRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                                      </div>
                                    )}
                                    <div className="flex flex-col items-center gap-1 min-w-0">
                                      <div className={cn("w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all", scoreColor)}>
                                        {n.score !== null ? (
                                          <span className={cn("text-xs font-bold tabular-nums", g.color)}>{n.score}</span>
                                        ) : (
                                          <span className={cn("", n.color)}>{n.icon}</span>
                                        )}
                                      </div>
                                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate max-w-[48px]">{n.shortLabel}</span>
                                      {n.score !== null && (
                                        <span className={cn("text-xs font-bold px-1 rounded", g.bg, g.color)}>{g.label}</span>
                                      )}
                                    </div>
                                  </React.Fragment>
                                )
                              })}
                            </div>
                          </div>
                        </div>

                        {/* ═══ DETAILED EXAMINER REPORT ═══ */}
                        <div className="rounded-xl border overflow-hidden bg-gradient-to-b from-slate-50/50 to-white dark:from-slate-900/50 dark:to-slate-950">
                          <div className="px-3 py-2 border-b bg-muted/20">
                            <div className="flex items-center gap-2">
                              <CircleDot className="w-3.5 h-3.5 text-indigo-500" />
                              <span className="text-xs font-bold uppercase tracking-wider text-foreground/80">Detailed Examiner Report</span>
                              <span className="text-xs text-muted-foreground ml-auto">Click to expand</span>
                            </div>
                          </div>

                          <div className="relative">
                            <div className="absolute left-[23px] top-4 bottom-4 w-px bg-gradient-to-b from-violet-300 via-indigo-300 to-rose-300 dark:from-violet-700 dark:via-indigo-700 dark:to-rose-700" />

                            {activeNodes.map((n) => {
                              const isExpanded = expandedNodes.has(n.key)
                              const isFinal = n.key === 'final_decision'
                              const pm = pathMeta(n.path)
                              const g = gradeFor(n.score)
                              const passed = n.score === null || n.score >= 50
                              const fd = isFinal ? (n.structured ? n.raw as FinalDecisionResult : null) : null
                              const lfd = isFinal ? n.legacyFinal : null

                              return (
                                <div key={n.key} className="relative pl-5 pr-3 py-2">
                                  <div className={cn(
                                    "absolute left-3 top-[18px] w-[21px] h-[21px] rounded-full border-2 flex items-center justify-center z-10",
                                    passed ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40" : "border-red-400 bg-red-50 dark:bg-red-950/40",
                                    n.score === null && "border-slate-300 bg-slate-50 dark:bg-slate-800 dark:border-slate-600"
                                  )}>
                                    <span className="text-xs font-bold tabular-nums text-muted-foreground">{n.idx}</span>
                                  </div>

                                  <div
                                    className={cn(
                                      "ml-5 rounded-lg border-l-[3px] border transition-all cursor-pointer select-none",
                                      n.accent, isExpanded ? "ring-1 shadow-sm bg-card" : "hover:bg-muted/20", isExpanded && n.ring,
                                    )}
                                    onClick={() => toggleNodeDash(n.key)}
                                  >
                                    <div className="flex items-center gap-2.5 p-2.5">
                                      <div className={cn("p-1 rounded-md shrink-0", n.bg)}>
                                        <span className={n.color}>{n.icon}</span>
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="text-xs font-bold text-foreground">{n.label}</span>
                                          {pm && <span className={cn("inline-flex items-center gap-0.5 px-1.5 py-0 rounded border text-xs font-semibold", pm.bg, pm.color, pm.border)}>{pm.icon}{pm.label}</span>}
                                          {n.score !== null && <span className={cn("px-1.5 py-0 rounded text-xs font-bold", g.bg, g.color)}>{n.score}% ({g.label})</span>}
                                        </div>
                                        {n.score !== null && (
                                          <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                            <div className={cn("h-full rounded-full transition-all duration-500",
                                              n.score >= 80 ? "bg-emerald-500" : n.score >= 50 ? "bg-amber-500" : "bg-red-500"
                                            )} style={{ width: `${Math.min(n.score, 100)}%` }} />
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        {passed ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <ShieldAlert className="w-3.5 h-3.5 text-red-500" />}
                                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                                      </div>
                                    </div>

                                    {isExpanded && (
                                      <div className="px-3 pb-3 space-y-2 border-t bg-muted/5">
                                        <div className="pt-2" />
                                        <p className="text-xs text-muted-foreground italic">{n.desc}</p>
                                        {pm && (
                                          <div className={cn("flex items-start gap-2 p-2 rounded-md border text-xs", pm.bg, pm.border)}>
                                            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                            <span>{n.pathReason || (<><strong>Path: {pm.label}</strong> — {pm.explain}</>)}</span>
                                          </div>
                                        )}

                                        {/* AI Chain of Thought — full LLM response like LangSmith */}
                                        {n.llmResponse && (
                                          <div className="p-2.5 rounded-md bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800/40">
                                            <p className="text-xs font-semibold text-violet-700 dark:text-violet-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                              <Brain className="w-3.5 h-3.5" />LLM Chain of Thought <span className="font-normal text-violet-500 dark:text-violet-500 ml-1">(llama3.1 raw response)</span>
                                            </p>
                                            <div className="p-2 rounded bg-violet-100/50 dark:bg-violet-900/30 border border-violet-200/60 dark:border-violet-800/30">
                                              <p className="text-xs leading-relaxed text-violet-900/90 dark:text-violet-200/90 whitespace-pre-wrap break-words font-mono" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                                {n.llmResponse}
                                              </p>
                                            </div>
                                          </div>
                                        )}

                                        <div className="p-2.5 rounded-md bg-card border">
                                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Examiner Notes</p>
                                          <p className="text-[12px] leading-relaxed text-foreground/80 break-words" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{n.summary}</p>
                                        </div>

                                        {isFinal && fd && fd.scores && (
                                          <div className="space-y-2">
                                            {fd.reason && (
                                              <div className="p-2 rounded-md bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/40">
                                                <p className="text-xs font-semibold text-rose-700 dark:text-rose-400 mb-0.5"><Lightbulb className="w-3 h-3 inline mr-1 -mt-0.5" />Why this decision</p>
                                                <p className="text-[12px] leading-relaxed text-rose-900/80 dark:text-rose-200/80 break-words" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{fd.reason}</p>
                                              </div>
                                            )}
                                            {fd.node_verdicts && (
                                              <div className="flex gap-2">
                                                {Object.entries(fd.node_verdicts).map(([k, v]) => {
                                                  const vLabel: Record<string, string> = { time: 'Time', content: 'Content', progress: 'Progress' }
                                                  const vColor = v === 'PASS' ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/20 dark:border-emerald-800' : v === 'FAIL' ? 'text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/20 dark:border-red-800' : 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/20 dark:border-amber-800'
                                                  return <div key={k} className={cn('px-2 py-0.5 rounded border text-xs font-semibold', vColor)}>{vLabel[k] || k}: {v}</div>
                                                })}
                                              </div>
                                            )}
                                            <div className="grid grid-cols-3 gap-2">
                                              {Object.entries(fd.scores).map(([dim, val]) => {
                                                const dimLabel: Record<string, string> = { time: 'Time', quality: 'Content', relevance: 'Progress' }
                                                const dg = gradeFor(val)
                                                return (
                                                  <div key={dim} className="p-2 rounded-lg border bg-card text-center space-y-0.5">
                                                    <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{dimLabel[dim] || dim}</p>
                                                    <p className={cn("text-base font-bold tabular-nums", dg.color)}>{val}%</p>
                                                    <div className="h-1 rounded-full bg-muted overflow-hidden"><div className={cn("h-full rounded-full", val >= 80 ? "bg-emerald-500" : val >= 50 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${Math.min(val, 100)}%` }} /></div>
                                                  </div>
                                                )
                                              })}
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                              {fd.penalty && fd.penalty !== 'none' && fd.penalty !== '' && <div className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 px-2 py-0.5 rounded border border-red-200 dark:border-red-800"><XCircle className="w-3 h-3" />{fd.penalty}</div>}
                                            </div>
                                          </div>
                                        )}

                                        {isFinal && !fd && lfd && lfd.scores && (
                                          <div className="space-y-2">
                                            <div className="grid grid-cols-3 gap-2">
                                              {Object.entries(lfd.scores as Record<string, number>).map(([dim, val]) => {
                                                const dimLabel: Record<string, string> = { time: 'Time', quality: 'Content', relevance: 'Progress' }
                                                const dg = gradeFor(val)
                                                return (
                                                  <div key={dim} className="p-2 rounded-lg border bg-card text-center space-y-0.5">
                                                    <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{dimLabel[dim] || dim}</p>
                                                    <p className={cn("text-base font-bold tabular-nums", dg.color)}>{val}%</p>
                                                    <div className="h-1 rounded-full bg-muted overflow-hidden"><div className={cn("h-full rounded-full", val >= 80 ? "bg-emerald-500" : val >= 50 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${Math.min(val, 100)}%` }} /></div>
                                                  </div>
                                                )
                                              })}
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                              {lfd.penalty && <div className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 px-2 py-0.5 rounded border border-red-200 dark:border-red-800"><XCircle className="w-3 h-3" />{lfd.penalty}</div>}
                                            </div>
                                          </div>
                                        )}

                                        {n.details && (
                                          <div className="p-2 rounded-md bg-muted/30 border">
                                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Full Details</p>
                                            <div className="text-xs leading-relaxed text-foreground/70 whitespace-pre-wrap break-words" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{n.details}</div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>

                          <div className="flex justify-center py-2 border-t bg-muted/5">
                            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-muted/50 border">
                              <CircleDot className="w-3 h-3 text-muted-foreground" />
                              <span className="text-xs font-medium text-muted-foreground">Pipeline Complete</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })() : selectedEntry.ai_status === 'pending' ? (
                    <div className="rounded-xl border p-6 flex flex-col items-center gap-3 text-center bg-indigo-50/50 dark:bg-indigo-950/10">
                      <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                      <p className="text-sm font-medium text-indigo-700 dark:text-indigo-400">Analyzing Entry...</p>
                      <p className="text-xs text-muted-foreground">Running through 5-node AI pipeline.</p>
                    </div>
                  ) : (
                    <div className="rounded-xl border p-6 flex flex-col items-center gap-3 text-center">
                      <Brain className="w-8 h-8 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Not analyzed yet.</p>
                    </div>
                  )}

                  {/* Override button */}
                  <div className="mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/50 font-medium"
                      onClick={() => handleOverride(selectedEntry)}
                    >
                      <Zap className="w-3.5 h-3.5 mr-1.5" />
                      Override Status
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-2xl border bg-card p-6 space-y-6 shadow-sm">
                  <h3 className="text-sm font-bold border-b pb-3 flex items-center gap-2">
                    <Clock className="h-4 w-4" /> Entry Metadata
                  </h3>
                  <div className="space-y-5">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Logged On</span>
                      <span className="font-bold">{selectedEntry.date}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Time Spent</span>
                      <span className="font-bold text-primary">{selectedEntry.hours} hours</span>
                    </div>
                    {(() => {
                      const entryTopic = topics.find(t => t.id === selectedEntry.topic)
                      return entryTopic ? (
                        <>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">Benchmark</span>
                            <span className="font-medium">{entryTopic.benchmark_hours}h expected</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">Difficulty</span>
                            <span className="font-medium">{'★'.repeat(entryTopic.difficulty)}{'☆'.repeat(5 - entryTopic.difficulty)}</span>
                          </div>
                        </>
                      ) : null
                    })()}
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Intent</span>
                      <Badge variant="outline" className="text-xs">{selectedEntry.intent?.replace('_', ' ') || '—'}</Badge>
                    </div>
                    <div className="border-t pt-3 flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full font-bold text-xs">
                        {(() => {
                          const entryTopic = topics.find(t => t.id === selectedEntry.topic)
                          if (entryTopic?.parent_id) {
                            const parentTopic = topics.find(t => t.id === entryTopic.parent_id)
                            if (parentTopic) {
                              const childTopics = topics.filter(t => t.parent_id === parentTopic.id)
                              if (childTopics.length > 0) {
                                const totalProgress = childTopics.reduce((sum, child) => {
                                  const childEntries = entries.filter(e => e.topic === child.id && e.user === selectedEntry.user)
                                  const maxP = childEntries.length > 0 ? Math.max(...childEntries.map(e => Number(e.progress_percent) || 0)) : 0
                                  return sum + maxP
                                }, 0)
                                return Math.round(totalProgress / childTopics.length)
                              }
                            }
                          }
                          return Math.round(Number(selectedEntry.progress_percent) || 0)
                        })()}%
                      </span>
                    </div>
                    {selectedEntry.is_completed && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Completed</span>
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      </div>
                    )}
                    {(() => {
                      const entryTopic = topics.find(t => t.id === selectedEntry.topic)
                      return entryTopic && selectedEntry.hours > 0 ? (
                        <div className="border-t pt-3 text-xs text-muted-foreground space-y-1">
                          <p className="font-semibold text-foreground text-xs">Time vs Benchmark</p>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                              <div className={cn("h-full rounded-full",
                                selectedEntry.hours <= entryTopic.benchmark_hours * 1.2 ? "bg-emerald-500" :
                                  selectedEntry.hours <= entryTopic.benchmark_hours * 1.5 ? "bg-amber-500" : "bg-red-500"
                              )} style={{ width: `${Math.min((selectedEntry.hours / entryTopic.benchmark_hours) * 100, 100)}%` }} />
                            </div>
                            <span className="tabular-nums font-medium">{((selectedEntry.hours / entryTopic.benchmark_hours) * 100).toFixed(0)}%</span>
                          </div>
                          <p className="text-xs">{selectedEntry.hours}h of {entryTopic.benchmark_hours}h benchmark</p>
                        </div>
                      ) : null
                    })()}
                    <div className="flex justify-between items-center text-sm pt-2 border-t font-bold">
                      <span className="text-muted-foreground">Status</span>
                      <Badge variant={selectedEntry.status === 'flagged' || selectedEntry.status === 'rejected' ? 'destructive' : 'outline'} className="rounded-sm text-xs px-1.5 uppercase">
                        {selectedEntry.status}
                      </Badge>
                    </div>
                  </div>
                </div>

                {selectedEntry.admin_override && (
                  <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                    <div className="flex items-start gap-2">
                      <Zap className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <p className="text-xs font-semibold text-blue-900 dark:text-blue-100">
                          Admin Override
                        </p>
                        {selectedEntry.admin && (
                          <p className="text-xs text-blue-700 dark:text-blue-300">
                            By: {selectedEntry.admin.full_name || selectedEntry.admin.email}
                          </p>
                        )}
                        {selectedEntry.override_at && (
                          <p className="text-xs text-blue-600 dark:text-blue-400">
                            {new Date(selectedEntry.override_at).toLocaleString()}
                          </p>
                        )}
                        {selectedEntry.override_reason && (
                          <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                            <span className="font-medium">Reason:</span> {selectedEntry.override_reason.replace(/_/g, ' ')}
                          </p>
                        )}
                        {selectedEntry.override_comment && (
                          <p className="text-xs text-blue-700 dark:text-blue-300 italic">
                            "{selectedEntry.override_comment}"
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ═══ BRAIN WORKFLOW — How AI Decides ═══ */}
                <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
                  <div className="px-4 py-3 bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950/30 dark:to-indigo-950/30 border-b">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded-md bg-gradient-to-br from-violet-500 to-indigo-600">
                        <Brain className="w-3 h-3 text-white" />
                      </div>
                      <span className="text-xs font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">How AI Decides</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">5-Node v6.0 Dual Pipeline — Every entry passes through this</p>
                  </div>
                  <div className="p-3 space-y-2.5">
                    {/* Detailed pipeline nodes */}
                    {[
                      {
                        num: 0, label: 'Context Gatherer', mode: 'logic' as const,
                        what: 'Researches the learner before AI analysis begins',
                        checks: ['Prior entries on this topic/project', 'Copy-paste detection (Jaccard + sequence similarity)', 'Progress % coherence check', 'Blocker parsing & categorization', 'Pace analysis & total hours invested'],
                      },
                      {
                        num: 1, label: 'Time Reasoner', mode: 'ai' as const,
                        what: 'LLM assesses if hours are reasonable with full context',
                        checks: ['Hours vs difficulty, experience, and benchmark', 'Description depth vs claimed hours', 'Blocker impact on time justification', 'First entry leniency, history comparison'],
                      },
                      {
                        num: 2, label: 'Content Validator', mode: 'ai' as const,
                        what: 'LLM evaluates genuine learning/work & topic match',
                        checks: ['Does description actually match the topic?', 'Genuine understanding vs vague fluff?', 'New content vs repeat of prior entries?', 'Global Wisdom: learns from admin corrections', 'Copy-paste penalty after AI scoring'],
                      },
                      {
                        num: 3, label: 'Progress Analyzer', mode: 'ai' as const,
                        what: 'LLM checks completion claims & progress coherence',
                        checks: ['Is claimed progress % realistic for hours invested?', 'Completion justified? Enough ground covered?', 'Progress timeline: steady or suspicious jumps?', 'Pace analysis: hours per % progress'],
                      },
                      {
                        num: 4, label: 'Verdict Agent', mode: 'ai' as const,
                        what: 'LLM synthesizes ALL node findings into final decision',
                        checks: ['Sees all node verdicts + reasoning chains', 'Makes connected APPROVE/FLAG/PENDING decision', 'Copy-paste override: never auto-approve', 'Fallback penalty: prefer FLAG over APPROVE'],
                      },
                    ].map((node) => (
                      <div key={node.num} className={cn(
                        "p-2 rounded-lg border",
                        node.mode === 'ai' ? "bg-violet-50/50 dark:bg-violet-950/10 border-violet-200 dark:border-violet-800/40" :
                          "bg-slate-50/50 dark:bg-slate-800/20 border-slate-200 dark:border-slate-700/40"
                      )}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <div className={cn(
                            "w-4 h-4 rounded-full border flex items-center justify-center text-xs font-bold shrink-0",
                            node.mode === 'ai' ? "border-violet-400 bg-violet-100 dark:bg-violet-900/40 text-violet-600" :
                              "border-slate-300 bg-slate-100 dark:bg-slate-800 text-slate-500"
                          )}>{node.num}</div>
                          <span className="text-xs font-bold text-foreground">{node.label}</span>
                          {node.mode === 'ai' && <span className="text-xs px-1 rounded bg-violet-200 dark:bg-violet-800/40 text-violet-700 dark:text-violet-300 font-bold">AI</span>}
                        </div>
                        <p className="text-xs text-muted-foreground italic mb-1">{node.what}</p>
                        <div className="space-y-0.5">
                          {node.checks.map((c, ci) => (
                            <div key={ci} className="flex items-start gap-1">
                              <span className="text-xs text-muted-foreground mt-0.5">•</span>
                              <span className="text-xs text-foreground/70 leading-tight">{c}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}

                    {/* Decision tiers */}
                    <div className="border-t pt-2 space-y-1">
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Decision Tiers</p>
                      <div className="flex gap-1.5">
                        <div className="flex-1 p-1.5 rounded bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-center">
                          <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">APPROVE</p>
                          <p className="text-xs text-emerald-600 dark:text-emerald-500 font-semibold">All PASS</p>
                        </div>
                        <div className="flex-1 p-1.5 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-center">
                          <p className="text-xs font-bold text-amber-700 dark:text-amber-400">FLAG</p>
                          <p className="text-xs text-amber-600 dark:text-amber-500 font-semibold">Mixed</p>
                        </div>
                        <div className="flex-1 p-1.5 rounded bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-center">
                          <p className="text-xs font-bold text-red-700 dark:text-red-400">PENDING</p>
                          <p className="text-xs text-red-600 dark:text-red-500 font-semibold">Concerns</p>
                        </div>
                      </div>
                    </div>

                    {/* Safety nets */}
                    <div className="border-t pt-2 space-y-1">
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Safety Nets</p>
                      <div className="space-y-0.5">
                        {[
                          { icon: <Timer className="w-2.5 h-2.5 text-amber-500" />, text: 'Circuit breaker: 15s per node, 55s pipeline guard' },
                          { icon: <ShieldCheck className="w-2.5 h-2.5 text-emerald-500" />, text: 'Logic fallback if LLM fails — never auto-approve' },
                          { icon: <Brain className="w-2.5 h-2.5 text-violet-500" />, text: 'Global Wisdom: AI learns from admin corrections' },
                          { icon: <Eye className="w-2.5 h-2.5 text-blue-500" />, text: 'Full LLM chain-of-thought stored for traceability' },
                        ].map((item, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-xs">
                            {item.icon}
                            <span className="text-foreground/70">{item.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <Button className="w-full h-12 rounded-xl text-sm font-bold shadow-lg" onClick={goBack}>
                  RETURN TO LIST
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Project Entries Section */}
      <AdminProjectsSection projects={projects} entries={entries} users={users} topics={topics} />

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Button variant="outline" className="h-auto flex-col gap-2 p-4 bg-transparent" asChild>
              <Link to="/admin/entries">
                <FileText className="h-5 w-5" />
                <span>Review Entries</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col gap-2 p-4 bg-transparent" asChild>
              <Link to="/admin/users">
                <Users className="h-5 w-5" />
                <span>Manage Users</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col gap-2 p-4 bg-transparent" asChild>
              <Link to="/admin/topics">
                <BookOpen className="h-5 w-5" />
                <span>Manage Topics</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col gap-2 p-4 bg-transparent" asChild>
              <Link to="/admin/leave">
                <Calendar className="h-5 w-5" />
                <span>Leave Requests</span>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  )
}

function AdminProjectsSection({
  projects,
  entries,
  users,
  topics,
}: {
  projects: Project[]
  entries: Entry[]
  users: User[]
  topics: Topic[]
}) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>('all')
  const [page, setPage] = useState(1)
  const pageSize = 10

  // Drill-down state: 0 = list, 1 = project entries, 2 = entry detail
  const [drillLevel, setDrillLevel] = useState(0)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null)
  const [overrideModalOpen, setOverrideModalOpen] = useState(false)

  // Entry list filters
  const [entryStatusFilter, setEntryStatusFilter] = useState<'all' | 'approved' | 'flagged' | 'pending'>('all')
  const [entrySearch, setEntrySearch] = useState('')
  const [entryPage, setEntryPage] = useState(1)
  const entryPageSize = 20

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.description?.toLowerCase().includes(search.toLowerCase())) return false
      // if (userFilter !== 'all' && String(p.user) !== userFilter) return false
      if (statusFilter === 'active' && p.is_completed) return false
      if (statusFilter === 'completed' && !p.is_completed) return false
      return true
    })
  }, [projects, search, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / pageSize))
  const paginatedProjects = filteredProjects.slice((page - 1) * pageSize, page * pageSize)

  // Get unique users who have projects - removed as filter is gone

  // Entries for the selected project
  const projectEntries = useMemo(() => {
    if (!selectedProject) return []
    let results = entries.filter(e => e.project === selectedProject.id)
    if (entryStatusFilter !== 'all') {
      if (entryStatusFilter === 'flagged') {
        results = results.filter(e => e.status === 'flagged' || e.status === 'rejected')
      } else {
        results = results.filter(e => e.status === entryStatusFilter)
      }
    }
    if (entrySearch) {
      const q = entrySearch.toLowerCase()
      results = results.filter(e => {
        const u = users.find(u => u.id === e.user)
        return u?.name.toLowerCase().includes(q) || e.learned_text?.toLowerCase().includes(q) || e.date.includes(q)
      })
    }
    results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    return results
  }, [selectedProject, entries, entryStatusFilter, entrySearch, users])

  const entryTotalPages = Math.max(1, Math.ceil(projectEntries.length / entryPageSize))
  const paginatedEntries = projectEntries.slice((entryPage - 1) * entryPageSize, entryPage * entryPageSize)

  const openProject = (project: Project) => {
    setSelectedProject(project)
    setEntryStatusFilter('all')
    setEntrySearch('')
    setEntryPage(1)
    setDrillLevel(1)
  }

  const openEntryDetail = (entry: Entry) => {
    setSelectedEntry(entry)
    setDrillLevel(2)
  }

  const goBack = () => {
    if (drillLevel === 2) { setDrillLevel(1); setSelectedEntry(null) }
    else if (drillLevel === 1) { setDrillLevel(0); setSelectedProject(null) }
  }

  const getTopicPath = (topicId: number | null): string => {
    if (!topicId) return '—'
    const topic = topics.find(t => t.id === topicId)
    if (!topic) return 'Unknown'
    if (!topic.parent_id) return topic.name
    return `${getTopicPath(topic.parent_id)} > ${topic.name}`
  }



  return (
    <>
      <OverrideModal
        entry={overrideModalOpen ? selectedEntry : null}
        open={overrideModalOpen}
        onClose={() => { setOverrideModalOpen(false); if (drillLevel !== 2) setSelectedEntry(null) }}
      />

      <Card className="shadow-md">
        <CardHeader className="border-b pb-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {drillLevel > 0 && (
                <Button variant="ghost" size="icon" onClick={goBack} className="h-9 w-9">
                  <ChevronLeft className="h-5 w-5" />
                </Button>
              )}
              <div>
                <CardTitle className="text-xl">
                  {drillLevel === 0 && 'Project Entries'}
                  {drillLevel === 1 && `${selectedProject?.name} — Entries`}
                  {drillLevel === 2 && `Entry Details (#${selectedEntry?.id})`}
                </CardTitle>
                <CardDescription>
                  {drillLevel === 0 && 'All projects across learners'}
                  {drillLevel === 1 && `${projectEntries.length} entries by ${users.find(u => u.id === selectedProject?.user)?.name || 'Unknown'}`}
                  {drillLevel === 2 && `Detailed view for entry by ${users.find(u => u.id === selectedEntry?.user)?.name}`}
                </CardDescription>
              </div>
            </div>
            {drillLevel === 0 && (
              <Badge variant="outline" className="text-xs">
                {filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {/* ═══ LEVEL 0: Project list ═══ */}
          {drillLevel === 0 && (
            <>
              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search projects..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                    className="pl-9"
                  />
                </div>
                {/* User filter removed */}
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as any); setPage(1) }}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Table */}
              {paginatedProjects.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <FileText className="h-10 w-10 text-muted-foreground/30 mb-2" />
                  <p className="text-muted-foreground text-sm">No projects found.</p>
                </div>
              ) : (
                <>
                  <div className="rounded-lg border overflow-hidden shadow-sm">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow>
                          <TableHead className="py-3 h-11 text-xs uppercase font-bold">Project</TableHead>
                          <TableHead className="py-3 h-11 text-xs uppercase font-bold">Learner</TableHead>
                          <TableHead className="py-3 h-11 text-xs uppercase font-bold text-center">Entries</TableHead>
                          <TableHead className="py-3 h-11 text-xs uppercase font-bold text-center">Latest</TableHead>
                          <TableHead className="py-3 h-11 text-xs uppercase font-bold text-center">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedProjects.map((project) => {
                          const owner = users.find((u) => u.id === project.user)
                          const projectFlagged = entries.filter(e => e.project === project.id && (e.status === 'flagged' || e.status === 'rejected')).length
                          return (
                            <TableRow
                              key={project.id}
                              className="cursor-pointer hover:bg-muted/30 transition-colors group"
                              onClick={() => openProject(project)}
                            >
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-primary text-sm group-hover:underline">{project.name}</span>
                                  {projectFlagged > 0 && (
                                    <Badge variant="destructive" className="h-5 px-1.5 text-xs font-bold">
                                      {projectFlagged} FLAGGED
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">
                                {owner?.name || project.user_email || `User ${project.user}`}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline" className="font-mono text-xs">
                                  {project.entry_count}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center text-sm text-muted-foreground">
                                {project.latest_date || '—'}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge
                                  className={cn(
                                    'text-xs font-bold uppercase',
                                    project.is_completed
                                      ? 'bg-success text-white'
                                      : 'bg-blue-500/20 text-blue-700 border-blue-500/30'
                                  )}
                                >
                                  {project.is_completed ? 'Completed' : 'Active'}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-2">
                      <p className="text-xs text-muted-foreground">
                        Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredProjects.length)} of {filteredProjects.length}
                      </p>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline" size="icon" className="h-7 w-7"
                          disabled={page <= 1}
                          onClick={() => setPage(page - 1)}
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>
                        <span className="text-xs px-2">Page {page} of {totalPages}</span>
                        <Button
                          variant="outline" size="icon" className="h-7 w-7"
                          disabled={page >= totalPages}
                          onClick={() => setPage(page + 1)}
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ═══ LEVEL 1: Project's Entries ═══ */}
          {drillLevel === 1 && selectedProject && (
            <>
              {/* Project summary bar */}
              <div className="p-3 rounded-lg border bg-muted/20 flex flex-wrap items-center gap-4 text-sm">
                <span className="font-semibold">{selectedProject.name}</span>
                {selectedProject.description && <span className="text-muted-foreground text-xs italic">"{selectedProject.description}"</span>}
                <Badge className={cn('text-xs font-bold uppercase', selectedProject.is_completed ? 'bg-success text-white' : 'bg-blue-500/20 text-blue-700 border-blue-500/30')}>
                  {selectedProject.is_completed ? 'Completed' : 'Active'}
                </Badge>
              </div>

              {/* Entry filters */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search entries..."
                    value={entrySearch}
                    onChange={(e) => { setEntrySearch(e.target.value); setEntryPage(1) }}
                    className="pl-9 h-9"
                  />
                </div>
                <Select value={entryStatusFilter} onValueChange={(v) => { setEntryStatusFilter(v as any); setEntryPage(1) }}>
                  <SelectTrigger className="w-[150px] h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="flagged">Flagged</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Entries table */}
              <div className="rounded-lg border overflow-hidden shadow-sm">
                <Table>
                  <TableHeader className="bg-muted/40 font-bold">
                    <TableRow>
                      <TableHead className="py-3 h-11 text-xs uppercase font-bold">Entry #</TableHead>
                      <TableHead className="py-3 h-11 text-xs uppercase font-bold">User</TableHead>
                      <TableHead className="py-3 h-11 text-xs uppercase font-bold">Date</TableHead>
                      <TableHead className="py-3 h-11 text-xs uppercase font-bold text-center">Hours</TableHead>
                      <TableHead className="py-3 h-11 text-xs uppercase font-bold text-center">AI Decision</TableHead>
                      <TableHead className="py-3 h-11 text-xs uppercase font-bold text-center">Confidence</TableHead>
                      <TableHead className="py-3 h-11 text-xs uppercase font-bold text-center">Status</TableHead>
                      <TableHead className="py-3 h-11 text-xs uppercase font-bold text-center">Progress</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedEntries.map((entry) => {
                      const entryUser = users.find(u => u.id === entry.user)
                      return (
                        <TableRow
                          key={entry.id}
                          className="cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => openEntryDetail(entry)}
                        >
                          <TableCell className="font-mono text-xs font-semibold text-primary">#{entry.id}</TableCell>
                          <TableCell className="font-medium text-sm">{entryUser?.name || 'Unknown'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{entry.date}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="font-mono text-xs">{entry.hours}h</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            {entry.ai_decision ? (
                              <Badge className={cn(
                                'text-xs font-bold uppercase',
                                entry.ai_decision === 'approve' && 'bg-emerald-500/15 text-emerald-700',
                                entry.ai_decision === 'flag' && 'bg-red-500/15 text-red-700',
                                entry.ai_decision === 'pending' && 'bg-amber-500/15 text-amber-700',
                              )}>
                                {entry.ai_decision}
                              </Badge>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            {entry.ai_confidence != null ? (
                              <span className={cn(
                                'text-xs font-bold tabular-nums',
                                Number(entry.ai_confidence) >= 85 ? 'text-emerald-600' : Number(entry.ai_confidence) >= 70 ? 'text-amber-600' : 'text-red-600'
                              )}>
                                {Number(entry.ai_confidence).toFixed(1)}%
                              </span>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            {(() => {
                              if (entry.status === 'approved') return <Badge className="text-xs font-bold uppercase bg-success">Approved</Badge>
                              if (entry.status === 'flagged' || entry.status === 'rejected') return <Badge variant="destructive" className="text-xs font-bold uppercase">Flagged</Badge>
                              if (entry.status === 'pending' && entry.ai_status === 'analyzed') return <Badge className="text-xs font-bold uppercase bg-orange-500/15 text-orange-700 border border-orange-500/30">Needs Review</Badge>
                              if (entry.status === 'pending' && entry.ai_status === 'error') return <Badge variant="destructive" className="text-xs font-bold uppercase bg-red-500/15 text-red-700 border border-red-500/30">Error</Badge>
                              return <Badge variant="secondary" className="text-xs font-bold uppercase bg-muted text-muted-foreground">Processing</Badge>
                            })()}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="font-mono bg-muted/20">
                              {Math.round(Number(entry.progress_percent) || 0)}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
                {paginatedEntries.length === 0 && (
                  <div className="p-12 text-center text-muted-foreground">No entries found for this project.</div>
                )}
              </div>

              {/* Pagination */}
              {entryTotalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-muted-foreground">
                    Showing {(entryPage - 1) * entryPageSize + 1}–{Math.min(entryPage * entryPageSize, projectEntries.length)} of {projectEntries.length}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-7 w-7" disabled={entryPage <= 1} onClick={() => setEntryPage(entryPage - 1)}>
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-xs px-2">Page {entryPage} of {entryTotalPages}</span>
                    <Button variant="outline" size="icon" className="h-7 w-7" disabled={entryPage >= entryTotalPages} onClick={() => setEntryPage(entryPage + 1)}>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ═══ LEVEL 2: Entry Detail (same as topic drill-down) ═══ */}
          {drillLevel === 2 && selectedEntry && (
            <EntryDetailView
              entry={selectedEntry}
              onBack={goBack}
              backLabel="Back to Project Entries"
            />
          )}
        </CardContent>
      </Card>
    </>
  )
}

function LearnerDashboard({
  stats,
  user,
  entries,
  topics,
  plans,
  assignments,
}: {
  stats: any
  user: User | null
  entries: Entry[]
  topics: Topic[]
  plans: TrainingPlan[]
  assignments: PlanAssignment[]
}) {
  const [activeFilter, setActiveFilter] = useState<'all' | 'approved' | 'analyzing' | 'flagged'>('all')
  const [entriesPage, setEntriesPage] = useState(1)
  const entriesPageSize = 10

  // Get user's entries
  const userEntries = entries.filter((e) => e.user === user?.id)

  // Filter entries based on active card filter
  const displayEntries = useMemo(() => {
    let filtered = [...userEntries]
    if (activeFilter === 'approved') filtered = filtered.filter(e => e.status === 'approved')
    else if (activeFilter === 'analyzing') filtered = filtered.filter(e => e.status === 'pending')
    else if (activeFilter === 'flagged') filtered = filtered.filter(e => e.status === 'flagged' || e.status === 'rejected')
    return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [userEntries, activeFilter])

  // Paginated entries
  const totalEntriesPages = Math.max(1, Math.ceil(displayEntries.length / entriesPageSize))
  const entriesToShow = displayEntries.slice((entriesPage - 1) * entriesPageSize, entriesPage * entriesPageSize)

  // Reset page on filter change
  useEffect(() => { setEntriesPage(1) }, [activeFilter])

  const toggleFilter = (filter: 'approved' | 'analyzing' | 'flagged') => {
    setActiveFilter(prev => prev === filter ? 'all' : filter)
  }

  // Get user's training plan
  const userPlan = plans.find((plan) =>
    assignments.some((a) => a.plan === plan.id)
  )

  return (
    <>
      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <Card
          className={cn("hover:bg-muted/50 transition-colors cursor-pointer h-full",
            activeFilter === 'approved' && 'ring-2 ring-success bg-success/5')}
          onClick={() => toggleFilter('approved')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">{stats.approved}</div>
            <p className="text-xs text-muted-foreground">Entries approved</p>
          </CardContent>
        </Card>

        <Card
          className={cn("hover:bg-muted/50 transition-colors cursor-pointer h-full",
            activeFilter === 'analyzing' && 'ring-2 ring-amber-500 bg-amber-500/5')}
          onClick={() => toggleFilter('analyzing')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Analyzing</CardTitle>
            <Loader2 className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500">{stats.analyzing}</div>
            <p className="text-xs text-muted-foreground">AI processing</p>
          </CardContent>
        </Card>

        <Card
          className={cn("hover:bg-muted/50 transition-colors cursor-pointer h-full",
            activeFilter === 'flagged' && 'ring-2 ring-destructive bg-destructive/5')}
          onClick={() => toggleFilter('flagged')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Flagged</CardTitle>
            <Flag className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.flagged}</div>
            <p className="text-xs text-muted-foreground">Needs review</p>
          </CardContent>
        </Card>

        <Card
          className="hover:bg-muted/50 transition-colors cursor-pointer h-full"
          onClick={() => setActiveFilter('all')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Entries</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalEntries}</div>
            <div className="flex items-center gap-3 mt-1">
              <span className="flex items-center gap-1 text-xs text-success">
                <CheckCircle2 className="h-3 w-3" /> {stats.approved}
              </span>
              <span className="flex items-center gap-1 text-xs text-amber-500">
                <Loader2 className="h-3 w-3" /> {stats.analyzing}
              </span>
              <span className="flex items-center gap-1 text-xs text-destructive">
                <Flag className="h-3 w-3" /> {stats.flagged}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Hours</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Number(stats.totalHours || 0).toFixed(1)}h</div>
            <p className="text-xs text-muted-foreground">Hours logged this month</p>
          </CardContent>
        </Card>
      </div>

      {/* Entries Table - Full Width */}
      <Card className="shadow-md">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-6">
          <div>
            <CardTitle className="text-xl">
              {activeFilter === 'approved' && 'Approved Entries'}
              {activeFilter === 'analyzing' && 'Analyzing Entries'}
              {activeFilter === 'flagged' && 'Flagged Entries'}
              {activeFilter === 'all' && 'All Entries'}
            </CardTitle>
            <CardDescription>
              {activeFilter === 'approved' && 'Entries approved by AI or admin'}
              {activeFilter === 'analyzing' && 'Entries being processed by AI'}
              {activeFilter === 'flagged' && 'Entries flagged for review'}
              {activeFilter === 'all' && 'Your learning activity log'}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {activeFilter !== 'all' && (
              <Button variant="ghost" size="sm" onClick={() => setActiveFilter('all')}>
                Clear Filter
              </Button>
            )}
            <Button variant="outline" size="sm" asChild>
              <Link to="/calendar">
                View Calendar
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {entriesToShow.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground text-sm font-medium">
                {activeFilter !== 'all'
                  ? `No ${activeFilter} entries found.`
                  : 'No entries yet. Start logging your learning!'}
              </p>
              {activeFilter === 'all' && (
                <Button className="mt-4" size="sm" asChild>
                  <Link to="/calendar">Go to Calendar</Link>
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="rounded-lg border overflow-hidden shadow-sm">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead className="py-3 h-11 text-xs uppercase font-bold">Topic / Project</TableHead>
                      <TableHead className="py-3 h-11 text-xs uppercase font-bold">Date</TableHead>
                      <TableHead className="py-3 h-11 text-xs uppercase font-bold text-center">Hours</TableHead>
                      <TableHead className="py-3 h-11 text-xs uppercase font-bold text-center">Status</TableHead>
                      <TableHead className="py-3 h-11 text-xs uppercase font-bold text-right">Progress</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entriesToShow.map((entry) => {
                      const topic = topics.find((t) => t.id === entry.topic)
                      const displayStatus = entry.status === 'pending' ? 'analyzing' : entry.status
                      const isProject = entry.intent === 'sbu_tasks'

                      return (
                        <TableRow key={entry.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="font-medium text-sm">
                            {isProject ? (
                              <span className="text-primary font-semibold flex items-center gap-1">
                                <span className="text-xs">🛠️</span>
                                {entry.project_name || 'Project'}
                              </span>
                            ) : (
                              <span className="text-primary font-semibold">{topic?.name || 'Unknown'}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{entry.date}</TableCell>
                          <TableCell className="text-center font-mono text-sm">{entry.hours}h</TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={
                                entry.status === 'approved' ? 'default'
                                  : entry.status === 'flagged' ? 'destructive'
                                    : 'secondary'
                              }
                              className={cn(
                                'text-xs font-bold uppercase',
                                entry.status === 'approved' && 'bg-success',
                                entry.status === 'pending' && 'bg-amber-500/20 text-amber-700 border-amber-500/30'
                              )}
                            >
                              {displayStatus}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline" className="font-mono bg-muted/20">
                              {Math.round(Number(entry.progress_percent) || 0)}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              {/* Pagination */}
              {totalEntriesPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-xs text-muted-foreground">
                    Showing {(entriesPage - 1) * entriesPageSize + 1}–{Math.min(entriesPage * entriesPageSize, displayEntries.length)} of {displayEntries.length}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline" size="icon" className="h-7 w-7"
                      disabled={entriesPage <= 1}
                      onClick={() => setEntriesPage(entriesPage - 1)}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-xs px-2">Page {entriesPage} of {totalEntriesPages}</span>
                    <Button
                      variant="outline" size="icon" className="h-7 w-7"
                      disabled={entriesPage >= totalEntriesPages}
                      onClick={() => setEntriesPage(entriesPage + 1)}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Training Plan Progress */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Training Plan</CardTitle>
              <CardDescription>
                {userPlan ? userPlan.plan_name : 'No plan assigned'}
              </CardDescription>
            </div>
            {userPlan && (
              <Button variant="outline" size="sm" asChild>
                <Link to="/training-plan">
                  View Details
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {userPlan ? (
              <div className="space-y-4">
                {userPlan.plan_topics.slice(0, 4).map((pt) => {
                  const topic = topics.find((t) => t.id === pt.topic_id)
                  const userHours = entries
                    .filter((e) => e.user === user?.id && e.topic === pt.topic_id && e.status === 'approved')
                    .reduce((sum, e) => sum + Number(e.hours || 0), 0)
                  const progress = Math.min(100, (userHours / pt.expected_hours) * 100)

                  return (
                    <div key={pt.id} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{topic?.name}</span>
                        <span className="text-muted-foreground">
                          {userHours.toFixed(1)}h / {pt.expected_hours}h
                        </span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>
                  )
                })}
                {userPlan.plan_topics.length > 4 && (
                  <p className="text-sm text-muted-foreground text-center">
                    +{userPlan.plan_topics.length - 4} more topics
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  No training plan assigned yet. Contact your admin.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Button variant="outline" className="h-auto flex-col gap-2 p-4 bg-transparent" asChild>
              <Link to="/calendar">
                <Calendar className="h-5 w-5" />
                <span>Log Entry</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col gap-2 p-4 bg-transparent" asChild>
              <Link to="/projects">
                <Layers className="h-5 w-5" />
                <span>My Projects</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col gap-2 p-4 bg-transparent" asChild>
              <Link to="/training-plan">
                <TrendingUp className="h-5 w-5" />
                <span>View Progress</span>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
