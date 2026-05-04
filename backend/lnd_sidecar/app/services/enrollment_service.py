from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional, Dict, Any
from datetime import datetime
from app.models.enrollment import Enrollment, ApprovalStatus, CompletionStatus, EligibilityStatus
from app.models.course import Course
from app.models.student import Student
from app.schemas.enrollment import EnrollmentCreate, EnrollmentApproval, EnrollmentBulkApproval, EnrollmentResponse
from app.services.eligibility_service import EligibilityService

class EnrollmentService:
    @staticmethod
    def get_enrollments(
        db: Session,
        course_id: Optional[int] = None,
        student_id: Optional[int] = None,
        eligibility_status: Optional[str] = None,
        approval_status: Optional[str] = None,
        department: Optional[str] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[EnrollmentResponse]:
        """Get enrollments with optional filters and enriched data."""
        query = db.query(Enrollment)
        
        if course_id:
            query = query.filter(Enrollment.course_id == course_id)
        if student_id:
            query = query.filter(Enrollment.student_id == student_id)
        if eligibility_status:
            query = query.filter(Enrollment.eligibility_status == eligibility_status)
        if approval_status:
            query = query.filter(Enrollment.approval_status == approval_status)
        if department:
            query = query.join(Student).filter(Student.department == department)
        
        enrollments = query.offset(skip).limit(limit).all()
        
        return [EnrollmentService._enrich_enrollment(db, e) for e in enrollments]

    @staticmethod
    def get_eligible_enrollments(
        db: Session,
        course_id: Optional[int] = None,
        department: Optional[str] = None
    ) -> List[EnrollmentResponse]:
        """Get eligible enrollments pending approval."""
        query = db.query(Enrollment).filter(
            Enrollment.eligibility_status == "Eligible",
            Enrollment.approval_status == ApprovalStatus.PENDING
        )
        
        if course_id:
            query = query.filter(Enrollment.course_id == course_id)
        if department:
            query = query.join(Student).filter(Student.department == department)
        
        enrollments = query.all()
        return [EnrollmentService._enrich_enrollment(db, e) for e in enrollments]

    @staticmethod
    def approve_enrollment(db: Session, approval: EnrollmentApproval, approved_by: str) -> EnrollmentResponse:
        """Approve or reject a single enrollment."""
        enrollment = db.query(Enrollment).filter(Enrollment.id == approval.enrollment_id).first()
        if not enrollment:
            raise ValueError("Enrollment not found")
        
        if approval.approved:
            course = db.query(Course).filter(Course.id == enrollment.course_id).first()
            if course.current_enrolled >= course.seat_limit:
                raise ValueError("No available seats")
            
            enrollment.approval_status = ApprovalStatus.APPROVED
            enrollment.approved_by = approved_by
            enrollment.approved_at = datetime.utcnow()
            course.current_enrolled += 1
        else:
            enrollment.approval_status = ApprovalStatus.REJECTED
            enrollment.rejection_reason = approval.rejection_reason
        
        db.commit()
        db.refresh(enrollment)
        return EnrollmentService._enrich_enrollment(db, enrollment)

    @staticmethod
    def bulk_approve_enrollments(db: Session, bulk_approval: EnrollmentBulkApproval, approved_by: str) -> Dict[str, Any]:
        """Bulk approve multiple enrollments."""
        enrollments = db.query(Enrollment).filter(
            Enrollment.id.in_(bulk_approval.enrollment_ids)
        ).all()
        
        if len(enrollments) != len(bulk_approval.enrollment_ids):
            raise ValueError("Some enrollments not found")
        
        results = {"approved": 0, "rejected": 0, "errors": []}
        
        for enrollment in enrollments:
            try:
                if enrollment.eligibility_status != "Eligible":
                    results["errors"].append({
                        "enrollment_id": enrollment.id,
                        "error": f"Not eligible: {enrollment.eligibility_status}"
                    })
                    continue
                
                if bulk_approval.approved:
                    course = db.query(Course).filter(Course.id == enrollment.course_id).first()
                    if course.current_enrolled >= course.seat_limit:
                        results["errors"].append({
                            "enrollment_id": enrollment.id,
                            "error": "No available seats"
                        })
                        continue
                    
                    enrollment.approval_status = ApprovalStatus.APPROVED
                    enrollment.approved_by = approved_by
                    enrollment.approved_at = datetime.utcnow()
                    course.current_enrolled += 1
                    results["approved"] += 1
                else:
                    enrollment.approval_status = ApprovalStatus.REJECTED
                    results["rejected"] += 1
            except Exception as e:
                results["errors"].append({
                    "enrollment_id": enrollment.id,
                    "error": str(e)
                })
        
        db.commit()
        return results

    @staticmethod
    def withdraw_enrollment(db: Session, enrollment_id: int, withdrawal_reason: str, withdrawn_by: str) -> EnrollmentResponse:
        """Withdraw a student from a course."""
        enrollment = db.query(Enrollment).filter(Enrollment.id == enrollment_id).first()
        if not enrollment:
            raise ValueError("Enrollment not found")
        
        if enrollment.approval_status == ApprovalStatus.WITHDRAWN:
            raise ValueError("Enrollment already withdrawn")
        
        if enrollment.approval_status != ApprovalStatus.APPROVED:
            raise ValueError(f"Cannot withdraw enrollment with status: {enrollment.approval_status}")
        
        enrollment.approval_status = ApprovalStatus.WITHDRAWN
        enrollment.rejection_reason = withdrawal_reason
        enrollment.approved_by = withdrawn_by
        enrollment.approved_at = datetime.utcnow()
        
        course = db.query(Course).filter(Course.id == enrollment.course_id).first()
        if course.current_enrolled > 0:
            course.current_enrolled -= 1
        
        db.commit()
        db.refresh(enrollment)
        return EnrollmentService._enrich_enrollment(db, enrollment)

    @staticmethod
    def reapprove_enrollment(db: Session, enrollment_id: int, approved_by: str) -> EnrollmentResponse:
        """Reapprove a previously withdrawn enrollment."""
        enrollment = db.query(Enrollment).filter(Enrollment.id == enrollment_id).first()
        if not enrollment:
            raise ValueError("Enrollment not found")
        
        if enrollment.approval_status != ApprovalStatus.WITHDRAWN:
            raise ValueError(f"Cannot reapprove enrollment with status: {enrollment.approval_status}")
        
        course = db.query(Course).filter(Course.id == enrollment.course_id).first()
        if course.current_enrolled >= course.seat_limit:
            raise ValueError("No available seats")
        
        enrollment.approval_status = ApprovalStatus.APPROVED
        enrollment.approved_by = approved_by
        enrollment.approved_at = datetime.utcnow()
        enrollment.rejection_reason = None
        
        course.current_enrolled += 1
        
        db.commit()
        db.refresh(enrollment)
        return EnrollmentService._enrich_enrollment(db, enrollment)

    @staticmethod
    def create_enrollment(db: Session, enrollment_data: EnrollmentCreate) -> EnrollmentResponse:
        """Manually create a new enrollment."""
        student = db.query(Student).filter(Student.id == enrollment_data.student_id).first()
        if not student:
            raise ValueError("Student not found")
        
        course = db.query(Course).filter(Course.id == enrollment_data.course_id).first()
        if not course:
            raise ValueError("Course not found")
        
        existing = db.query(Enrollment).filter(
            Enrollment.student_id == enrollment_data.student_id,
            Enrollment.course_id == enrollment_data.course_id
        ).first()
        
        if existing:
            raise ValueError(f"Enrollment already exists for {student.name} in {course.name}")
        
        eligibility_status, reason = EligibilityService.run_all_checks(
            db, enrollment_data.student_id, enrollment_data.course_id
        )
        
        if eligibility_status == EligibilityStatus.ELIGIBLE:
            if course.current_enrolled >= course.seat_limit:
                approval_status = ApprovalStatus.PENDING
                approved_by = None
                approved_at = None
            else:
                approval_status = ApprovalStatus.APPROVED
                approved_by = "Admin (Manual Enrollment)"
                approved_at = datetime.utcnow()
                course.current_enrolled += 1
        else:
            approval_status = ApprovalStatus.PENDING
            approved_by = None
            approved_at = None
        
        enrollment = Enrollment(
            student_id=enrollment_data.student_id,
            course_id=enrollment_data.course_id,
            course_name=course.name,
            batch_code=course.batch_code,
            eligibility_status=eligibility_status,
            eligibility_reason=reason,
            eligibility_checked_at=datetime.utcnow(),
            approval_status=approval_status,
            approved_by=approved_by,
            approved_at=approved_at
        )
        
        db.add(enrollment)
        db.commit()
        db.refresh(enrollment)
        return EnrollmentService._enrich_enrollment(db, enrollment)

    @staticmethod
    def get_dashboard_stats(db: Session) -> Dict[str, int]:
        """Get dashboard statistics."""
        active_employees_count = db.query(Student).filter(Student.is_active == True).count()
        previous_employees_count = db.query(Student).filter(Student.is_active == False).count()
        
        active_courses_count = db.query(Course).filter(Course.is_archived == False).count()
        archived_courses_count = db.query(Course).filter(Course.is_archived == True).count()
        
        total_enrollments_count = db.query(Enrollment).count()
        
        approved_enrollments_count = db.query(Enrollment).filter(
            Enrollment.approval_status == ApprovalStatus.APPROVED
        ).count()
        
        pending_enrollments_count = db.query(Enrollment).filter(
            Enrollment.approval_status == ApprovalStatus.PENDING
        ).count()
        
        withdrawn_enrollments_count = db.query(Enrollment).filter(
            Enrollment.approval_status == ApprovalStatus.WITHDRAWN
        ).count()
        
        completed_enrollments_count = db.query(Enrollment).filter(
            Enrollment.approval_status == ApprovalStatus.APPROVED,
            Enrollment.completion_status == CompletionStatus.COMPLETED
        ).count()
        
        not_eligible_enrollments_count = db.query(Enrollment).filter(
            Enrollment.eligibility_status.in_([
                EligibilityStatus.INELIGIBLE_PREREQUISITE,
                EligibilityStatus.INELIGIBLE_DUPLICATE,
                EligibilityStatus.INELIGIBLE_ANNUAL_LIMIT
            ]),
            Enrollment.approval_status != ApprovalStatus.APPROVED,
            Enrollment.approval_status != ApprovalStatus.WITHDRAWN
        ).count()
        
        return {
            "active_employees": active_employees_count,
            "previous_employees": previous_employees_count,
            "active_courses": active_courses_count,
            "archived_courses": archived_courses_count,
            "total_enrollments": total_enrollments_count,
            "approved_enrollments": approved_enrollments_count,
            "pending_enrollments": pending_enrollments_count,
            "withdrawn_enrollments": withdrawn_enrollments_count,
            "completed_enrollments": completed_enrollments_count,
            "not_eligible_enrollments": not_eligible_enrollments_count,
        }

    @staticmethod
    def _enrich_enrollment(db: Session, enrollment: Enrollment) -> EnrollmentResponse:
        """Helper to enrich enrollment data with student details and completion rate."""
        enrollment_dict = EnrollmentResponse.from_orm(enrollment).dict()
        
        if enrollment.student:
            enrollment_dict.update({
                'student_name': enrollment.student.name,
                'student_email': enrollment.student.email,
                'student_department': enrollment.student.department,
                'student_employee_id': enrollment.student.employee_id,
                'student_designation': enrollment.student.designation,
                'student_experience_years': enrollment.student.experience_years,
                'sbu_head_employee_id': enrollment.student.sbu_head_employee_id,
                'sbu_head_name': enrollment.student.sbu_head_name,
                'reporting_manager_employee_id': enrollment.student.reporting_manager_employee_id,
                'reporting_manager_name': enrollment.student.reporting_manager_name,
                'student_bs_joining_date': enrollment.student.bs_joining_date,
                'student_total_experience': enrollment.student.total_experience,
                'student_career_start_date': enrollment.student.career_start_date,
            })
            
        if enrollment.course:
            enrollment_dict.update({
                'course_name': enrollment.course_name or enrollment.course.name,
                'batch_code': enrollment.batch_code or enrollment.course.batch_code,
                'course_description': enrollment.course.description,
            })
            
        # Calculate overall completion rate
        all_student_enrollments = db.query(Enrollment).filter(
            Enrollment.student_id == enrollment.student_id
        ).all()
        
        relevant_enrollments = [
            e for e in all_student_enrollments
            if (
                (e.approval_status == ApprovalStatus.WITHDRAWN)
                or (
                    e.approval_status == ApprovalStatus.APPROVED
                    and e.completion_status in [CompletionStatus.COMPLETED, CompletionStatus.FAILED]
                )
            )
            and e.approval_status != ApprovalStatus.REJECTED
        ]
        
        total_courses = len(relevant_enrollments)
        completed_courses = sum(1 for e in relevant_enrollments if e.completion_status == CompletionStatus.COMPLETED)
        
        overall_completion_rate = (completed_courses / total_courses * 100) if total_courses > 0 else 0.0
        
        enrollment_dict.update({
            'overall_completion_rate': round(overall_completion_rate, 1),
            'total_courses_assigned': total_courses,
            'completed_courses': completed_courses,
        })
        
        return EnrollmentResponse(**enrollment_dict)
