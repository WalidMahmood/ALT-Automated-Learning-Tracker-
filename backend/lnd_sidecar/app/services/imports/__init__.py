from .students import (
    parse_employee_excel,
    parse_employee_csv,
    process_employee_imports,
    create_or_get_student,
    find_student_by_employee_id_or_email
)
from .enrollments import (
    parse_excel,
    parse_csv,
    process_incoming_enrollments
)
from .courses import get_course_by_batch_code

class ImportService:
    """Facade for import services to maintain backward compatibility."""
    parse_employee_excel = staticmethod(parse_employee_excel)
    parse_employee_csv = staticmethod(parse_employee_csv)
    process_employee_imports = staticmethod(process_employee_imports)
    create_or_get_student = staticmethod(create_or_get_student)
    find_student_by_employee_id_or_email = staticmethod(find_student_by_employee_id_or_email)
    parse_excel = staticmethod(parse_excel)
    parse_csv = staticmethod(parse_csv)
    process_incoming_enrollments = staticmethod(process_incoming_enrollments)
    get_course_by_batch_code = staticmethod(get_course_by_batch_code)
