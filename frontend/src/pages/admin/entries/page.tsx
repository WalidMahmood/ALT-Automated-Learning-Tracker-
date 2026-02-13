
import { Suspense } from 'react'
import Loading from './loading'

import { useState, useMemo, useEffect } from 'react'

import { useAppSelector, useAppDispatch } from '@/lib/store/hooks'
import { Navigate, useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Search, ArrowUpDown, Loader2 } from 'lucide-react'
import { Entry, EntryStatus, User, Topic } from '@/lib/types'
import { OverrideModal } from '@/components/admin/override-modal'
import { fetchEntries } from '@/lib/store/slices/entriesSlice'
import { fetchTopics } from '@/lib/store/slices/topicsSlice'
import { fetchUsers } from '@/lib/store/slices/usersSlice'

export default function AdminEntriesPage() {
  const dispatch = useAppDispatch()

  useEffect(() => {
    dispatch(fetchEntries({}))
    dispatch(fetchTopics())
    dispatch(fetchUsers())
  }, [dispatch])

  return (
    <Suspense fallback={<Loading />}>
      <AdminEntriesContent />
    </Suspense>
  )
}

function AdminEntriesContent() {
  const { user } = useAppSelector((state) => state.auth)
  const { entries, isLoading } = useAppSelector((state) => state.entries)
  const { topics } = useAppSelector((state) => state.topics)
  const { users } = useAppSelector((state) => state.users)
  const navigate = useNavigate()
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null)
  const [overrideModalOpen, setOverrideModalOpen] = useState(false)

  // Redirect non-admins
  if (user?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  const handleOverride = (entry: Entry) => {
    setSelectedEntry(entry)
    setOverrideModalOpen(true)
  }

  const handleViewEntry = (entry: Entry) => {
    navigate(`/admin/entries/${entry.id}`)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Entry Review</h1>
        <p className="text-muted-foreground">
          Review latest entries from all learners
        </p>
      </div>

      <AllEntriesView
        entries={entries}
        users={users}
        topics={topics}
        isLoading={isLoading}
        onOverride={handleOverride}
        onViewEntry={handleViewEntry}
      />

      {/* Override Modal (Global) */}
      <OverrideModal
        entry={overrideModalOpen ? selectedEntry : null}
        open={overrideModalOpen}
        onClose={() => {
          setOverrideModalOpen(false)
          setSelectedEntry(null)
        }}
      />
    </div>
  )
}

// --- COMPONENTS ---

function AllEntriesView({ entries, users, topics, isLoading, onOverride, onViewEntry }: {
  entries: Entry[],
  users: User[],
  topics: Topic[],
  isLoading: boolean,
  onOverride: (e: Entry) => void,
  onViewEntry: (e: Entry) => void
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<EntryStatus | 'all'>('all')
  const [intentFilter, setIntentFilter] = useState<'all' | 'topic' | 'project'>('all')
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>({ key: 'date', direction: 'desc' })
  const [pageSize, setPageSize] = useState(50)

  const processedEntries = useMemo(() => {
    let results = entries.filter((entry: Entry) => {
      if (statusFilter !== 'all' && entry.status !== statusFilter) return false
      if (intentFilter === 'topic' && entry.intent === 'sbu_tasks') return false
      if (intentFilter === 'project' && entry.intent !== 'sbu_tasks') return false
      if (searchQuery) {
        const u = users.find((u: User) => u.id === entry.user)
        const t = topics.find((t: Topic) => t.id === entry.topic)
        return (
          u?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          entry.project_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          entry.date.includes(searchQuery)
        )
      }
      return true
    })

    if (sortConfig) {
      results.sort((a, b) => {
        // @ts-ignore
        const aVal = a[sortConfig.key]
        // @ts-ignore
        const bVal = b[sortConfig.key]
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
        return 0
      })
    }

    return results.slice(0, pageSize)
  }, [entries, users, topics, searchQuery, statusFilter, intentFilter, sortConfig, pageSize])

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search learners, topics, or dates..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 h-10"
              />
            </div>
            <div className="flex gap-3">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as EntryStatus | 'all')}>
                <SelectTrigger className="w-[140px] h-10">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="flagged">Flagged</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                </SelectContent>
              </Select>

              <Select value={intentFilter} onValueChange={(v) => setIntentFilter(v as any)}>
                <SelectTrigger className="w-[140px] h-10">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="topic">L&D Tasks</SelectItem>
                  <SelectItem value="project">SBU Tasks</SelectItem>
                </SelectContent>
              </Select>

              <Select value={pageSize.toString()} onValueChange={(v) => setPageSize(parseInt(v))}>
                <SelectTrigger className="w-[110px] h-10">
                  <SelectValue placeholder="Show 50" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">Show 50</SelectItem>
                  <SelectItem value="100">Show 100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="cursor-pointer hover:bg-muted font-bold" onClick={() => requestSort('user')}>
                    <div className="flex items-center gap-1">Username <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead className="cursor-pointer hover:bg-muted font-bold" onClick={() => requestSort('topic')}>
                    <div className="flex items-center gap-1">Topic <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead className="cursor-pointer hover:bg-muted font-bold" onClick={() => requestSort('date')}>
                    <div className="flex items-center gap-1">Date <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead className="font-bold">AI Status</TableHead>
                  <TableHead className="font-bold">Entry Status</TableHead>
                  <TableHead className="text-right font-bold pr-6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="p-12 text-center">
                      <div className="flex items-center justify-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Loading entries...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : processedEntries.map((entry: Entry) => {
                  const user = users.find((u: User) => u.id === entry.user)
                  const topic = topics.find((t: Topic) => t.id === entry.topic)
                  return (
                    <TableRow key={entry.id} className="hover:bg-muted/30">
                      <TableCell className="py-4 font-medium">{user?.name || 'Unknown'}</TableCell>
                      <TableCell className="py-4">
                        {entry.intent === 'sbu_tasks'
                          ? <span className="flex items-center gap-1"><span className="text-xs">🛠️</span>{entry.project_name || 'Project'}</span>
                          : (topic?.name || 'Unknown')}
                      </TableCell>
                      <TableCell className="py-4 text-muted-foreground">{entry.date}</TableCell>
                      <TableCell className="py-4">
                        {entry.ai_status === 'analyzed' ? (
                          <Badge variant={entry.ai_decision === 'approve' ? 'default' : 'secondary'} className="text-xs font-bold">
                            {entry.ai_decision?.toUpperCase()} ({entry.ai_confidence}%)
                          </Badge>
                        ) : <span className="text-xs text-muted-foreground">Not Analyzed</span>}
                      </TableCell>
                      <TableCell className="py-4">
                        <Badge variant={entry.status === 'flagged' ? 'destructive' : 'outline'} className="text-xs font-bold">
                          {entry.status.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-4 text-right pr-6">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => onViewEntry(entry)} className="h-8">View</Button>
                          <Button variant="outline" size="sm" onClick={() => onOverride(entry)} className="h-8 border-primary/20 hover:bg-primary/5">Override</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          {!isLoading && processedEntries.length === 0 && (
            <div className="p-12 text-center text-muted-foreground">
              No entries found matching your criteria.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

