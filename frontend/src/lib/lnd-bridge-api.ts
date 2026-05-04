/**
 * LND Bridge API Client
 * 
 * Calls the Django bridge endpoints at /api/lnd-bridge/
 * These handle cross-system operations:
 * - ERP employee fetch → ALTS user creation
 * - LMS courses for training plans
 * - Training plan approval workflow
 * - Health check
 */
import api from './api';
import type {
  ERPEmployee,
  CreateUserFromERP,
  LMSCourse,
  LMSUserProgress,
  TrainingPlanRequest,
  CreatePlanRequest,
  ReviewPlanRequest,
  LNDHealthStatus,
} from './lnd-types';

// ============================================================================
// ERP Employee Bridge
// ============================================================================
export const erpBridgeAPI = {
  /** Search ERP employees for user creation */
  searchEmployees: (params?: { search?: string; limit?: number; offset?: number }) =>
    api.get<ERPEmployee[]>('/lnd-bridge/erp-employees/', { params }),

  /** Create ALTS user from selected ERP employee */
  createUserFromERP: (data: CreateUserFromERP) =>
    api.post<{ id: number; email: string; full_name: string; employee_id: string; message: string }>(
      '/lnd-bridge/create-from-erp/', data
    ),
};

// ============================================================================
// LMS Course Bridge (for Training Plans)
// ============================================================================
export const lmsBridgeAPI = {
  /** Fetch LMS courses available for training plan assignment */
  getCourses: (includeCounts = false) =>
    api.get<{ courses: LMSCourse[] }>('/lnd-bridge/lms-courses/', {
      params: { include_counts: includeCounts },
    }),

  /** Fetch a user's LMS course progress */
  getUserProgress: (employeeId: string) =>
    api.get<{ courses: LMSUserProgress[] }>(`/lnd-bridge/lms-progress/${employeeId}/`),
};

// ============================================================================
// Training Plan Approval Workflow
// ============================================================================
export const planRequestsAPI = {
  /** List plan requests (filtered by status) */
  getAll: (params?: { status?: string }) =>
    api.get<TrainingPlanRequest[]>('/lnd-bridge/plan-requests/', { params }),

  /** Create a new plan request */
  create: (data: CreatePlanRequest) =>
    api.post<TrainingPlanRequest>('/lnd-bridge/plan-requests/', data),

  /** PM reviews (approve/reject) a plan request */
  pmReview: (id: number, data: ReviewPlanRequest) =>
    api.patch<TrainingPlanRequest>(`/lnd-bridge/plan-requests/${id}/pm-review/`, data),

  /** LND admin gives final approval/rejection */
  lndReview: (id: number, data: ReviewPlanRequest) =>
    api.patch<TrainingPlanRequest>(`/lnd-bridge/plan-requests/${id}/lnd-review/`, data),
};

// ============================================================================
// Health Check
// ============================================================================
export const lndHealthAPI = {
  check: () => api.get<LNDHealthStatus>('/lnd-bridge/health/'),
};
