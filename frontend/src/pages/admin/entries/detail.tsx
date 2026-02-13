
import React, { useEffect } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { useAppSelector, useAppDispatch } from '@/lib/store/hooks'
import { fetchEntries } from '@/lib/store/slices/entriesSlice'
import { fetchTopics } from '@/lib/store/slices/topicsSlice'
import { fetchUsers } from '@/lib/store/slices/usersSlice'
import { Button } from '@/components/ui/button'
import { Loader2, ArrowLeft } from 'lucide-react'
import { EntryDetailView } from '@/components/admin/entry-detail-view'

export default function EntryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { user: authUser } = useAppSelector((state) => state.auth)
  const { entries } = useAppSelector((state) => state.entries)
  const { topics } = useAppSelector((state) => state.topics)
  const { users } = useAppSelector((state) => state.users)


  useEffect(() => {
    if (entries.length === 0) dispatch(fetchEntries({}))
    if (topics.length === 0) dispatch(fetchTopics())
    if (users.length === 0) dispatch(fetchUsers())
  }, [dispatch, entries.length, topics.length, users.length])

  // Redirect non-admins
  if (authUser?.role !== 'admin') return <Navigate to="/dashboard" replace />

  const entry = entries.find(e => e.id === Number(id))

  if (!entry) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading entry #{id}...</p>
          <Button variant="outline" size="sm" onClick={() => navigate('/admin/entries')}>
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />Back to list
          </Button>
        </div>
      </div>
    )
  }

  return (
    <EntryDetailView
      entry={entry}
      onBack={() => navigate('/admin/entries')}
      backLabel="Back to Entry List"
    />
  )
}
