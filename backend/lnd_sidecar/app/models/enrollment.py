from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum, Float, Boolean, Text
from sqlalchemy.orm import relationship
from app.db.base import Base
import enum
from datetime import datetime

class EligibilityStatus(str, enum.Enum):
    """Eligibility status enum."""
    PENDING = "Pending"
    ELIGIBLE = "Eligible"
    INELIGIBLE_PREREQUISITE = "Ineligible (Missing Prerequisite)"
    INELIGIBLE_DUPLICATE = "Ineligible (Already Taken)"
    INELIGIBLE_ANNUAL_LIMIT = "Ineligible (Annual Limit)"

class ApprovalStatus(str, enum.Enum):
    """Approval status enum."""
    PENDING = "Pending"
    APPROVED = "Approved"
    REJECTED = "Rejected"
    WITHDRAWN = "Withdrawn"

class CompletionStatus(str, enum.Enum):
    """Completion status enum."""
    NOT_STARTED = "Not Started"
    IN_PROGRESS = "In Progress"
    COMPLETED = "Completed"
    FAILED = "Failed"

class IncomingEnrollment(Base):
    """Staging table for raw form submissions before eligibility checks."""
    __tablename__ = "incoming_enrollments"
    
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(String, index=True, nullable=False)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False)
    sbu = Column(String, nullable=True)
    designation = Column(String, nullable=True)
    course_name = Column(String, nullable=False)
    batch_code = Column(String, nullable=False)
    submitted_at = Column(DateTime, default=datetime.utcnow)
    processed = Column(Boolean, default=False)
    processed_at = Column(DateTime, nullable=True)
    raw_data = Column(Text, nullable=True)  # Store original form data as JSON
    
    def __repr__(self):
        return f"<IncomingEnrollment(id={self.id}, employee_id={self.employee_id}, course={self.course_name})>"

class Enrollment(Base):
    """Main enrollment table with eligibility, approval, and completion tracking."""
    __tablename__ = "enrollments"
    
    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=True, index=True)  # Nullable to preserve history when course is deleted
    
    # Denormalized course info (preserved even when course is deleted)
    course_name = Column(String, nullable=True)  # Store course name for history
    batch_code = Column(String, nullable=True)  # Store batch code for history
    
    # Eligibility
    eligibility_status = Column(Enum(EligibilityStatus), default=EligibilityStatus.PENDING, nullable=False)
    eligibility_reason = Column(String, nullable=True)
    eligibility_checked_at = Column(DateTime, nullable=True)
    
    # Approval
    approval_status = Column(Enum(ApprovalStatus), default=ApprovalStatus.PENDING, nullable=False)
    approved_by = Column(String, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    rejection_reason = Column(String, nullable=True)
    
    # Completion
    completion_status = Column(Enum(CompletionStatus), default=CompletionStatus.NOT_STARTED, nullable=False)
    score = Column(Float, nullable=True)
    attendance_percentage = Column(Float, nullable=True)
    total_attendance = Column(Integer, nullable=True)  # Total attendance sessions
    present = Column(Integer, nullable=True)  # Number of sessions present
    attendance_status = Column(String, nullable=True)  # Status like "5/10" or "Present/Total"
    completion_date = Column(DateTime, nullable=True)
    
    # Audit
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    incoming_enrollment_id = Column(Integer, ForeignKey("incoming_enrollments.id"), nullable=True)
    
    # Relationships
    student = relationship("Student", back_populates="enrollments")
    course = relationship("Course", back_populates="enrollments")
    incoming_enrollment = relationship("IncomingEnrollment")
    
    def __repr__(self):
        return f"<Enrollment(id={self.id}, student_id={self.student_id}, course_id={self.course_id}, status={self.approval_status})>"

