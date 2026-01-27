
import { Suspense } from 'react'
import Loading from './loading'

import { useState, useMemo } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { useAppSelector } from '@/lib/store/hooks'
import { Navigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  Clock,
  Filter,
  Search,
} from 'lucide-react'
import { mockEntries, mockUsers, mockTopics } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import { Entry, EntryStatus } from '@/lib/types'
import { EntryDetailModal } from '@/components/admin/entry-detail-modal'
import { OverrideModal } from '@/components/admin/override-modal'

export default function AdminEntriesPage() {
  return (
    <AppLayout>
      <Suspense fallback={<Loading />}> {/* Wrap the AdminEntriesContent component in a Suspense boundary */}
        <AdminEntriesContent />
      </Suspense>
    </AppLayout>
  )
}

function AdminEntriesContent() {
  const { user } = useAppSelector((state) => state.auth)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<EntryStatus | 'all'>('all')
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null)
  const [overrideModalOpen, setOverrideModalOpen] = useState(false)

  // Redirect non-admins
  if (user?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  // Filter entries
  const filteredEntries = useMemo(() => {
    return mockEntries.filter((entry) => {
      // Status filter
      if (statusFilter !== 'all' && entry.status !== statusFilter) return false

      // Search filter
      if (searchQuery) {
        const entryUser = mockUsers.find((u) => u.id === entry.user_id)
        const topic = mockTopics.find((t) => t.id === entry.topic_id)
        const searchLower = searchQuery.toLowerCase()

        return (
          entryUser?.name.toLowerCase().includes(searchLower) ||
          topic?.name.toLowerCase().includes(searchLower) ||
          entry.date.includes(searchQuery)
        )
      }

      return true
    }).sort((a, b) => {
      // Sort by status priority (flagged first, then pending, then others)
      const statusOrder = { flagged: 0, pending: 1, rejected: 2, approved: 3 }
      const statusDiff = (statusOrder[a.status] || 4) - (statusOrder[b.status] || 4)
      if (statusDiff !== 0) return statusDiff

      // Then by date (newest first)
      return new Date(b.date).getTime() - new Date(a.date).getTime()
    })
  }, [searchQuery, statusFilter])

  const handleViewEntry = (entry: Entry) => {
    setSelectedEntry(entry)
  }

  const handleOverride = (entry: Entry) => {
    setSelectedEntry(entry)
    setOverrideModalOpen(true)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Entry Review</h1>
        <p className="text-muted-foreground">
          Review and manage all learner entries with AI analysis
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by learner, topic, or date..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as EntryStatus | 'all')}
            >
              <SelectTrigger className="w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Entries</SelectItem>
                <SelectItem value="flagged">Flagged</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Entries Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Entries ({filteredEntries.length})</CardTitle>
          <CardDescription>
            Click on an entry to view details and AI analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Learner</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Topic</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>AI Decision</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      No entries found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEntries.map((entry) => {
                    const entryUser = mockUsers.find((u) => u.id === entry.user_id)
                    const topic = mockTopics.find((t) => t.id === entry.topic_id)

                    return (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{entryUser?.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {entryUser?.experience_years} yrs exp
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>{entry.date}</TableCell>
                        <TableCell>{topic?.name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            {entry.hours}h
                          </div>
                        </TableCell>
                        <TableCell>
                          {entry.ai_status === 'analyzed' ? (
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={
                                  entry.ai_decision === 'approve'
                                    ? 'default'
                                    : entry.ai_decision === 'flag'
                                      ? 'secondary'
                                      : 'destructive'
                                }
                                className={cn(
                                  'text-xs',
                                  entry.ai_decision === 'approve' && 'bg-success'
                                )}
                              >
                                {entry.ai_decision}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {entry.ai_confidence}%
                              </span>
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              Pending
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              entry.status === 'approved'
                                ? 'default'
                                : entry.status === 'flagged'
                                  ? 'destructive'
                                  : entry.status === 'rejected'
                                    ? 'destructive'
                                    : 'secondary'
                            }
                            className={cn(
                              entry.status === 'approved' && 'bg-success'
                            )}
                          >
                            {entry.status}
                            {entry.admin_override && ' (Override)'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewEntry(entry)}
                            >
                              View
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOverride(entry)}
                            >
                              Override
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Entry Detail Modal */}
      <EntryDetailModal
        entry={selectedEntry}
        onClose={() => setSelectedEntry(null)}
        onOverride={handleOverride}
      />

      {/* Override Modal */}
      <OverrideModal
        entry={selectedEntry}
        open={overrideModalOpen}
        onClose={() => {
          setOverrideModalOpen(false)
          setSelectedEntry(null)
        }}
      />
    </div>
  )
}

// Create the loading.tsx file in the same directory as the page
// loading.tsx
// export default function Loading() {
//   return null
// }
