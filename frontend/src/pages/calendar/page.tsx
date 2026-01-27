
import { AppLayout } from '@/components/layout/app-layout'
import { LearningCalendar } from '@/components/calendar/learning-calendar'
import { EntryFormModal } from '@/components/forms/entry-form-modal'
import { useAppSelector } from '@/lib/store/hooks'
import { Navigate } from 'react-router-dom'

export default function CalendarPage() {
  return (
    <AppLayout>
      <CalendarPageContent />
    </AppLayout>
  )
}

function CalendarPageContent() {
  const { user } = useAppSelector((state) => state.auth)

  // Redirect admins to their dashboard
  if (user?.role === 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Learning Calendar</h1>
        <p className="text-muted-foreground">
          Click on any date to log your daily learning activities
        </p>
      </div>

      <LearningCalendar />

      {/* Modals */}
      <EntryFormModal />
    </div>
  )
}
