import { useState, useEffect, useMemo } from 'react'
import { useAppSelector } from '@/lib/store/hooks'
import api from '@/lib/api'
import ReactMarkdown from 'react-markdown'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  FileText,
  Download,
  Clock,
  TrendingUp,
  BookOpen,
  FolderKanban,
  Calendar,
  CheckCircle2,
  BarChart3,
  Sparkles,
  Loader2,
  Users,
  UserCheck,
  ChevronsUpDown,
  Check,
} from 'lucide-react'

import { TimeBreakdownChart } from '@/components/reports/time-breakdown-chart'
import { DailyActivityChart } from '@/components/reports/daily-activity-chart'
import { TopicProgressChart } from '@/components/reports/topic-progress-chart'
import { ApprovalDonutChart } from '@/components/reports/approval-donut-chart'
import { ProjectProgressChart } from '@/components/reports/project-progress-chart'
import { UserBreakdownChart } from '@/components/reports/user-breakdown-chart'
import { WeeklyTrendChart } from '@/components/reports/weekly-trend-chart'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

// Types
interface UserOption {
  id: number
  email: string
  full_name: string
}

interface ReportData {
  id: number
  period: string
  period_start: string
  period_end: string
  user_name: string
  user_email: string
  markdown_content: string
  charts_data: {
    time_breakdown: { lnd_hours: number; sbu_hours: number }
    daily_activity: { date: string; hours: number; lnd_hours: number; sbu_hours: number; entries: number }[]
    topic_progress: { name: string; coverage_pct: number; hours: number; benchmark_hours: number }[]
    approval_donut: { approved: number; pending: number; rejected: number; flagged: number }
    weekly_trend: { week: string; hours: number; entries: number }[]
  }
  raw_stats: {
    overview: {
      total_hours: number
      total_entries: number
      approval_rate: number
      avg_confidence: number
      lnd_hours: number
      sbu_hours: number
      lnd_entries: number
      sbu_entries: number
      active_days: number
      days_in_period: number
      consistency_pct: number
    }
    lnd: {
      topics_completed_count: number
      topics_in_progress_count: number
      topics_worked: { name: string; hours: number; is_completed: boolean }[]
    }
    sbu: {
      total_hours: number
      projects_worked: { name: string; hours: number; entries: number; features_done: number; features_total: number }[]
    }
  }
  generated_at: string
  generation_time_seconds: number
}

interface TeamData {
  period: string
  period_start: string
  period_end: string
  overview: {
    total_hours: number
    total_entries: number
    approval_rate: number
    avg_confidence: number
    lnd_hours: number
    sbu_hours: number
    active_users: number
    total_learners: number
  }
  charts_data: {
    time_breakdown: { lnd_hours: number; sbu_hours: number }
    daily_activity: { date: string; hours: number; lnd_hours: number; sbu_hours: number; entries: number }[]
    user_breakdown: { name: string; hours: number; lnd_hours: number; sbu_hours: number; entries: number; approval_rate: number; training_plan: string; feedback: string; first_date: string; last_date: string }[]
    approval_donut: { approved: number; pending: number; rejected: number; flagged: number }
    weekly_trend: { week: string; hours: number; entries: number }[]
  }
}

interface PastReport {
  id: number
  period: string
  period_start: string
  period_end: string
  generated_at: string
  user_email: string
}

const PERIOD_LABELS: Record<string, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  all_time: 'All Time',
}

type ReportMode = 'individual' | 'team'

export default function ReportsPage() {
  const { user: currentUser } = useAppSelector((state) => state.auth)
  const [mode, setMode] = useState<ReportMode>('team')
  const [period, setPeriod] = useState<'weekly' | 'monthly' | 'all_time'>('weekly')
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [comboOpen, setComboOpen] = useState(false)
  const [users, setUsers] = useState<UserOption[]>([])
  const [report, setReport] = useState<ReportData | null>(null)
  const [teamData, setTeamData] = useState<TeamData | null>(null)
  const [pastReports, setPastReports] = useState<PastReport[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load users for dropdown
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await api.get('/users/profile/list_all/?status=all')
        const raw = Array.isArray(res.data) ? res.data : res.data.results || []
        const userList = raw
          .filter((u: any) => u.role !== 'admin')
          .map((u: any) => ({
            id: u.id,
            email: u.email,
            full_name: u.full_name || u.email,
          }))
        setUsers(userList)
      } catch {
        // fallback
      }
    }
    fetchUsers()
    loadPastReports()
  }, [])

  const loadPastReports = async () => {
    try {
      const res = await api.get('/reports/', { params: { limit: 15 } })
      setPastReports(res.data)
    } catch {
      // silent
    }
  }

  const selectedUserLabel = useMemo(() => {
    const u = users.find((u) => String(u.id) === selectedUserId)
    return u ? u.full_name : 'Choose intern...'
  }, [selectedUserId, users])

  const generateReport = async () => {
    if (mode === 'individual' && !selectedUserId) {
      setError('Please select an intern first')
      return
    }
    setLoading(true)
    setError(null)

    try {
      if (mode === 'team') {
        const res = await api.get('/reports/team/', { params: { period } })
        setTeamData(res.data)
        setReport(null)
      } else {
        const res = await api.post('/reports/generate/', {
          period,
          user_id: parseInt(selectedUserId),
        })
        setReport(res.data)
        setTeamData(null)
        loadPastReports()
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate report.')
    } finally {
      setLoading(false)
    }
  }

  const loadReport = async (id: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get(`/reports/${id}/`)
      setReport(res.data)
      setTeamData(null)
      setMode('individual')
      setPeriod(res.data.period)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load report')
    } finally {
      setLoading(false)
    }
  }

  const handlePrint = () => {
    const original = document.title
    if (teamData) {
      document.title = `ALTSystem_Team_${PERIOD_LABELS[teamData.period]}_${teamData.period_end}`
    } else if (report) {
      const name = (report.user_name || report.user_email || 'report').replace(/\s+/g, '_')
      document.title = `ALTSystem_${name}_${PERIOD_LABELS[report.period]}_${report.period_end}`
    }
    window.print()
    setTimeout(() => { document.title = original }, 500)
  }

  // Non-admin guard
  if (currentUser?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Access Restricted</h3>
            <p className="text-muted-foreground text-sm">Only administrators can access progress reports.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const formatPeriodLabel = (start: string, end: string) => {
    const s = new Date(start + 'T00:00:00')
    const e = new Date(end + 'T00:00:00')
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
    return `${s.toLocaleDateString('en-US', opts)} — ${e.toLocaleDateString('en-US', opts)}`
  }

  const hasReport = report || teamData

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-7xl mx-auto" id="reports-page">
      {/* === SCREEN-ONLY CONTROLS === */}
      <div className="print:hidden">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-primary" />
              Progress Reports
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Generate team or individual reports</p>
          </div>
          {hasReport && (
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2">
              <Download className="h-4 w-4" />
              Print / Save PDF
            </Button>
          )}
        </div>

        {/* Controls Card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-4">
              {/* Row 1: Mode Toggle + Period */}
              <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
                {/* Mode Toggle */}
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Report Type</label>
                  <Tabs value={mode} onValueChange={(v) => setMode(v as ReportMode)}>
                    <TabsList className="grid grid-cols-2 w-[240px]">
                      <TabsTrigger value="team" className="gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        Team
                      </TabsTrigger>
                      <TabsTrigger value="individual" className="gap-1.5">
                        <UserCheck className="h-3.5 w-3.5" />
                        Individual
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                {/* User Selector (individual only) */}
                {mode === 'individual' && (
                  <div className="flex-1 min-w-[220px]">
                    <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Select Intern</label>
                    <Popover open={comboOpen} onOpenChange={setComboOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={comboOpen}
                          className="w-full justify-between font-normal"
                        >
                          {selectedUserLabel}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search by name..." />
                          <CommandList>
                            <CommandEmpty>No intern found.</CommandEmpty>
                            <CommandGroup>
                              {users.map((u) => (
                                <CommandItem
                                  key={u.id}
                                  value={u.full_name}
                                  onSelect={() => {
                                    setSelectedUserId(String(u.id))
                                    setComboOpen(false)
                                  }}
                                >
                                  <Check
                                    className={`mr-2 h-4 w-4 ${
                                      selectedUserId === String(u.id) ? 'opacity-100' : 'opacity-0'
                                    }`}
                                  />
                                  {u.full_name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                )}

                {/* Period Selector */}
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Period</label>
                  <Tabs value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
                    <TabsList className="grid grid-cols-3">
                      <TabsTrigger value="weekly" className="gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />Weekly
                      </TabsTrigger>
                      <TabsTrigger value="monthly" className="gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />Monthly
                      </TabsTrigger>
                      <TabsTrigger value="all_time" className="gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5" />All Time
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                {/* Generate Button */}
                <Button
                  onClick={generateReport}
                  disabled={loading || (mode === 'individual' && !selectedUserId)}
                  className="gap-2 min-w-[160px]"
                >
                  {loading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Generating...</>
                  ) : (
                    <><Sparkles className="h-4 w-4" />Generate Report</>
                  )}
                </Button>
              </div>

              {error && (
                <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm">{error}</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="grid gap-4 md:grid-cols-4 print:hidden">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-4 bg-muted animate-pulse rounded w-1/2 mb-3" />
                <div className="h-8 bg-muted animate-pulse rounded w-3/4 mb-2" />
                <div className="h-3 bg-muted animate-pulse rounded w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/*           TEAM REPORT VIEW             */}
      {/* ═══════════════════════════════════════ */}
      {teamData && !loading && (
        <div className="report-content" id="report-printable">
          {/* Print-only Header */}
          <div className="hidden print:block mb-8 border-b-2 border-foreground pb-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">Team Overview Report</h1>
                <p className="text-lg text-muted-foreground mt-1">All Interns</p>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">BrainStation-23</p>
                <p>ALT System</p>
                <p>{PERIOD_LABELS[teamData.period]} Report</p>
                <p>{formatPeriodLabel(teamData.period_start, teamData.period_end)}</p>
              </div>
            </div>
          </div>

          {/* Screen title */}
          <div className="print:hidden flex items-center justify-between mb-4 px-1">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                {PERIOD_LABELS[teamData.period]} Team Overview
              </h2>
              <p className="text-sm text-muted-foreground">{formatPeriodLabel(teamData.period_start, teamData.period_end)}</p>
            </div>
          </div>

          {/* Overview Stats */}
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1 print:text-xs">Overview</h3>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4 print:grid-cols-4 mb-6">
            <Card className="print:shadow-none">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <Clock className="h-4 w-4 print:hidden" />Total Hours
                </div>
                <div className="text-2xl font-bold">{teamData.overview.total_hours}h</div>
                <p className="text-xs text-muted-foreground mt-1">{teamData.overview.total_entries} entries</p>
              </CardContent>
            </Card>
            <Card className="print:shadow-none">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <CheckCircle2 className="h-4 w-4 print:hidden" />Approval Rate
                </div>
                <div className="text-2xl font-bold">{teamData.overview.approval_rate}%</div>
                <p className="text-xs text-muted-foreground mt-1">AI avg: {teamData.overview.avg_confidence}%</p>
              </CardContent>
            </Card>
            <Card className="print:shadow-none">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <Users className="h-4 w-4 print:hidden" />Active Interns
                </div>
                <div className="text-2xl font-bold">{teamData.overview.active_users}/{teamData.overview.total_learners}</div>
                <p className="text-xs text-muted-foreground mt-1">logged entries this period</p>
              </CardContent>
            </Card>
            <Card className="print:shadow-none">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <BookOpen className="h-4 w-4 print:hidden" />L&D vs SBU
                </div>
                <div className="text-2xl font-bold">{teamData.overview.lnd_hours}h / {teamData.overview.sbu_hours}h</div>
                <p className="text-xs text-muted-foreground mt-1">learning / project</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1 print:text-xs">Analytics</h3>
          <div className="grid gap-4 md:grid-cols-2 print:grid-cols-2 mb-6">
            <Card className="print:shadow-none print:break-inside-avoid">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Time Distribution</CardTitle>
                <CardDescription>Team L&D vs Project hours</CardDescription>
              </CardHeader>
              <CardContent>
                <TimeBreakdownChart data={teamData.charts_data.time_breakdown} />
              </CardContent>
            </Card>
            <Card className="print:shadow-none print:break-inside-avoid">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Entry Status</CardTitle>
                <CardDescription>Team approval breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <ApprovalDonutChart data={teamData.charts_data.approval_donut} />
              </CardContent>
            </Card>
            <Card className="md:col-span-2 print:col-span-2 print:shadow-none print:break-inside-avoid">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Daily Activity</CardTitle>
                <CardDescription>Team hours logged per day</CardDescription>
              </CardHeader>
              <CardContent>
                <DailyActivityChart data={teamData.charts_data.daily_activity} />
              </CardContent>
            </Card>
          </div>

          {/* Weekly Trend */}
          {teamData.charts_data.weekly_trend?.length > 1 && (
            <>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1 print:text-xs">Weekly Trend</h3>
              <Card className="mb-6 print:shadow-none print:break-inside-avoid">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Hours & Entries Over Time</CardTitle>
                  <CardDescription>Team performance curve by week</CardDescription>
                </CardHeader>
                <CardContent>
                  <WeeklyTrendChart data={teamData.charts_data.weekly_trend} />
                </CardContent>
              </Card>
            </>
          )}

          {/* Per-user Breakdown Chart */}
          {teamData.charts_data.user_breakdown?.length > 0 && (
            <>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1 print:text-xs">Per-Intern Breakdown</h3>
              <Card className="mb-6 print:shadow-none print:break-inside-avoid">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Hours by Intern</CardTitle>
                  <CardDescription>Individual contribution (hover for details)</CardDescription>
                </CardHeader>
                <CardContent>
                  <UserBreakdownChart data={teamData.charts_data.user_breakdown} />
                </CardContent>
              </Card>
            </>
          )}

          {/* Per-user Detail Table */}
          {teamData.charts_data.user_breakdown?.length > 0 && (
            <>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1 print:text-xs">Intern Details</h3>
              <Card className="mb-6 print:shadow-none">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[140px]">Name</TableHead>
                          <TableHead>Training Plan</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="text-right">L&D</TableHead>
                          <TableHead className="text-right">SBU</TableHead>
                          <TableHead className="text-right">Approval</TableHead>
                          <TableHead>Feedback</TableHead>
                          <TableHead>Period</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {teamData.charts_data.user_breakdown.map((u, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{u.name}</TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate">{u.training_plan}</TableCell>
                            <TableCell className="text-right font-medium">{u.hours}h</TableCell>
                            <TableCell className="text-right text-sm">{u.lnd_hours}h</TableCell>
                            <TableCell className="text-right text-sm">{u.sbu_hours}h</TableCell>
                            <TableCell className="text-right">
                              <span className={u.approval_rate >= 70 ? 'text-green-600' : u.approval_rate >= 40 ? 'text-yellow-600' : 'text-red-500'}>
                                {u.approval_rate}%
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={u.feedback === 'Excellent' ? 'default' : u.feedback === 'Good' ? 'secondary' : 'destructive'}
                                className={`text-xs ${u.feedback === 'Excellent' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : u.feedback === 'Good' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' : u.feedback === 'Needs Improvement' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300' : ''}`}
                              >
                                {u.feedback}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {u.first_date !== '—' ? (
                                <div className="leading-tight">
                                  <div>{new Date(u.first_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                                  <div className="text-[10px]">to {new Date(u.last_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}</div>
                                </div>
                              ) : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* Print footer */}
          <div className="hidden print:block mt-8 pt-4 border-t text-xs text-gray-500">
            <div className="flex justify-between">
              <span>Generated by ALT System · BrainStation-23</span>
              <span>{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/*         INDIVIDUAL REPORT VIEW         */}
      {/* ═══════════════════════════════════════ */}
      {report && !loading && (
        <div className="report-content" id="report-printable">
          {/* Print-only Header */}
          <div className="hidden print:block mb-8 border-b-2 border-foreground pb-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">Progress Report</h1>
                <p className="text-lg text-muted-foreground mt-1">{report.user_name || report.user_email}</p>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">BrainStation-23</p>
                <p>ALT System</p>
                <p>{PERIOD_LABELS[report.period]} Report</p>
                <p>{formatPeriodLabel(report.period_start, report.period_end)}</p>
              </div>
            </div>
          </div>

          {/* Screen title */}
          <div className="print:hidden flex items-center justify-between mb-4 px-1">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                {PERIOD_LABELS[report.period]} Progress Report
              </h2>
              <p className="text-sm text-muted-foreground">
                {report.user_name || report.user_email} · {formatPeriodLabel(report.period_start, report.period_end)}
              </p>
            </div>
          </div>

          {/* Overview Stats */}
          {report.raw_stats?.overview && (
            <>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1 print:text-xs">Overview</h3>
              <div className="grid gap-3 grid-cols-2 md:grid-cols-4 print:grid-cols-4 mb-6">
                <Card className="print:shadow-none">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                      <Clock className="h-4 w-4 print:hidden" />Total Hours
                    </div>
                    <div className="text-2xl font-bold">{report.raw_stats.overview.total_hours}h</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {report.raw_stats.overview.total_entries} entries · {report.raw_stats.overview.active_days} active days
                    </p>
                  </CardContent>
                </Card>
                <Card className="print:shadow-none">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                      <CheckCircle2 className="h-4 w-4 print:hidden" />Approval Rate
                    </div>
                    <div className="text-2xl font-bold">{report.raw_stats.overview.approval_rate}%</div>
                    <p className="text-xs text-muted-foreground mt-1">AI confidence: {report.raw_stats.overview.avg_confidence}%</p>
                  </CardContent>
                </Card>
                <Card className="print:shadow-none">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                      <BookOpen className="h-4 w-4 print:hidden" />Learning & Dev
                    </div>
                    <div className="text-2xl font-bold">{report.raw_stats.overview.lnd_hours}h</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {report.raw_stats.lnd.topics_completed_count} completed · {report.raw_stats.lnd.topics_in_progress_count} in progress
                    </p>
                  </CardContent>
                </Card>
                <Card className="print:shadow-none">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                      <FolderKanban className="h-4 w-4 print:hidden" />Project Work
                    </div>
                    <div className="text-2xl font-bold">{report.raw_stats.overview.sbu_hours}h</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {report.raw_stats.sbu.projects_worked.length} project{report.raw_stats.sbu.projects_worked.length !== 1 ? 's' : ''}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </>
          )}

          {/* Charts */}
          {report.charts_data && (
            <>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1 print:text-xs">Analytics</h3>
              <div className="grid gap-4 md:grid-cols-2 print:grid-cols-2 mb-6">
                <Card className="print:shadow-none print:break-inside-avoid">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Time Distribution</CardTitle>
                    <CardDescription>Learning vs Project hours</CardDescription>
                  </CardHeader>
                  <CardContent><TimeBreakdownChart data={report.charts_data.time_breakdown} /></CardContent>
                </Card>
                <Card className="print:shadow-none print:break-inside-avoid">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Entry Status</CardTitle>
                    <CardDescription>Approval breakdown</CardDescription>
                  </CardHeader>
                  <CardContent><ApprovalDonutChart data={report.charts_data.approval_donut} /></CardContent>
                </Card>
                <Card className="md:col-span-2 print:col-span-2 print:shadow-none print:break-inside-avoid">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Daily Activity</CardTitle>
                    <CardDescription>Hours logged per day</CardDescription>
                  </CardHeader>
                  <CardContent><DailyActivityChart data={report.charts_data.daily_activity} /></CardContent>
                </Card>
              </div>
            </>
          )}

          {/* Topic Progress */}
          {report.charts_data?.topic_progress?.length > 0 && (
            <>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1 print:text-xs">Learning Progress</h3>
              <Card className="mb-6 print:shadow-none print:break-inside-avoid">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Topic Coverage</CardTitle>
                  <CardDescription>Completion percentage per topic</CardDescription>
                </CardHeader>
                <CardContent><TopicProgressChart data={report.charts_data.topic_progress} /></CardContent>
              </Card>
            </>
          )}

          {/* Project Progress */}
          {report.raw_stats?.sbu?.projects_worked?.length > 0 && (
            <>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1 print:text-xs">Project Progress</h3>
              <Card className="mb-6 print:shadow-none print:break-inside-avoid">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Project Hours</CardTitle>
                  <CardDescription>Time invested per project</CardDescription>
                </CardHeader>
                <CardContent><ProjectProgressChart data={report.raw_stats.sbu.projects_worked} /></CardContent>
              </Card>
            </>
          )}

          {/* AI Assessment */}
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1 print:text-xs">Assessment & Recommendations</h3>
          <Card className="mb-6 print:shadow-none">
            <CardContent className="pt-6">
              <div className="prose prose-sm dark:prose-invert max-w-none
                prose-headings:text-foreground prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2
                prose-p:text-muted-foreground prose-p:leading-relaxed prose-p:my-2
                prose-li:text-muted-foreground prose-li:my-0.5
                prose-strong:text-foreground prose-strong:font-semibold
                prose-ul:my-2 prose-ol:my-2
                print:prose-headings:text-black print:prose-p:text-gray-700 print:prose-li:text-gray-700 print:prose-strong:text-black"
              >
                <ReactMarkdown>{report.markdown_content}</ReactMarkdown>
              </div>
            </CardContent>
          </Card>

          {/* Print footer */}
          <div className="hidden print:block mt-8 pt-4 border-t text-xs text-gray-500">
            <div className="flex justify-between">
              <span>Generated by ALT System · BrainStation-23</span>
              <span>{new Date(report.generated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>
          </div>

          {/* Screen-only metadata */}
          <div className="flex items-center justify-between text-xs text-muted-foreground print:hidden">
            <span>Report #{report.id} · {formatPeriodLabel(report.period_start, report.period_end)}</span>
            <span>Generated in {report.generation_time_seconds.toFixed(1)}s</span>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!hasReport && !loading && (
        <Card className="print:hidden">
          <CardContent className="p-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Report Generated Yet</h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              {mode === 'team'
                ? 'Select a period and click "Generate Report" for a team overview.'
                : 'Select an intern and time period, then generate a progress report.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Past Reports */}
      {pastReports.length > 0 && (
        <Card className="print:hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Past Individual Reports</CardTitle>
            <CardDescription>Click to view a previously generated report</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {pastReports.map((r) => (
                <button
                  key={r.id}
                  onClick={() => loadReport(r.id)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors
                    hover:bg-accent hover:text-accent-foreground
                    ${report?.id === r.id ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {r.user_email} · <span className="capitalize">{r.period}</span>
                    </span>
                    <span className="text-xs">{new Date(r.generated_at).toLocaleDateString()}</span>
                  </div>
                  <div className="text-xs mt-0.5">{r.period_start} → {r.period_end}</div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
