/**
 * LND Sidecar API Client
 * 
 * All calls go through /api/lnd/ which Django proxies to FastAPI on port 8001.
 * Uses the same auth interceptor as ALTS (Django JWT via accessToken in localStorage).
 */
import api from './api';
import type {
  LNDCourse,
  LNDStudent,
  LNDEnrollment,
  LNDDashboardStats,
  LNDMentor,
} from './lnd-types';

// ============================================================================
// Dashboard
// ============================================================================
export const lndDashboardAPI = {
  getStats: () =>
    api.get<LNDDashboardStats>('/lnd/enrollments/dashboard/stats'),
};

// ============================================================================
// Courses
// ============================================================================
export const lndCoursesAPI = {
  getAll: (params?: { status?: string; course_type?: string }) =>
    api.get<LNDCourse[]>('/lnd/courses/', { params }),

  getById: (id: number | string) =>
    api.get<LNDCourse>(`/lnd/courses/${id}`),

  create: (data: Partial<LNDCourse>) =>
    api.post<LNDCourse>('/lnd/courses', data),

  update: (id: number | string, data: Partial<LNDCourse>) =>
    api.put<LNDCourse>(`/lnd/courses/${id}`, data),

  delete: (id: number | string) =>
    api.delete(`/lnd/courses/${id}`),

  approve: (id: number | string, approvedBy: string) =>
    api.post(`/lnd/courses/${id}/approve`, null, { params: { approved_by: approvedBy } }),

  getComments: (id: number | string) =>
    api.get(`/lnd/courses/${id}/comments`),

  addComment: (id: number | string, data: { content: string; author_name: string }) =>
    api.post(`/lnd/courses/${id}/comments`, data),

  generateReport: (id: number | string, startDate?: string, endDate?: string) =>
    api.get(`/lnd/courses/${id}/report`, {
      responseType: 'blob',
      params: { start_date: startDate, end_date: endDate },
    }),

  generateOverallReport: (courseType: string, startDate?: string, endDate?: string) =>
    api.get('/lnd/courses/report/overall', {
      responseType: 'blob',
      params: { course_type: courseType, start_date: startDate, end_date: endDate },
    }),
};

// ============================================================================
// Enrollments
// ============================================================================
export const lndEnrollmentsAPI = {
  getAll: (params?: { course_id?: number; student_id?: number; approval_status?: string }) =>
    api.get<LNDEnrollment[]>('/lnd/enrollments', { params }),

  getEligible: (params?: { course_id?: number }) =>
    api.get<LNDEnrollment[]>('/lnd/enrollments/eligible', { params }),

  create: (data: { student_id: number; course_id: number }) =>
    api.post<LNDEnrollment>('/lnd/enrollments', data),

  approve: (data: { enrollment_ids: number[]; approved_by: string }) =>
    api.post('/lnd/enrollments/approve', { enrollment_ids: data.enrollment_ids }, {
      params: { approved_by: data.approved_by },
    }),

  withdraw: (id: number, reason: string, withdrawnBy: string) =>
    api.post(`/lnd/enrollments/${id}/withdraw`, null, {
      params: { withdrawal_reason: reason, withdrawn_by: withdrawnBy },
    }),
};

// ============================================================================
// Students (LND employees)
// ============================================================================
export const lndStudentsAPI = {
  getAll: (params?: { department?: string; is_active?: boolean; limit?: number; skip?: number }) =>
    api.get<LNDStudent[]>('/lnd/students', { params }),

  getById: (id: number) =>
    api.get<LNDStudent>(`/lnd/students/${id}`),

  getEnrollments: (id: number) =>
    api.get(`/lnd/students/${id}/enrollments`),

  getDepartments: (params?: { is_active?: boolean }) =>
    api.get<{ departments: string[] }>('/lnd/students/departments', { params }),

  getCount: (params?: { is_active?: boolean }) =>
    api.get<{ count: number }>('/lnd/students/count', { params }),

  generateReport: (id: number, startDate?: string, endDate?: string) =>
    api.get(`/lnd/students/${id}/report`, {
      responseType: 'blob',
      params: { start_date: startDate, end_date: endDate },
    }),

  generateOverallReport: (startDate?: string, endDate?: string) =>
    api.get('/lnd/students/report/overall', {
      responseType: 'blob',
      params: { start_date: startDate, end_date: endDate },
    }),
};

// ============================================================================
// Mentors
// ============================================================================
export const lndMentorsAPI = {
  getAll: (type: 'all' | 'internal' | 'external' = 'all') =>
    api.get<LNDMentor[]>('/lnd/mentors', { params: { type } }),

  getById: (id: number) =>
    api.get<LNDMentor>(`/lnd/mentors/${id}`),

  create: (data: Partial<LNDMentor>) =>
    api.post<LNDMentor>('/lnd/mentors', data),

  update: (id: number, data: Partial<LNDMentor>) =>
    api.put<LNDMentor>(`/lnd/mentors/${id}`, data),

  delete: (id: number) =>
    api.delete(`/lnd/mentors/${id}`),

  getStats: (id: number) =>
    api.get(`/lnd/mentors/${id}/stats`),
};

// ============================================================================
// LMS (through LND sidecar)
// ============================================================================
export const lndLmsAPI = {
  getCourses: (includeEnrollmentCounts = false) =>
    api.get('/lnd/lms/courses', { params: { include_enrollment_counts: includeEnrollmentCounts } }),

  getCourseEnrollments: (courseId: number | string) =>
    api.get(`/lnd/lms/courses/${courseId}/enrollments`),

  generateReport: (courseId: number | string, startDate?: string, endDate?: string) =>
    api.get(`/lnd/lms/courses/${courseId}/report`, {
      responseType: 'blob',
      params: { start_date: startDate, end_date: endDate },
    }),

  generateOverallReport: (startDate?: string, endDate?: string) =>
    api.get('/lnd/lms/report/overall', {
      responseType: 'blob',
      params: { start_date: startDate, end_date: endDate },
    }),
};

// ============================================================================
// Imports / Completions
// ============================================================================
export const lndImportsAPI = {
  uploadExcel: (file: File, courseId: number | string) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/lnd/imports/excel?course_id=${courseId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  uploadCSV: (file: File, courseId: number | string) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/lnd/imports/csv?course_id=${courseId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};
