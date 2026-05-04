from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.models.enrollment import EligibilityStatus, ApprovalStatus, CompletionStatus

class EnrollmentResponse(BaseModel):
    id: int
    student_id: int
    course_id: Optional[int]  # Nullable to preserve history when course is deleted
    eligibility_status: EligibilityStatus
    eligibility_reason: Optional[str]
    eligibility_checked_at: Optional[datetime]
    approval_status: ApprovalStatus
    approved_by: Optional[str]
    approved_at: Optional[datetime]
    rejection_reason: Optional[str]
    completion_status: CompletionStatus
    score: Optional[float]
    attendance_percentage: Optional[float]
    total_attendance: Optional[int]
    present: Optional[int]
    attendance_status: Optional[str]
    completion_date: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    
    # Related data
    student_name: Optional[str] = None
    student_email: Optional[str] = None
    student_department: Optional[str] = None
    student_employee_id: Optional[str] = None
    student_designation: Optional[str] = None
    student_experience_years: Optional[int] = None
    course_name: Optional[str] = None
    batch_code: Optional[str] = None
    course_description: Optional[str] = None
    overall_completion_rate: Optional[float] = None
    total_courses_assigned: Optional[int] = None
    completed_courses: Optional[int] = None
    
    # Additional student details for User Profile
    sbu_head_employee_id: Optional[str] = None
    sbu_head_name: Optional[str] = None
    reporting_manager_employee_id: Optional[str] = None
    reporting_manager_name: Optional[str] = None
    student_bs_joining_date: Optional[datetime] = None
    student_total_experience: Optional[float] = None
    student_career_start_date: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class EnrollmentApproval(BaseModel):
    enrollment_id: int
    approved: bool
    rejection_reason: Optional[str] = None

class EnrollmentBulkApproval(BaseModel):
    enrollment_ids: List[int]
    approved: bool

class EnrollmentCreate(BaseModel):
    student_id: int
    course_id: int

class CompletionUpload(BaseModel):
    enrollment_id: int
    score: Optional[float] = None
    attendance_percentage: Optional[float] = None
    completion_status: CompletionStatus

class CompletionBulkUpload(BaseModel):
    completions: List[CompletionUpload]

