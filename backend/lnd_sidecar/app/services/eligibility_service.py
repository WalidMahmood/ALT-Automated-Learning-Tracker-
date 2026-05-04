from sqlalchemy.orm import Session
from sqlalchemy import or_
from datetime import datetime, date
from typing import Tuple, Optional
from app.models.enrollment import Enrollment, EligibilityStatus
from app.models.course import Course
from app.models.student import Student

class EligibilityService:
    """Service for running eligibility checks on enrollments."""
    
    @staticmethod
    def check_prerequisite(db: Session, student_id: int, course_id: int) -> Tuple[bool, Optional[str]]:
        """
        Check if student has PASSED (APPROVED and COMPLETED) prerequisite course.
        This is strictly pass basis - student must have been approved and completed the prerequisite.
        Returns (is_eligible, reason_if_ineligible)
        """
        from app.models.enrollment import ApprovalStatus, CompletionStatus
        
        course = db.query(Course).filter(Course.id == course_id).first()
        if not course or not course.prerequisite_course_id:
            return True, None
        
        # Get prerequisite course name first (for matching and error message)
        prerequisite_course = db.query(Course).filter(Course.id == course.prerequisite_course_id).first()
        prerequisite_name = prerequisite_course.name if prerequisite_course else "Unknown"
        
        # Check if student has APPROVED and COMPLETED the prerequisite course
        # Must match by course_id (if course exists) or by course_name (if course was deleted)
        prerequisite_enrollment = db.query(Enrollment).filter(
            Enrollment.student_id == student_id,
            Enrollment.approval_status == ApprovalStatus.APPROVED,  # Must be approved
            Enrollment.completion_status == CompletionStatus.COMPLETED,  # Must be completed (passed)
            or_(
                Enrollment.course_id == course.prerequisite_course_id,  # Match by course_id
                Enrollment.course_name == prerequisite_name  # Match by course_name (for deleted courses)
            )
        ).first()
        
        if not prerequisite_enrollment:
            return False, f"Missing prerequisite: {prerequisite_name} (must have passed this course)"
        
        return True, None
    
    @staticmethod
    def check_duplicate(db: Session, student_id: int, course_id: int) -> Tuple[bool, Optional[str]]:
        """
        Check if student has already taken this course (by course name, not batch).
        Considers both COMPLETED and FAILED enrollments as "already taken".
        Only checks APPROVED enrollments (excludes PENDING, REJECTED, WITHDRAWN).
        Returns (is_eligible, reason_if_ineligible)
        """
        from app.models.enrollment import ApprovalStatus, CompletionStatus
        
        # Get the course they're trying to enroll in
        target_course = db.query(Course).filter(Course.id == course_id).first()
        if not target_course:
            return True, None
        
        # Check for any existing APPROVED enrollment in a course with the same name
        # (different batches of the same course should be considered duplicates)
        # Use course_name from enrollment if course is deleted, otherwise use Course.name
        existing_enrollments = db.query(Enrollment).outerjoin(Course).filter(
            Enrollment.student_id == student_id,
            Enrollment.approval_status == ApprovalStatus.APPROVED,  # Only check approved enrollments
            Enrollment.course_id != course_id,  # Exclude the current enrollment if checking an update
            # Match by course name (either from course relationship or stored course_name)
            or_(
                Course.name == target_course.name,
                Enrollment.course_name == target_course.name
            )
        ).all()
        
        if existing_enrollments:
            # Check completion status to provide specific message
            # All approved enrollments count as "already enrolled" regardless of completion status
            completed_enrollment = next(
                (e for e in existing_enrollments if e.completion_status == CompletionStatus.COMPLETED),
                None
            )
            failed_enrollment = next(
                (e for e in existing_enrollments if e.completion_status == CompletionStatus.FAILED),
                None
            )
            
            if completed_enrollment:
                return False, f"Already completed a batch of {target_course.name}"
            elif failed_enrollment:
                return False, f"Already taken a batch of {target_course.name} (failed)"
            else:
                # Enrolled but not completed/failed yet (NOT_STARTED or IN_PROGRESS)
                return False, f"Already enrolled in a batch of {target_course.name}"
        
        return True, None
    
    @staticmethod
    def check_annual_limit(db: Session, student_id: int, course_id: int) -> Tuple[bool, Optional[str]]:
        """
        Check if student has already taken another physical course this year.
        Checks APPROVED enrollments that are either COMPLETED or FAILED.
        Uses approval date (or created_at as fallback) to determine the year.
        Returns (is_eligible, reason_if_ineligible)
        """
        from app.models.enrollment import ApprovalStatus, CompletionStatus
        
        current_year = date.today().year
        
        # Get all APPROVED enrollments that are COMPLETED or FAILED for this student
        # Use outerjoin to handle deleted courses, and check stored course_name
        # The determining factor is being APPROVED, regardless of pass/fail
        taken_this_year = db.query(Enrollment).outerjoin(Course).filter(
            Enrollment.student_id == student_id,
            Enrollment.approval_status == ApprovalStatus.APPROVED,  # Only check approved enrollments
            Enrollment.completion_status.in_([CompletionStatus.COMPLETED, CompletionStatus.FAILED]),
            Enrollment.course_id != course_id  # Exclude the current course
        ).all()
        
        # Check if any enrollment was approved this year and is a different course
        for enrollment in taken_this_year:
            # Use approved_at if available (approval is the determining factor), otherwise use created_at
            enrollment_date = enrollment.approved_at if enrollment.approved_at else enrollment.created_at
            
            if enrollment_date and enrollment_date.year == current_year:
                # Get course name (from course relationship or stored course_name)
                course_name = enrollment.course_name
                if not course_name and enrollment.course:
                    course_name = enrollment.course.name
                if not course_name:
                    course_name = "Unknown"
                
                status_text = "completed" if enrollment.completion_status == CompletionStatus.COMPLETED else "taken"
                return False, f"Already {status_text} another physical course this year: {course_name}"
        
        return True, None
    
    @staticmethod
    def run_all_checks(db: Session, student_id: int, course_id: int) -> Tuple[EligibilityStatus, Optional[str]]:
        """
        Run all three eligibility checks and return the final status.
        Returns (eligibility_status, reason)
        """
        # Check prerequisite
        eligible, reason = EligibilityService.check_prerequisite(db, student_id, course_id)
        if not eligible:
            return EligibilityStatus.INELIGIBLE_PREREQUISITE, reason
        
        # Check duplicate
        eligible, reason = EligibilityService.check_duplicate(db, student_id, course_id)
        if not eligible:
            return EligibilityStatus.INELIGIBLE_DUPLICATE, reason
        
        # Check annual limit
        eligible, reason = EligibilityService.check_annual_limit(db, student_id, course_id)
        if not eligible:
            return EligibilityStatus.INELIGIBLE_ANNUAL_LIMIT, reason
        
        # All checks passed
        return EligibilityStatus.ELIGIBLE, None

