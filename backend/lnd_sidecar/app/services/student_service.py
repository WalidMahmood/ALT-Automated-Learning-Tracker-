from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List, Dict, Any, Optional
from app.models.student import Student
from app.models.enrollment import Enrollment, ApprovalStatus, CompletionStatus
from app.models.lms_user import LMSUserCourse
from app.schemas.enrollment import EnrollmentResponse

class StudentService:
    @staticmethod
    def get_student_enrollments(db: Session, student_id: int) -> Dict[str, Any]:
        """Get all enrollments for a specific student with full course details and overall completion rate."""
        student = db.query(Student).filter(Student.id == student_id).first()
        if not student:
            return None
        
        # Get onsite enrollments
        enrollments = db.query(Enrollment).filter(Enrollment.student_id == student_id).order_by(Enrollment.created_at.desc()).all()
        
        # Get online (LMS) courses
        lms_courses = db.query(LMSUserCourse).filter(LMSUserCourse.student_id == student_id).order_by(LMSUserCourse.created_at.desc()).all()
        
        # Calculate overall completion rate
        all_student_enrollments = db.query(Enrollment).filter(
            Enrollment.student_id == student_id
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
        
        onsite_total = len(relevant_enrollments)
        onsite_completed = sum(1 for e in relevant_enrollments if e.completion_status == CompletionStatus.COMPLETED)
        
        online_total = len(lms_courses)
        online_completed = sum(1 for c in lms_courses if c.completed)
        
        total_courses = onsite_total + online_total
        completed_courses = onsite_completed + online_completed
        
        if total_courses > 0:
            overall_completion_rate = (completed_courses / total_courses) * 100
        else:
            overall_completion_rate = 0.0
        
        # Build onsite enrollments list
        result_enrollments = []
        for enrollment in enrollments:
            enrollment_dict = EnrollmentResponse.from_orm(enrollment).dict()
            enrollment_dict.update({
                'student_name': enrollment.student.name,
                'student_email': enrollment.student.email,
                'student_department': enrollment.student.department,
                'student_employee_id': enrollment.student.employee_id,
                'student_designation': enrollment.student.designation,
                'student_experience_years': enrollment.student.experience_years,
                'course_name': enrollment.course_name or (enrollment.course.name if enrollment.course else None),
                'batch_code': enrollment.batch_code or (enrollment.course.batch_code if enrollment.course else None),
                'attendance_percentage': enrollment.attendance_percentage,
                'total_attendance': enrollment.total_attendance,
                'present': enrollment.present,
                'attendance_status': enrollment.attendance_status,
                'course_start_date': enrollment.course.start_date.isoformat() if enrollment.course and enrollment.course.start_date else None,
                'course_end_date': enrollment.course.end_date.isoformat() if enrollment.course and enrollment.course.end_date else None,
                'completion_date': enrollment.completion_date.isoformat() if enrollment.completion_date else None,
                'course_type': 'onsite',
                'is_lms_course': False
            })
            result_enrollments.append(enrollment_dict)
        
        # Build online courses list
        online_enrollments = []
        for lms_course in lms_courses:
            completion_status = "Completed" if lms_course.completed else ("In Progress" if lms_course.progress and lms_course.progress > 0 else "Not Started")
            
            online_dict = {
                'id': f"lms_{lms_course.id}",
                'course_id': lms_course.lms_course_id,
                'course_name': lms_course.course_name,
                'batch_code': lms_course.course_shortname or '',
                'course_type': 'online',
                'approval_status': 'Approved',
                'completion_status': completion_status,
                'progress': lms_course.progress or 0,
                'score': None,
                'course_start_date': lms_course.start_date.isoformat() if lms_course.start_date else None,
                'course_end_date': lms_course.end_date.isoformat() if lms_course.end_date else None,
                'date_assigned': int(lms_course.enrollment_time.timestamp()) if lms_course.enrollment_time else (int(lms_course.created_at.timestamp()) if lms_course.created_at else None),
                'lastaccess': int(lms_course.last_access.timestamp()) if lms_course.last_access else None,
                'completion_date': lms_course.completion_date.isoformat() if lms_course.completion_date else None,
                'is_lms_course': True,
                'is_mandatory': lms_course.is_mandatory == 1 if hasattr(lms_course, 'is_mandatory') and lms_course.is_mandatory is not None else False,
                'student_name': student.name,
                'student_email': student.email,
                'student_employee_id': student.employee_id,
            }
            online_enrollments.append(online_dict)

        
        return {
            'enrollments': result_enrollments,
            'online_courses': online_enrollments,
            'overall_completion_rate': round(overall_completion_rate, 1),
            'total_courses_assigned': total_courses,
            'completed_courses': completed_courses,
            'onsite_stats': {
                'total': onsite_total,
                'completed': onsite_completed,
                'rate': round((onsite_completed / onsite_total * 100) if onsite_total > 0 else 0, 1)
            },
            'online_stats': {
                'total': online_total,
                'completed': online_completed,
                'rate': round((online_completed / online_total * 100) if online_total > 0 else 0, 1)
            }
        }

    @staticmethod
    def get_all_students_with_courses(
        db: Session, 
        is_active: Optional[bool] = True, 
        department: Optional[str] = None, 
        skip: int = 0, 
        limit: int = 10000
    ) -> List[Dict[str, Any]]:
        """Get all students with their complete course history."""
        from app.core.validation import validate_department
        
        query = db.query(Student)
        
        if is_active is not None:
            query = query.filter(Student.is_active == is_active)
        
        if department and department.strip():
            try:
                validated_department = validate_department(department)
                query = query.filter(Student.department == validated_department)
            except (ValueError, AttributeError):
                pass
        
        students = query.order_by(Student.employee_id.asc()).offset(skip).limit(limit).all()
        
        result = []
        for student in students:
            # Get onsite enrollments
            enrollments = db.query(Enrollment).options(
                joinedload(Enrollment.course)
            ).filter(
                Enrollment.student_id == student.id
            ).order_by(Enrollment.created_at.desc()).all()
            
            # Get online (LMS) courses
            lms_courses = db.query(LMSUserCourse).filter(
                LMSUserCourse.student_id == student.id
            ).order_by(LMSUserCourse.created_at.desc()).all()
            
            enrollment_list = []
            
            # Add onsite enrollments
            for enrollment in enrollments:
                course_name = enrollment.course_name or (enrollment.course.name if enrollment.course else None)
                batch_code = enrollment.batch_code or (enrollment.course.batch_code if enrollment.course else None)
                
                enrollment_dict = {
                    'id': enrollment.id,
                    'course_name': course_name,
                    'batch_code': batch_code,
                    'course_type': 'onsite',
                    'approval_status': enrollment.approval_status.value if enrollment.approval_status else None,
                    'completion_status': enrollment.completion_status.value if enrollment.completion_status else None,
                    'eligibility_status': enrollment.eligibility_status.value if enrollment.eligibility_status else None,
                    'score': enrollment.score,
                    'attendance_percentage': enrollment.attendance_percentage,
                    'total_attendance': enrollment.total_attendance,
                    'present': enrollment.present,
                    'attendance_status': enrollment.attendance_status,
                    'course_start_date': enrollment.course.start_date.isoformat() if enrollment.course and enrollment.course.start_date else None,
                    'course_end_date': enrollment.course.end_date.isoformat() if enrollment.course and enrollment.course.end_date else None,
                    'created_at': enrollment.created_at.isoformat() if enrollment.created_at else None,
                }
                enrollment_list.append(enrollment_dict)
            
            # Add online (LMS) courses
            for lms_course in lms_courses:
                completion_status = "COMPLETED" if lms_course.completed else ("IN_PROGRESS" if lms_course.progress and lms_course.progress > 0 else "NOT_STARTED")
                
                enrollment_dict = {
                    'id': f"lms_{lms_course.id}",
                    'course_name': lms_course.course_name,
                    'batch_code': lms_course.course_shortname,
                    'course_type': 'online',
                    'approval_status': 'APPROVED',
                    'completion_status': completion_status,
                    'progress': lms_course.progress,
                    'score': None,
                    'attendance_percentage': None,
                    'total_attendance': None,
                    'present': None,
                    'attendance_status': None,
                    'course_start_date': lms_course.start_date.isoformat() if lms_course.start_date else None,
                    'course_end_date': lms_course.end_date.isoformat() if lms_course.end_date else None,
                    'created_at': lms_course.created_at.isoformat() if lms_course.created_at else None,
                }
                enrollment_list.append(enrollment_dict)
            
            # Calculate totals
            total_courses = len(enrollment_list)
            completed_onsite = len([e for e in enrollments if e.completion_status == CompletionStatus.COMPLETED])
            completed_online = len([c for c in lms_courses if c.completed])
            completed_courses = completed_onsite + completed_online
            
            result.append({
                "id": student.id,
                "employee_id": student.employee_id,
                "name": student.name,
                "email": student.email,
                "department": student.department,
                "designation": student.designation,
                "is_active": student.is_active,
                "is_mentor": student.is_mentor,
                "exit_date": student.exit_date.isoformat() if student.exit_date else None,
                "exit_reason": student.exit_reason,
                "career_start_date": student.career_start_date.isoformat() if student.career_start_date else None,
                "bs_joining_date": student.bs_joining_date.isoformat() if student.bs_joining_date else None,
                "total_experience": student.total_experience,
                "sbu_head_employee_id": student.sbu_head_employee_id,
                "sbu_head_name": student.sbu_head_name,
                "reporting_manager_employee_id": student.reporting_manager_employee_id,
                "reporting_manager_name": student.reporting_manager_name,
                "enrollments": enrollment_list,
                "total_courses": total_courses,
                "completed_courses": completed_courses,
                "never_taken_course": total_courses == 0,
            })
            
        return result

    @staticmethod
    def cleanup_non_bs_students(db: Session) -> int:
        """Remove students whose employee_id does not start with 'BS'."""
        non_bs_students = db.query(Student).filter(
            ~Student.employee_id.ilike('%BS%')
        ).all()
        
        count = 0
        for student in non_bs_students:
            db.delete(student)
            count += 1
        
        db.commit()
        return count
