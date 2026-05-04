/**
 * LND Bridge API Types
 * 
 * Types for data flowing through the LND bridge endpoints
 * (ERP employees, LMS courses, approval workflow)
 */

// ============================================================================
// ERP Employee Types
// ============================================================================

export interface ERPEmployee {
  employee_id: string;      // e.g. "BS0733"
  name: string;
  email: string;
  department: string;
  designation: string;
  sbu_name: string;
  is_active: boolean;
  joining_date: string | null;
  total_experience: number | null;
  has_alts_account: boolean; // enriched by bridge
}

export interface CreateUserFromERP {
  employee_id: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  sbu_name: string;
  erp_role: string;
  joining_date: string | null;
  total_experience: number | null;
}

// ============================================================================
// LMS Course Types
// ============================================================================

export interface LMSCourse {
  id: number;
  fullname: string;
  shortname: string;
  summary: string;
  categoryname: string;
  startdate: number | null;
  enddate: number | null;
  is_mandatory: boolean;
  enrollment_count?: number;
  active_enrollment_count?: number;
}

export interface LMSUserProgress {
  course_id: number;
  course_name: string;
  progress: number;
  completed: boolean;
  completion_date: string | null;
  last_access: string | null;
}

// ============================================================================
// Approval Workflow Types
// ============================================================================

export type PlanRequestStatus =
  | 'requested'
  | 'pm_approved'
  | 'pm_rejected'
  | 'lnd_approved'
  | 'lnd_rejected'
  | 'active'
  | 'cancelled';

export interface TrainingPlanRequest {
  id: number;
  user: number;
  user_name: string;
  user_email: string;
  plan: number;
  plan_name: string;
  status: PlanRequestStatus;
  initiated_by: 'user' | 'admin';
  request_reason: string;
  pm_reviewer: number | null;
  pm_reviewer_name: string | null;
  pm_reviewed_at: string | null;
  pm_notes: string;
  lnd_reviewer: number | null;
  lnd_reviewer_name: string | null;
  lnd_reviewed_at: string | null;
  lnd_notes: string;
  activated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePlanRequest {
  user_id: number;
  plan_id: number;
  initiated_by: 'user' | 'admin';
  request_reason?: string;
}

export interface ReviewPlanRequest {
  action: 'approve' | 'reject';
  notes?: string;
}

// ============================================================================
// LND Dashboard Types (from LND sidecar, proxied via /api/lnd/)
// ============================================================================

export interface LNDCourse {
  id: number;
  name: string;
  batch_code: string;
  course_type: 'onsite' | 'online' | 'external';
  status: 'planning' | 'upcoming' | 'ongoing' | 'completed';
  start_date: string | null;
  end_date: string | null;
  total_classes: number;
  total_classes_offered: number;
  class_schedule: string;
  location: string;
  cost_per_person: number | null;
  total_cost: number | null;
  enrollment_count: number;
  approved_count: number;
  created_at: string;
  updated_at: string;
}

export interface LNDStudent {
  id: number;
  employee_id: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  is_active: boolean;
  is_onsite: boolean;
  career_start_date: string | null;
  bs_joining_date: string | null;
  bs_experience: number | null;
  total_experience: number | null;
  is_mentor: boolean;
}

export interface LNDEnrollment {
  id: number;
  student_id: number;
  course_id: number;
  approval_status: string;
  is_completed: boolean;
  score: number | null;
  classes_attended: number;
  approved_by: string | null;
  enrollment_date: string;
  completion_date: string | null;
  student?: LNDStudent;
  course?: LNDCourse;
}

export interface LNDDashboardStats {
  total_students: number;
  total_courses: number;
  active_courses: number;
  total_enrollments: number;
  completion_rate: number;
  courses_by_type: Record<string, number>;
  courses_by_status: Record<string, number>;
}

export interface LNDMentor {
  id: number;
  name: string;
  email: string;
  phone: string;
  company: string;
  specialty: string;
  type: 'internal' | 'external';
  student_id: number | null;
  is_active: boolean;
}

export interface LNDHealthStatus {
  lnd_sidecar: 'online' | 'offline';
  proxy_status: string;
}
