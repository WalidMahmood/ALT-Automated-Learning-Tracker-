from datetime import datetime, date
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi.responses import StreamingResponse

from app.models.course import Course
from app.models.student import Student
from app.models.enrollment import Enrollment, ApprovalStatus, CompletionStatus
from app.core.file_utils import sanitize_filename
from app.services.reporting.base import create_excel_response

def generate_course_participants_report(course: Course, start_date: Optional[date], end_date: Optional[date], db: Session) -> StreamingResponse:
    """Generate Excel report for course participants."""
    query = db.query(Enrollment).filter(
        Enrollment.course_id == course.id,
        Enrollment.approval_status.in_([ApprovalStatus.APPROVED, ApprovalStatus.WITHDRAWN])
    )
    
    if start_date:
        query = query.filter(func.date(Enrollment.created_at) >= start_date)
    if end_date:
        query = query.filter(func.date(Enrollment.created_at) <= end_date)
        
    enrollments = query.all()
    
    report_data = []
    for enrollment in enrollments:
        student = db.query(Student).filter(Student.id == enrollment.student_id).first()
        if not student:
            continue
        
        attendance_display = '-'
        if enrollment.total_attendance and enrollment.total_attendance > 0 and enrollment.present is not None:
            attendance_percentage = (enrollment.present / enrollment.total_attendance * 100)
            attendance_display = f"{attendance_percentage:.1f}%"
        elif enrollment.attendance_percentage is not None:
            attendance_display = f"{enrollment.attendance_percentage:.1f}%"
        elif enrollment.attendance_status:
            attendance_display = enrollment.attendance_status
        
        # Calculate overall completion rate
        all_student_enrollments = db.query(Enrollment).filter(
            Enrollment.student_id == enrollment.student_id,
            Enrollment.approval_status.in_([ApprovalStatus.APPROVED, ApprovalStatus.WITHDRAWN])
        ).all()
        
        relevant_enrollments = [
            e for e in all_student_enrollments
            if (
                (e.approval_status == ApprovalStatus.WITHDRAWN) or
                (e.approval_status == ApprovalStatus.APPROVED and 
                 e.completion_status in [CompletionStatus.COMPLETED, CompletionStatus.FAILED])
            )
        ]
        
        total_courses = len(relevant_enrollments)
        completed_courses = sum(1 for e in relevant_enrollments if e.completion_status == CompletionStatus.COMPLETED)
        overall_completion_rate = (completed_courses / total_courses * 100) if total_courses > 0 else 0.0
        
        report_data.append({
            'Employee ID': student.employee_id,
            'Name': student.name,
            'Email': student.email,
            'Department': student.department or '',
            'Designation': student.designation or '',
            'Approval Status': enrollment.approval_status.value if enrollment.approval_status else '',
            'Completion Status': enrollment.completion_status.value if enrollment.completion_status else '',
            'Total Classes': enrollment.total_attendance or 0,
            'Classes Attended': enrollment.present or 0,
            'Attendance': attendance_display,
            'Score': enrollment.score if enrollment.score is not None else '-',
            'Total Courses Assigned': total_courses,
            'Completed Courses': completed_courses,
            'Overall Completion Rate': f"{overall_completion_rate:.1f}%",
            'Enrollment Date': enrollment.created_at.strftime('%Y-%m-%d %H:%M:%S') if enrollment.created_at else '',
            'Approval Date': enrollment.approved_at.strftime('%Y-%m-%d %H:%M:%S') if enrollment.approved_at and enrollment.approval_status == ApprovalStatus.APPROVED else '',
            'Completion Date': enrollment.completion_date.strftime('%Y-%m-%d %H:%M:%S') if enrollment.completion_date else '',
            'Withdrawal Date': enrollment.updated_at.strftime('%Y-%m-%d %H:%M:%S') if enrollment.approval_status == ApprovalStatus.WITHDRAWN and enrollment.updated_at else '',
            'Withdrawal Reason': enrollment.rejection_reason if enrollment.approval_status == ApprovalStatus.WITHDRAWN else '',
        })
    
    safe_course_name = sanitize_filename(course.name)
    safe_batch_code = sanitize_filename(course.batch_code)
    filename = f"{safe_course_name}_{safe_batch_code}_Participants_{datetime.now().strftime('%Y%m%d')}.xlsx"
    
    return create_excel_response(report_data, filename, 'Participants')

def generate_course_summary_report(course: Course, db: Session) -> StreamingResponse:
    """Generate summary report for a course."""
    total_enrolled = db.query(Enrollment).filter(
        Enrollment.course_id == course.id,
        Enrollment.approval_status == ApprovalStatus.APPROVED
    ).count()
    
    completed = db.query(Enrollment).filter(
        Enrollment.course_id == course.id,
        Enrollment.approval_status == ApprovalStatus.APPROVED,
        Enrollment.completion_status == CompletionStatus.COMPLETED
    ).count()
    
    failed = db.query(Enrollment).filter(
        Enrollment.course_id == course.id,
        Enrollment.approval_status == ApprovalStatus.APPROVED,
        Enrollment.completion_status == CompletionStatus.FAILED
    ).count()
    
    withdrawn = db.query(Enrollment).filter(
        Enrollment.course_id == course.id,
        Enrollment.approval_status == ApprovalStatus.WITHDRAWN
    ).count()
    
    completion_rate = (completed / total_enrolled * 100) if total_enrolled > 0 else 0
    
    mentors_str = ", ".join([m.mentor.name for m in course.mentors]) if course.mentors else "None"
    
    summary_data = [{
        'Course Name': course.name,
        'Batch Code': course.batch_code,
        'Type': course.course_type,
        'Start Date': course.start_date.strftime('%Y-%m-%d') if course.start_date else 'N/A',
        'End Date': course.end_date.strftime('%Y-%m-%d') if course.end_date else 'N/A',
        'Status': course.status.value if course.status else 'N/A',
        'Mentors': mentors_str,
        'Total Enrolled': total_enrolled,
        'Completed': completed,
        'Failed': failed,
        'Withdrawn': withdrawn,
        'Completion Rate': f"{completion_rate:.1f}%",
        'Total Training Cost': float(course.food_cost or 0) + float(course.other_cost or 0) + sum(float(m.amount_paid or 0) for m in course.mentors) if course.mentors else 0
    }]
    
    safe_course_name = sanitize_filename(course.name)
    safe_batch_code = sanitize_filename(course.batch_code)
    filename = f"{safe_course_name}_{safe_batch_code}_Summary_{datetime.now().strftime('%Y%m%d')}.xlsx"
    
    return create_excel_response(summary_data, filename, 'Summary')

def generate_overall_courses_report(course_type: str, start_date: Optional[date], end_date: Optional[date], db: Session) -> StreamingResponse:
    """Generate consolidated report for all courses of a type."""
    courses = db.query(Course).filter(Course.course_type == course_type).all()
    report_data = []
    
    for course in courses:
        query = db.query(Enrollment).filter(
            Enrollment.course_id == course.id,
            Enrollment.approval_status.in_([ApprovalStatus.APPROVED, ApprovalStatus.WITHDRAWN])
        )
        
        if start_date:
            query = query.filter(func.date(Enrollment.created_at) >= start_date)
        if end_date:
            query = query.filter(func.date(Enrollment.created_at) <= end_date)
            
        enrollments = query.all()
        
        total_enrolled = len(enrollments)
        completed = sum(1 for e in enrollments if e.completion_status == CompletionStatus.COMPLETED)
        failed = sum(1 for e in enrollments if e.completion_status == CompletionStatus.FAILED)
        withdrawn = sum(1 for e in enrollments if e.approval_status == ApprovalStatus.WITHDRAWN)
        
        completion_rate = (completed / total_enrolled * 100) if total_enrolled > 0 else 0
        
        mentors_str = ", ".join([m.mentor.name for m in course.mentors]) if course.mentors else "None"
        
        total_mentor_cost = sum(float(m.amount_paid or 0) for m in course.mentors) if course.mentors else 0
        total_cost = float(course.food_cost or 0) + float(course.other_cost or 0) + total_mentor_cost
        
        report_data.append({
            'Course Name': course.name,
            'Batch Code': course.batch_code,
            'Type': course.course_type,
            'Start Date': course.start_date.strftime('%Y-%m-%d') if course.start_date else 'N/A',
            'End Date': course.end_date.strftime('%Y-%m-%d') if course.end_date else 'N/A',
            'Status': course.status.value if course.status else 'N/A',
            'Mentors': mentors_str,
            'Total Enrolled': total_enrolled,
            'Completed': completed,
            'Failed': failed,
            'Withdrawn': withdrawn,
            'Completion Rate': f"{completion_rate:.1f}%",
            'Total Training Cost': total_cost
        })
        
    filename = f"{course_type.capitalize()}_Courses_Summary_{datetime.now().strftime('%Y%m%d')}.xlsx"
    sheet_name = f"{course_type.capitalize()} Courses Summary"
    
    return create_excel_response(report_data, filename, sheet_name)
