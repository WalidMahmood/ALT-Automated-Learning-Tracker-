import { useState, useMemo, useEffect } from 'react'

import { useAppSelector, useAppDispatch } from '@/lib/store/hooks'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  TrendingUp,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { DrillDownModal } from '@/components/dashboard/drill-down-modal'
import type {
  Entry, User, Topic,
  TrainingPlan,
  PlanAssignment,
} from '@/lib/types'
import { EntryDetailModal } from '@/components/admin/entry-detail-modal'
import { OverrideModal } from '@/components/admin/override-modal'

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
          users={users}
          topics={topics}
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
  users,
  topics
}: {
  stats: any,
  entries: Entry[],
  users: User[],
  topics: Topic[]
}) {
  // Drill-down Modal State
  const [modalOpen, setModalOpen] = useState(false)
  const [modalTitle, setModalTitle] = useState('')
  const [viewType, setViewType] = useState<'entries' | 'users'>('entries')
  const [modalEntries, setModalEntries] = useState<Entry[]>([])
  const [modalUsers, setModalUsers] = useState<any[]>([])

  // Entry Detail Modal State
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null)
  const [overrideModalOpen, setOverrideModalOpen] = useState(false)

  // Track selected topic for nested navigation
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null)

  // Navigation history for modal
  const [history, setHistory] = useState<any[]>([])

  const openPending = () => {
    const pendingAndFlagged = entries.filter(
      (e) => e.status === 'flagged' || e.status === 'pending'
    )
    const newState = { title: 'Pending Approvals', entries: pendingAndFlagged, type: 'entries', topicId: null }
    setModalTitle(newState.title)
    setModalEntries(newState.entries)
    setViewType('entries' as any)
    setSelectedTopicId(null)
    setHistory([newState])
    setModalOpen(true)
  }

  const openTopicUsers = (topicId: number, topicName: string) => {
    const topicEntries = entries.filter((e) => e.topic === topicId)

    const userMap = new Map<number, { userId: number; name: string; entryCount: number; totalHours: number }>()
    topicEntries.forEach(entry => {
      const u = users.find(u => u.id === entry.user)
      if (!u) return
      const existing = userMap.get(u.id) || { userId: u.id, name: u.name, entryCount: 0, totalHours: 0 }
      existing.entryCount++
      existing.totalHours += entry.hours
      userMap.set(u.id, existing)
    })

    const usersList = Array.from(userMap.values())
    const newState = { title: `${topicName} - Users`, users: usersList, type: 'users', topicId }

    setSelectedTopicId(topicId)
    setModalTitle(newState.title)
    setModalUsers(newState.users)
    setViewType('users' as any)
    setHistory([newState])
    setModalOpen(true)
  }

  const handleUserClick = (userId: number) => {
    const userEntries = entries.filter(e => e.user === userId && e.topic === selectedTopicId)
    const u = users.find(u => u.id === userId)
    const newState = { title: `${u?.name}'s Entries`, entries: userEntries, type: 'entries', topicId: selectedTopicId }

    setModalTitle(newState.title)
    setModalEntries(userEntries)
    setViewType('entries' as any)
    setHistory(prev => [...prev, newState])
  }

  const handleBack = () => {
    if (history.length <= 1) return

    const newHistory = [...history]
    newHistory.pop() // Remove current
    const prevState = newHistory[newHistory.length - 1]

    setModalTitle(prevState.title)
    if (prevState.type === 'users') {
      setModalUsers(prevState.users)
    } else {
      setModalEntries(prevState.entries)
    }
    setViewType(prevState.type)
    setSelectedTopicId(prevState.topicId)
    setHistory(newHistory)
  }

  const handleEntryClick = (entry: Entry) => {
    setSelectedEntry(entry)
  }

  const handleOverride = (entry: Entry) => {
    setSelectedEntry(entry)
    setOverrideModalOpen(true)
  }

  // Topic analytics
  const topicStats = useMemo(() => {
    const statsMap = new Map<number, { id: number; name: string; entries: number; hours: number; flagged: number }>()

    entries.forEach((entry) => {
      const topic = topics.find((t) => t.id === entry.topic)
      if (!topic) return

      const existing = statsMap.get(topic.id) || { id: topic.id, name: topic.name, entries: 0, hours: 0, flagged: 0 }
      existing.entries++
      existing.hours += entry.hours
      if (entry.status === 'flagged') existing.flagged++
      statsMap.set(topic.id, existing)
    })

    return Array.from(statsMap.values())
      .sort((a, b) => b.entries - a.entries)
      .slice(0, 5)
  }, [entries, topics])

  const totalPendingApprovals = stats.pending + stats.flagged

  return (
    <>
      <DrillDownModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalTitle}
        entries={modalEntries}
        users={modalUsers}
        viewType={viewType}
        isAdmin={true}
        onUserClick={handleUserClick}
        onEntryClick={handleEntryClick}
        onBack={history.length > 1 ? handleBack : undefined}
      />

      <EntryDetailModal
        entry={selectedEntry}
        onClose={() => setSelectedEntry(null)}
        onOverride={handleOverride}
      />

      <OverrideModal
        entry={selectedEntry}
        open={overrideModalOpen}
        onClose={() => {
          setOverrideModalOpen(false)
          setSelectedEntry(null)
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

        <Link to="/admin/leave">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Leaves</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pendingLeaves}</div>
              <p className="text-xs text-muted-foreground">approved leaves</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Main Content - Entries by Topic */}
      <Card className="col-span-full">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Entries</CardTitle>
            <CardDescription>View entries by topic</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {topicStats.map((topic) => (
              <div
                key={topic.id}
                className="space-y-2 cursor-pointer hover:bg-muted/50 p-2 rounded-md transition-colors"
                onClick={() => openTopicUsers(topic.id, topic.name)}
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{topic.name}</span>
                  <span className="text-muted-foreground">
                    {topic.entries} {topic.entries === 1 ? 'entry' : 'entries'}
                  </span>
                </div>
                <Progress
                  value={(topic.entries / (topicStats[0]?.entries || 1)) * 100}
                  className="h-2"
                />
                {topic.flagged > 0 && (
                  <p className="text-xs text-warning mt-1">{topic.flagged} flagged/pending</p>
                )}
              </div>
            ))}
          </div>
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
  // Drill-down Modal State
  const [modalOpen, setModalOpen] = useState(false)
  const [modalTitle, setModalTitle] = useState('')
  const [modalEntries, setModalEntries] = useState<Entry[]>([])

  const openDrillDown = (title: string, entries: Entry[]) => {
    setModalTitle(title)
    setModalEntries(entries)
    setModalOpen(true)
  }

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
      <DrillDownModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalTitle}
        entries={modalEntries}
        viewType="entries"
        isAdmin={false}
      />

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card
          className="hover:bg-muted/50 transition-colors cursor-pointer"
          onClick={() => openDrillDown('Approved Entries', userEntries.filter(e => e.status === 'approved'))}
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
          className="hover:bg-muted/50 transition-colors cursor-pointer"
          onClick={() => openDrillDown('Pending Entries', userEntries.filter(e => e.status === 'pending'))}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">{stats.pending}</div>
            <p className="text-xs text-muted-foreground">Awaiting review</p>
          </CardContent>
        </Card>

        <Card
          className="hover:bg-muted/50 transition-colors cursor-pointer"
          onClick={() => openDrillDown('All Entries', userEntries)}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Entries</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalEntries}</div>
            <p className="text-xs text-muted-foreground">All time logged</p>
          </CardContent>
        </Card>

        <Card>
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
                    .reduce((sum, e) => sum + e.hours, 0)
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
