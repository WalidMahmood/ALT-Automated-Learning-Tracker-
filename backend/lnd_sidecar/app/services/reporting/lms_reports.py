from datetime import datetime, date
from typing import Optional
from sqlalchemy.orm import Session
from fastapi.responses import StreamingResponse

from app.models.student import Student
from app.models.lms_cache import LMSCourseCache
from app.models.lms_user import LMSUserCourse
from app.core.file_utils import sanitize_filename
from app.services.reporting.base import create_excel_response

def generate_lms_course_report(course_id: int, start_date: Optional[date], end_date: Optional[date], db: Session) -> StreamingResponse:
    """Generate Excel report for an online course with enrolled students data."""
    course = db.query(LMSCourseCache).filter(LMSCourseCache.id == course_id).first()
    if not course:
        return None
        
    query = db.query(LMSUserCourse).filter(
        LMSUserCourse.lms_course_id == str(course_id)
    )
    
    if start_date:
        query = query.filter(
            (LMSUserCourse.enrollment_time >= datetime.combine(start_date, datetime.min.time())) |
            ((LMSUserCourse.enrollment_time == None) & (LMSUserCourse.start_date >= datetime.combine(start_date, datetime.min.time())))
        )
    if end_date:
        query = query.filter(
            (LMSUserCourse.enrollment_time <= datetime.combine(end_date, datetime.max.time())) |
            ((LMSUserCourse.enrollment_time == None) & (LMSUserCourse.start_date <= datetime.combine(end_date, datetime.max.time())))
        )
        
    enrollments = query.all()
    
    report_data = []
    for enrollment in enrollments:
        student = db.query(Student).filter(Student.id == enrollment.student_id).first()
        if not student:
            continue
        
        if enrollment.completed:
            status = "Completed"
        elif enrollment.progress and enrollment.progress > 0:
            status = "In Progress"
        else:
            status = "Not Started"
        
        report_data.append({
            'Employee ID': student.employee_id,
            'Name': student.name,
            'Email': student.email,
            'Department': student.department or '',
            'Designation': student.designation or '',
            'Course Name': enrollment.course_name,
            'Category': enrollment.category_name,
            'Status': status,
            'Progress': f"{enrollment.progress}%" if enrollment.progress is not None else "0%",
            'Score': '-',
            'Enrollment Date': enrollment.enrollment_time.strftime('%Y-%m-%d %H:%M:%S') if enrollment.enrollment_time else (enrollment.start_date.strftime('%Y-%m-%d %H:%M:%S') if enrollment.start_date else ''),
            'Completion Date': enrollment.completion_date.strftime('%Y-%m-%d %H:%M:%S') if enrollment.completion_date else '',
            'Last Access': enrollment.last_access.strftime('%Y-%m-%d %H:%M:%S') if enrollment.last_access else '',
            'Is Mandatory': 'Yes' if enrollment.is_mandatory else 'No',
        })
        
    safe_course_name = sanitize_filename(course.fullname)
    filename = f"{safe_course_name}_Participants_{datetime.now().strftime('%Y%m%d')}.xlsx"
    
    return create_excel_response(report_data, filename, 'Participants')

def generate_overall_lms_report(start_date: Optional[date], end_date: Optional[date], db: Session) -> StreamingResponse:
    """Generate consolidated report for all online courses."""
    courses = db.query(LMSCourseCache).all()
    report_data = []
    
    for course in courses:
        query = db.query(LMSUserCourse).filter(
            LMSUserCourse.lms_course_id == str(course.id)
        )
        
        if start_date:
            query = query.filter(
                (LMSUserCourse.enrollment_time >= datetime.combine(start_date, datetime.min.time())) |
                ((LMSUserCourse.enrollment_time == None) & (LMSUserCourse.start_date >= datetime.combine(start_date, datetime.min.time())))
            )
        if end_date:
            query = query.filter(
                (LMSUserCourse.enrollment_time <= datetime.combine(end_date, datetime.max.time())) |
                ((LMSUserCourse.enrollment_time == None) & (LMSUserCourse.start_date <= datetime.combine(end_date, datetime.max.time())))
            )
            
        enrollments = query.all()
        
        total_enrolled = len(enrollments)
        completed = sum(1 for e in enrollments if e.completed)
        in_progress = sum(1 for e in enrollments if e.progress and e.progress > 0 and not e.completed)
        not_started = total_enrolled - completed - in_progress
        
        completion_rate = (completed / total_enrolled * 100) if total_enrolled > 0 else 0
        
        report_data.append({
            'Course Name': course.fullname,
            'Short Name': course.shortname,
            'Category': course.categoryname,
            'Start Date': datetime.fromtimestamp(course.startdate).strftime('%Y-%m-%d') if course.startdate else 'N/A',
            'End Date': datetime.fromtimestamp(course.enddate).strftime('%Y-%m-%d') if course.enddate else 'N/A',
            'Total Enrolled': total_enrolled,
            'Completed': completed,
            'In Progress': in_progress,
            'Not Started': not_started,
            'Completion Rate': f"{completion_rate:.1f}%",
            'Is Mandatory': 'Yes' if course.is_mandatory else 'No'
        })
        
    filename = f"Online_Courses_Summary_{datetime.now().strftime('%Y%m%d')}.xlsx"
    return create_excel_response(report_data, filename, 'Online Courses Summary')

def generate_lms_course_summary_report(course_id: int, db: Session) -> StreamingResponse:
    """Generate summary report for a specific online course."""
    course = db.query(LMSCourseCache).filter(LMSCourseCache.id == course_id).first()
    if not course:
        return None
        
    total_enrolled = db.query(LMSUserCourse).filter(
        LMSUserCourse.lms_course_id == str(course_id)
    ).count()
    
    completed = db.query(LMSUserCourse).filter(
        LMSUserCourse.lms_course_id == str(course_id),
        LMSUserCourse.completed == True
    ).count()
    
    in_progress = total_enrolled - completed
    completion_rate = (completed / total_enrolled * 100) if total_enrolled > 0 else 0
    
    summary_data = [{
        'Course Name': course.fullname,
        'Short Name': course.shortname,
        'Category': course.categoryname,
        'Start Date': datetime.fromtimestamp(course.startdate).strftime('%Y-%m-%d') if course.startdate else 'N/A',
        'End Date': datetime.fromtimestamp(course.enddate).strftime('%Y-%m-%d') if course.enddate else 'N/A',
        'Total Enrolled': total_enrolled,
        'Completed': completed,
        'In Progress': in_progress,
        'Completion Rate': f"{completion_rate:.1f}%",
        'Is Mandatory': 'Yes' if course.is_mandatory else 'No'
    }]
    
    safe_course_name = sanitize_filename(course.fullname)
    filename = f"{safe_course_name}_Summary_{datetime.now().strftime('%Y%m%d')}.xlsx"
    
    return create_excel_response(summary_data, filename, 'Summary')
