// User Types
export type UserRole = 'learner' | 'admin'

export interface User {
  id: number
  email: string
  full_name: string | null
  name: string
  github_url: string | null
  experience_years: number
  tech_stack: string[]
  primary_domain?: string
  role: UserRole
  is_active: boolean
  is_superuser: boolean
  created_at: string
  updated_at: string
}

// Topic Types (Hierarchical)
export interface Topic {
  id: number
  name: string
  parent_id: number | null
  depth: number
  difficulty?: number // 1-5 (optional in admin lite response)
  benchmark_hours: number
  domain?: string
  language?: string | null
  mastery?: {
    progress: number
    is_locked: boolean
    total_hours: number
    lock_reason: string | null
  } | null
  is_active: boolean
  children?: Topic[]
  created_at: string
  updated_at?: string
}

// Entry Status Types
export type EntryStatus = 'pending' | 'approved' | 'rejected' | 'flagged'
export type AIDecision = 'approve' | 'flag' | 'pending' | 'reject' | 'clarify'
export type EntryIntent = 'lnd_tasks' | 'sbu_tasks'

// v4.0 Structured Chain-of-Thought per node
export interface NodeResult {
  summary: string
  score: number | null
  path: 'logic' | 'ai' | 'breaker' | 'skipped'
  path_reason?: string
  details: string | Record<string, any>
  llm_raw_response?: string | null
  // v8.0 Structured reasoning fields (optional — absent in old DB entries)
  verdict?: string | null
  evidence?: string | null
  llm_reasoning?: string | null
  rag_analysis?: string | null
  guards?: string[]
  remaining?: string[] | null
}

export interface FinalDecisionResult extends NodeResult {
  confidence: number
  decision: string
  reason: string
  scores: { time: number; quality: number; relevance: number }
  weights: { time: number; quality: number; relevance: number } | null
  blocker_boost: number
  penalty: string
  node_verdicts?: { time: string; content: string; progress: string }
}

export interface ChainOfThought {
  context_analysis?: NodeResult
  rag_context?: NodeResult  // v7.0: RAG Knowledge node
  time_analysis?: NodeResult
  content_analysis?: NodeResult
  progress_analysis?: NodeResult
  final_decision?: FinalDecisionResult
  // Legacy fallback
  [key: string]: any
}

// Project Feature Types
export interface ProjectFeature {
  id: number
  project: number
  name: string
  description: string
  success_criteria: string
  out_of_scope: string[]
  status: 'not_started' | 'in_progress' | 'completed'
  completed_at: string | null
  created_at: string
}

// Project Types
export interface Project {
  id: number
  created_by?: number
  created_by_email?: string
  assigned_users: { id: number; email: string; full_name: string | null; role: string }[]
  module_status: { module: string; status: 'untouched' | 'in_progress' | 'completed'; entry_count: number; total_hours: number; users: string[] }[]
  features?: ProjectFeature[]
  name: string
  description: string
  key_modules: string[]
  out_of_scope: string[]
  tech_stack: string
  tech_frontend?: string
  tech_backend?: string
  tech_database?: string
  tech_cloud?: string
  success_criteria: string
  repo_url?: string
  start_date: string | null
  end_date: string | null
  is_completed: boolean
  is_active: boolean
  entry_count: number
  latest_date: string | null
  created_at: string
  updated_at: string
}

export interface ProjectDetail extends Project {
  entries: ProjectEntry[]
}

export interface ProjectEntry {
  id: number
  user: number
  user_email?: string
  date: string
  hours: number
  learned_text: string
  blockers_text: string | null
  progress_percent: number
  is_completed: boolean
  learning_status?: 'in_progress' | 'completed'
  intent: EntryIntent
  target_module: string | null
  feature_status: 'in_progress' | 'completed' | null
  status: EntryStatus
  ai_status: string
  ai_decision: AIDecision | null
  ai_confidence: number | null
  created_at: string
}

// Entry Types
export interface Entry {
  id: number
  user: number
  user_email?: string
  date: string
  topic: number | null
  topic_details?: Topic
  intent: EntryIntent
  project: number | null
  project_details?: Project
  project_name: string | null
  project_description: string | null
  hours: number
  learned_text: string
  progress_percent: number
  is_completed: boolean
  learning_status?: 'in_progress' | 'completed'
  blockers_text: string | null
  target_module: string | null
  feature_status: 'in_progress' | 'completed' | null
  // Git Commit Validation (Phase 2)
  is_non_coding: boolean
  git_validation_result: 'pending' | 'match' | 'partial' | 'no_match' | 'skipped'
  git_score_adjustment: number
  git_evidence: Record<string, any> | null
  // AI Analysis Fields
  ai_status: 'pending' | 'analyzed' | 'error' | 'timeout'
  ai_decision: AIDecision | null
  ai_confidence: number | null // 0-100
  ai_chain_of_thought: ChainOfThought | null
  ai_analyzed_at: string | null
  // Status & Override
  status: EntryStatus
  admin_override: boolean
  override_reason: string | null
  override_comment: string | null
  override_at: string | null
  admin_id: number | null
  admin?: User
  extra_learning?: any[]
  created_at: string
  updated_at: string
}


// Training Plans
export interface TrainingPlan {
  id: number
  plan_name: string
  description: string | null
  is_active: boolean
  is_archived: boolean
  source_template?: string | null
  target_role?: string | null
  // Full view fields
  plan_topics?: PlanTopic[]
  assignments?: PlanAssignment[]
  edges?: PlanTopicEdge[]
  // List view fields
  topic_count?: number
  assignment_count?: number
  created_at: string
  updated_at: string
}

export interface PlanTopic {
  id: number
  plan_id: number
  topic_id: number
  topic?: Topic
  sequence_order: number
  expected_hours: number
  node_type: 'topic' | 'section'
}

export interface PlanTopicEdge {
  id: number
  plan_id: number
  source_topic_id: number
  target_topic_id: number
}

export interface PlanAssignment {
  id: number
  plan: number
  user_id: number
  user?: User
  assigned_by_admin_id: number | null
  assigned_at: string
}

// Roadmap Template Types (static data)
export interface RoadmapTopicChild {
  name: string
  benchmarkHours: number
  difficulty: number
}

export interface RoadmapTopic {
  name: string
  benchmarkHours: number
  difficulty: number
  children?: RoadmapTopicChild[]
}

export interface RoadmapSection {
  id: string
  name: string
  topics: RoadmapTopic[]
  dependsOn?: string[]
}

export interface RoadmapTemplate {
  id: string
  name: string
  category: 'role' | 'skill'
  description: string
  icon: string
  estimatedHours: number
  sections: RoadmapSection[]
}

// Leave Request Types
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface LeaveRequest {
  id: number
  user: number
  user_email?: string
  user_name?: string
  start_date: string
  end_date: string
  status: LeaveStatus
  admin_id: number | null
  admin_comment: string | null
  requested_at: string
  reviewed_at: string | null
}

// Audit Log Types
// Audit Log Types
export type AuditAction = string

export interface AuditLog {
  id: number
  user_id: number | null // Use this if your backend sends user_id separately
  user_email?: string
  user?: number | User // Can be ID or object depending on serializer
  target_user_email?: string
  action: AuditAction
  entity_type: string
  entity_id: string | number // Changed to allow string IDs if needed (e.g. usernames)
  target_entity?: string // Who was affected by this action
  status?: string // Added
  metadata?: Record<string, any> // Added
  request_id?: string // Added
  before_state: Record<string, unknown> | null
  after_state: Record<string, unknown> | null
  reason: string | null
  comment: string | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

// Form Types
export interface EntryFormData {
  date: string
  intent: EntryIntent
  topic_id: number | null
  project_id: number | null
  project_name: string
  project_description: string
  hours: string // HH:MM format
  learned_text: string
  progress_percent: number
  is_completed: boolean
  blockers_text: string
  target_module: string | null
  feature_status: 'in_progress' | 'completed'
  is_non_coding: boolean
}


export interface LeaveRequestFormData {
  date: string
}

// Dashboard Types
export interface DashboardStats {
  total_entries: number
  pending_entries: number
  flagged_entries: number
  approved_entries: number
  pending_leaves: number
  total_learners: number
  total_hours_logged: number
}

export interface TopicAnalytics {
  topic_id: number
  topic_name: string
  total_entries: number
  total_hours: number
  avg_hours: number
  flagged_count: number
  learner_count: number
}

// Override Reasons
export const OVERRIDE_REASONS = [
  'Time estimate accurate - AI misjudged complexity',
  'Valid context provided - justified duration',
  'Technical issues confirmed - extra time valid',
  'Learner explanation accepted',
  'Invalid entry - reject',
  'Other (see comment)',
] as const

export type OverrideReason = (typeof OVERRIDE_REASONS)[number]

// Blocker Types
export const BLOCKER_TYPES = [
  'Technical',
  'Environmental',
  'Personal',
  'Resource',
  'Other',
] as const

export type BlockerType = (typeof BLOCKER_TYPES)[number]

// Calendar View Types
export type CalendarView = 'month' | 'week' | 'day'

export interface CalendarDay {
  date: string
  entries: Entry[]
  leaveRequest: LeaveRequest | null
  isCurrentMonth: boolean
  isToday: boolean
}
