import { Routes, Route } from 'react-router-dom'
import RootLayout from '@/components/layout/RootLayout'
import { AppLayout } from '@/components/layout/app-layout'
import DashboardPage from '@/pages/dashboard/page'
import CalendarPage from '@/pages/calendar/page'
import TrainingPlanPage from '@/pages/training-plan/page'
import ProjectsPage from '@/pages/projects/page'
import ProjectDetailPage from '@/pages/projects/detail'
import UsersPage from '@/pages/admin/users/page'
import EntriesPage from '@/pages/admin/entries/page'
import TopicsPage from '@/pages/admin/topics/page'
import TrainingPlansPage from '@/pages/admin/training-plans/page'
import LeavePage from '@/pages/admin/leave/page'
import AuditLogsPage from '@/pages/admin/audit/page'
import AuditLogDetailsPage from '@/pages/admin/audit/details'
import EntryDetailPage from '@/pages/admin/entries/detail'
import HomePage from '@/pages/page'

function App() {
    return (
        <RootLayout>
            <AppLayout>
                <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/calendar" element={<CalendarPage />} />
                    <Route path="/training-plan" element={<TrainingPlanPage />} />
                    <Route path="/projects" element={<ProjectsPage />} />
                    <Route path="/projects/:id" element={<ProjectDetailPage />} />

                    {/* Admin Routes */}
                    <Route path="/admin/users" element={<UsersPage />} />
                    <Route path="/admin/entries" element={<EntriesPage />} />
                    <Route path="/admin/entries/:id" element={<EntryDetailPage />} />
                    <Route path="/admin/topics" element={<TopicsPage />} />
                    <Route path="/admin/training-plans" element={<TrainingPlansPage />} />
                    <Route path="/admin/leave" element={<LeavePage />} />
                    <Route path="/admin/audit" element={<AuditLogsPage />} />
                    <Route path="/admin/audit/:id" element={<AuditLogDetailsPage />} />
                </Routes>
            </AppLayout>
        </RootLayout>
    )
}

export default App
