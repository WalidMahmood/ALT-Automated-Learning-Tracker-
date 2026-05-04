import { Routes, Route } from 'react-router-dom'
import RootLayout from '@/components/layout/RootLayout'
import { AppLayout } from '@/components/layout/app-layout'
import DashboardPage from '@/pages/dashboard/page'
import CalendarPage from '@/pages/calendar/page'
import TrainingPlanPage from '@/pages/training-plan/page'
import ProjectsPage from '@/pages/projects/page'
import ProjectDetailPage from '@/pages/projects/detail'
import ReportsPage from '@/pages/reports/page'
import UsersPage from '@/pages/admin/users/page'
import EntriesPage from '@/pages/admin/entries/page'
import TopicsPage from '@/pages/admin/topics/page'
import TemplateGalleryPage from '@/pages/admin/training-plans/templates'
import TrainingPlansPage from '@/pages/admin/training-plans/page'
import TrainingPlanDetailPage from '@/pages/admin/training-plans/detail'
import LeavePage from '@/pages/admin/leave/page'
import AdminProjectsPage from '@/pages/admin/projects/page'


import AuditLogsPage from '@/pages/admin/audit/page'
import AuditLogDetailsPage from '@/pages/admin/audit/details'
import EntryDetailPage from '@/pages/admin/entries/detail'

import HomePage from '@/pages/page'
import ProfilePage from '@/pages/profile/page'

// ── LND Dashboard Pages ─────────────────────────────────────────────
import LndDashboardPage from '@/pages/admin/lnd/dashboard/page'
import LndCoursesPage from '@/pages/admin/lnd/courses/page'
import LndEmployeesPage from '@/pages/admin/lnd/employees/page'
import LndMentorsPage from '@/pages/admin/lnd/mentors/page'
import LndReportsPage from '@/pages/admin/lnd/reports/page'

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
                    <Route path="/reports" element={<ReportsPage />} />
                    <Route path="/profile" element={<ProfilePage />} />

                    {/* Admin Routes */}
                    <Route path="/admin/users" element={<UsersPage />} />
                    <Route path="/admin/users/:id" element={<ProfilePage />} />
                    <Route path="/admin/entries" element={<EntriesPage />} />
                    <Route path="/admin/entries/:id" element={<EntryDetailPage />} />
                    <Route path="/admin/topics" element={<TopicsPage />} />
                    <Route path="/admin/training-plans" element={<TrainingPlansPage />} />
                    <Route path="/admin/training-plans/templates" element={<TemplateGalleryPage />} />

                    <Route path="/admin/training-plans/:id" element={<TrainingPlanDetailPage />} />
                    <Route path="/admin/training-plans/:id/user/:userId" element={<TrainingPlanDetailPage />} />
                    <Route path="/admin/leave" element={<LeavePage />} />
                    <Route path="/admin/projects" element={<AdminProjectsPage />} />
                    <Route path="/admin/audit" element={<AuditLogsPage />} />
                    <Route path="/admin/audit/:id" element={<AuditLogDetailsPage />} />

                    {/* ── L&D Planning Routes (Admin Only) ──────────── */}
                    <Route path="/admin/lnd" element={<LndDashboardPage />} />
                    <Route path="/admin/lnd/courses" element={<LndCoursesPage />} />
                    <Route path="/admin/lnd/courses/:type/:status" element={<LndCoursesPage />} />
                    <Route path="/admin/lnd/employees" element={<LndEmployeesPage />} />
                    <Route path="/admin/lnd/mentors" element={<LndMentorsPage />} />
                    <Route path="/admin/lnd/reports" element={<LndReportsPage />} />
                </Routes>
            </AppLayout>
        </RootLayout>
    )
}

export default App
