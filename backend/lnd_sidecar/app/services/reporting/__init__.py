from .student_reports import generate_employee_report
from .course_reports import (
    generate_course_participants_report,
    generate_course_summary_report,
    generate_overall_courses_report
)
from .lms_reports import (
    generate_lms_course_report,
    generate_overall_lms_report,
    generate_lms_course_summary_report
)
from .base import create_excel_response

class ReportService:
    """Facade for reporting services to maintain backward compatibility."""
    generate_employee_report = staticmethod(generate_employee_report)
    generate_course_participants_report = staticmethod(generate_course_participants_report)
    generate_course_summary_report = staticmethod(generate_course_summary_report)
    generate_overall_courses_report = staticmethod(generate_overall_courses_report)
    generate_lms_course_report = staticmethod(generate_lms_course_report)
    generate_overall_lms_report = staticmethod(generate_overall_lms_report)
    generate_lms_course_summary_report = staticmethod(generate_lms_course_summary_report)
    _create_excel_response = staticmethod(create_excel_response)
