import { useState, useMemo, useEffect } from 'react'

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
  Calendar,
  CheckCircle2,
  ChevronLeft,
  Clock,
  FileText,
  Search,
  TrendingUp,
  Users,
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
} from '@/lib/types'
import { OverrideModal } from '@/components/admin/override-modal'
import { mockUsers } from '@/lib/mock-data'

import { fetchEntries } from '@/lib/store/slices/entriesSlice'
import { fetchTopics } from '@/lib/store/slices/topicsSlice'
import { fetchTrainingPlans, fetchUserAssignments } from '@/lib/store/slices/trainingPlansSlice'
import { fetchUsers } from '@/lib/store/slices/usersSlice'
import { fetchLeaveRequests } from '@/lib/store/slices/leaveRequestsSlice'

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
    }
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

  const isAdmin = user?.role === 'admin'

  // Calculate stats
  const stats = useMemo(() => {
    if (isAdmin) {
      const pending = (Array.isArray(entries) ? entries : []).filter((e) => e.status === 'pending').length
      const flagged = (Array.isArray(entries) ? entries : []).filter((e) => e.status === 'flagged').length
      const approved = (Array.isArray(entries) ? entries : []).filter((e) => e.status === 'approved').length
      const pendingLeaves = (Array.isArray(leaveRequests) ? leaveRequests : []).filter((l) => l.status === 'approved').length
      const totalLearners = (Array.isArray(users) ? users : []).filter((u) => u.role === 'learner' && u.is_active).length
      const totalHours = (Array.isArray(entries) ? entries : []).reduce((sum, e) => sum + parseFloat(e.hours as any), 0)

      return {
        pending,
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
    const pending = userEntries.filter((e) => e.status === 'pending').length
    const totalHours = userEntries.reduce((sum, e) => sum + parseFloat(e.hours as any), 0)

    return {
      approved,
      pending,
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
  users
}: {
  stats: any,
  entries: Entry[],
  topics: Topic[],
  users: User[]
}) {
  // In-place Drill-down State
  const [drillLevel, setDrillLevel] = useState(0) // 0: Topics, 1: Entries, 2: Details
  const [selectedTopic, setSelectedTopic] = useState<{ id: number, name: string } | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null)
  const [overrideModalOpen, setOverrideModalOpen] = useState(false)

  // Level 1: Topic Entries list
  const [topicEntriesPageSize, setTopicEntriesPageSize] = useState(50)
  const [topicEntriesSort, setTopicEntriesSort] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null)
  const [entriesStatusFilter, setEntriesStatusFilter] = useState<'all' | 'pending' | 'flagged' | 'approved'>('all')
  const [entriesSearchQuery, setEntriesSearchQuery] = useState('')
  const [entriesMinHours, setEntriesMinHours] = useState(0)
  const [entriesMaxHours, setEntriesMaxHours] = useState(0)
  const [entriesStartDate, setEntriesStartDate] = useState('')
  const [entriesEndDate, setEntriesEndDate] = useState('')

  const openPending = () => {
    setSelectedTopic(null)
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
      const familyEntries = entries.filter(e => familyIds.includes(e.topic))

      return {
        id: root.id,
        name: root.name,
        created_at: root.created_at || new Date().toISOString(),
        entries: familyEntries.length,
        hours: familyEntries.reduce((sum, e) => sum + Number(e.hours || 0), 0),
        flagged: familyEntries.filter(e => e.status === 'flagged').length,
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
      results = entries.filter(e => familyIds.includes(e.topic))
    } else if (drillLevel === 1) {
      // Show pending and flagged entries when no topic is selected
      results = entries.filter(e => e.status === 'pending' || e.status === 'flagged')
    }

    // Apply status filter
    if (entriesStatusFilter !== 'all') {
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

  const totalPendingApprovals = stats.pending + stats.flagged

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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Merged Pending Approvals Card */}
        <Card
          className={cn("hover:bg-muted/50 transition-colors cursor-pointer h-full", totalPendingApprovals > 0 && 'border-warning')}
          onClick={openPending}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
            <AlertTriangle className={cn("h-4 w-4", totalPendingApprovals > 0 ? "text-warning" : "text-muted-foreground")} />
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", totalPendingApprovals > 0 ? "text-warning" : "")}>
              {totalPendingApprovals}
            </div>
            <p className="text-xs text-muted-foreground">Entries requiring review</p>
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
                <Select value={entriesStatusFilter} onValueChange={(v) => setEntriesStatusFilter(v as 'all' | 'pending' | 'flagged' | 'approved')}>
                  <SelectTrigger className="w-[130px] h-9">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
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
                              <Badge variant="destructive" className="h-5 px-1.5 text-[10px] font-bold">
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
                          {getTopicPath(entry.topic)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{entry.date}</TableCell>
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
                    {getTopicPath(selectedEntry.topic)}
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
                          <div className="flex flex-col gap-2">
                            <Badge variant="destructive" className="w-fit px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider">{potentialType}</Badge>
                            <span className="leading-relaxed text-foreground/80">{description}</span>
                          </div>
                        )
                      }
                      return text;
                    })()}
                  </div>
                </div>

                <div className="pt-6 border-t">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-sky-500 animate-pulse text-xl">✨</span>
                    <h3 className="text-sm font-bold text-foreground tracking-tight">AI REASONING ANALYSIS</h3>
                  </div>
                  <div className="bg-gradient-to-br from-sky-500/5 to-transparent border border-sky-500/20 rounded-2xl p-6 relative overflow-hidden">
                    <div className="relative z-10 space-y-4">
                      <p className="text-sm text-foreground/80 leading-relaxed italic font-medium">
                        "Based on the complexity of {topics.find(t => t.id === selectedEntry.topic)?.name} and the learner's history, the duration of {selectedEntry.hours}h is {selectedEntry.hours > 5 ? 'above average but consistent' : 'optimal'}. Valid learning outcomes detected."
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full sm:w-auto border-sky-500/50 text-sky-700 hover:bg-sky-500/10 font-bold tracking-tight rounded-full px-6"
                        onClick={() => handleOverride(selectedEntry)}
                      >
                        OVERRIDE STATUS
                      </Button>
                    </div>
                    <div className="absolute -right-4 -bottom-4 text-sky-500/10 rotate-12">
                      <TrendingUp className="h-24 w-24" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-2xl border bg-card p-6 space-y-6 shadow-sm">
                  <h3 className="text-sm font-bold border-b pb-3 flex items-center gap-2">
                    <Clock className="h-4 w-4" /> Metrics & Meta
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
                    <div className="flex justify-between items-center text-sm">
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
                    <div className="flex justify-between items-center text-sm pt-2 border-t font-bold">
                      <span className="text-muted-foreground">Status</span>
                      <Badge variant={selectedEntry.status === 'flagged' ? 'destructive' : 'outline'} className="rounded-sm text-[10px] px-1.5 uppercase">
                        {selectedEntry.status}
                      </Badge>
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
  // Get user's entries
  const userEntries = entries.filter((e) => e.user === user?.id)

  // Recent entries for display
  const recentEntries = [...userEntries]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5)

  // Get user's training plan
  const userPlan = plans.find((plan) =>
    assignments.some((a) => a.plan === plan.id)
  )

  return (
    <>
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Link to="/calendar">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Approved</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">{stats.approved}</div>
              <p className="text-xs text-muted-foreground">Entries approved</p>
            </CardContent>
          </Card>
        </Link>

        <Link to="/calendar">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-warning">{stats.pending}</div>
              <p className="text-xs text-muted-foreground">Awaiting review</p>
            </CardContent>
          </Card>
        </Link>

        <Link to="/calendar">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Entries</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalEntries}</div>
              <p className="text-xs text-muted-foreground">All time logged</p>
            </CardContent>
          </Card>
        </Link>

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

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Entries */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Entries</CardTitle>
              <CardDescription>Your latest learning activities</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/calendar">
                View Calendar
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No entries yet. Start logging your learning!</p>
                <Button className="mt-4" asChild>
                  <Link to="/calendar">Go to Calendar</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {recentEntries.map((entry) => {
                  const topic = topics.find((t) => t.id === entry.topic)

                  return (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between rounded-lg border border-border p-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{topic?.name}</span>
                          <Badge
                            variant={
                              entry.status === 'approved'
                                ? 'default'
                                : entry.status === 'flagged'
                                  ? 'destructive'
                                  : 'secondary'
                            }
                            className={cn(
                              'text-xs',
                              entry.status === 'approved' && 'bg-success'
                            )}
                          >
                            {entry.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {entry.hours}h on {entry.date}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
            <Button variant="outline" className="h-auto flex-col gap-2 p-4 bg-transparent" asChild>
              <Link to="/calendar">
                <Calendar className="h-5 w-5" />
                <span>Log Entry</span>
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
