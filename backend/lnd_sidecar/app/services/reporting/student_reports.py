from datetime import date
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi.responses import StreamingResponse

from app.models.student import Student
from app.models.enrollment import Enrollment, ApprovalStatus, CompletionStatus, EligibilityStatus
from app.models.lms_user import LMSUserCourse
from app.services.reporting.base import create_excel_response

def generate_employee_report(students: List[Student], start_date: Optional[date], end_date: Optional[date], db: Session, filename: str) -> StreamingResponse:
    """Generate Excel report for a list of students."""
    report_data = []
    
    for student in students:
        # --- Onsite Enrollments ---
        onsite_query = db.query(Enrollment).filter(
            Enrollment.student_id == student.id
        )
        
        if start_date:
            onsite_query = onsite_query.filter(func.date(Enrollment.created_at) >= start_date)
        if end_date:
            onsite_query = onsite_query.filter(func.date(Enrollment.created_at) <= end_date)
            
        enrollments = onsite_query.all()
        
        # --- Online (LMS) Enrollments ---
        online_query = db.query(LMSUserCourse).filter(
            LMSUserCourse.student_id == student.id
        )
        
        if start_date:
            online_query = online_query.filter(
                func.coalesce(func.date(LMSUserCourse.enrollment_time), func.date(LMSUserCourse.created_at)) >= start_date
            )
        if end_date:
            online_query = online_query.filter(
                func.coalesce(func.date(LMSUserCourse.enrollment_time), func.date(LMSUserCourse.created_at)) <= end_date
            )
            
        lms_courses = online_query.all()
        
        # If no enrollments, add placeholder
        if not enrollments and not lms_courses:
            report_data.append({
                'BSID': student.employee_id or '',
                'Name': student.name or '',
                'Email': student.email or '',
                'Department': student.department or '',
                'Designation': student.designation or '',
                'Course Name': 'No courses taken in selected period',
                'Course Type': 'N/A',
                'Batch Code': 'N/A',
                'Attendance': 'N/A',
                'Score': 'N/A',
                'Progress': 'N/A',
                'Last Access': 'N/A',
                'Completion Status': 'N/A',
                'Approval Date': 'N/A',
                'Completion Date': 'N/A',
                'Withdrawn': 'N/A',
            })
            continue
        
        # Process Onsite Enrollments
        for enrollment in enrollments:
            course_name = enrollment.course_name or (enrollment.course.name if enrollment.course else '')
            batch_code = enrollment.batch_code or (enrollment.course.batch_code if enrollment.course else '')
            
            attendance = ''
            if enrollment.total_attendance and enrollment.total_attendance > 0 and enrollment.present is not None:
                attendance_percentage = (enrollment.present / enrollment.total_attendance * 100)
                attendance = f"{attendance_percentage:.1f}%"
            elif enrollment.attendance_percentage is not None:
                attendance = f"{enrollment.attendance_percentage:.1f}%"
            elif enrollment.attendance_status:
                attendance = enrollment.attendance_status
            
            score = f"{enrollment.score}%" if enrollment.score is not None else ''
            
            if enrollment.approval_status == ApprovalStatus.WITHDRAWN:
                completion_status = 'WITHDRAWN'
            elif enrollment.eligibility_status in [EligibilityStatus.INELIGIBLE_PREREQUISITE, EligibilityStatus.INELIGIBLE_DUPLICATE, EligibilityStatus.INELIGIBLE_ANNUAL_LIMIT]:
                completion_status = 'INELIGIBLE'
            elif enrollment.approval_status == ApprovalStatus.PENDING:
                completion_status = 'PENDING'
            elif enrollment.completion_status == CompletionStatus.COMPLETED:
                completion_status = 'COMPLETED'
            elif enrollment.completion_status == CompletionStatus.FAILED:
                completion_status = 'FAILED'
            else:
                completion_status = 'PENDING'
            
            approval_date = enrollment.approved_at.strftime('%Y-%m-%d') if enrollment.approved_at else ''
            completion_date = enrollment.completion_date.strftime('%Y-%m-%d') if enrollment.completion_date else ''
            withdrawn = 'TRUE' if enrollment.approval_status == ApprovalStatus.WITHDRAWN else 'FALSE'
            
            report_data.append({
                'BSID': student.employee_id or '',
                'Name': student.name or '',
                'Email': student.email or '',
                'Department': student.department or '',
                'Designation': student.designation or '',
                'Course Name': course_name,
                'Course Type': 'Onsite',
                'Batch Code': batch_code,
                'Attendance': attendance,
                'Score': score,
                'Progress': 'N/A',
                'Last Access': 'N/A',
                'Completion Status': completion_status,
                'Approval Date': approval_date,
                'Completion Date': completion_date,
                'Withdrawn': withdrawn,
            })
            
        # Process Online Enrollments
        for lms_course in lms_courses:
            completion_status = 'COMPLETED' if lms_course.completed else 'IN PROGRESS'
            progress = f"{lms_course.progress}%" if lms_course.progress is not None else '0%'
            last_access = lms_course.last_access.strftime('%Y-%m-%d') if lms_course.last_access else ''
            enrollment_date = lms_course.enrollment_time.strftime('%Y-%m-%d') if lms_course.enrollment_time else (lms_course.created_at.strftime('%Y-%m-%d') if lms_course.created_at else '')
            
            report_data.append({
                'BSID': student.employee_id or '',
                'Name': student.name or '',
                'Email': student.email or '',
                'Department': student.department or '',
                'Designation': student.designation or '',
                'Course Name': lms_course.course_name,
                'Course Type': 'Online',
                'Batch Code': lms_course.course_shortname or '',
                'Attendance': 'N/A',
                'Score': 'N/A',
                'Progress': progress,
                'Last Access': last_access,
                'Completion Status': completion_status,
                'Approval Date': enrollment_date, # Auto-approved
                'Completion Date': lms_course.completion_date.strftime('%Y-%m-%d') if lms_course.completion_date else '',
                'Withdrawn': 'FALSE',
            })
    
    return create_excel_response(report_data, filename, 'Training Report')
