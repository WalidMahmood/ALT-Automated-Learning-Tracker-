from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import aiofiles
from datetime import datetime, date
import logging
from app.db.base import get_db
from app.models.student import Student
from app.schemas.student import StudentCreate, StudentResponse
from app.core.file_utils import sanitize_filename, validate_file_extension, validate_file_size, get_safe_file_path
from app.services.imports import ImportService
from app.services.reporting import ReportService
from app.services.student_service import StudentService

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/", response_model=StudentResponse, status_code=201)
def create_student(student: StudentCreate, db: Session = Depends(get_db)):
    """Create a new student."""
    existing = db.query(Student).filter(Student.employee_id == student.employee_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Student with this employee ID already exists")
    
    db_student = Student(**student.dict())
    db.add(db_student)
    db.commit()
    db.refresh(db_student)
    return StudentResponse.from_orm(db_student)

@router.get("/", response_model=List[StudentResponse])
def get_students(
    department: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(True, description="Filter by active status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    """Get all students with optional filters."""
    from app.core.validation import validate_department
    
    query = db.query(Student)
    
    # Filter by active status
    query = query.filter(Student.is_active == is_active)
    
    if department:
        try:
            validated_department = validate_department(department)
            query = query.filter(Student.department == validated_department)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    
    # Sort by employee_id (ascending)
    students = query.order_by(Student.employee_id.asc()).offset(skip).limit(limit).all()
    return [StudentResponse.from_orm(student) for student in students]

@router.get("/departments")
def get_departments(
    is_active: Optional[bool] = Query(None, description="Filter by active status. If None, returns all departments"),
    db: Session = Depends(get_db)
):
    """Get list of unique departments from the database."""
    from sqlalchemy import distinct
    
    query = db.query(distinct(Student.department))
    
    if is_active is not None:
        query = query.filter(Student.is_active == is_active)
    
    departments = [dept[0] for dept in query.all() if dept[0]]  # Filter out None values
    departments.sort()  # Sort alphabetically
    
    return {"departments": departments}

@router.get("/count")
async def get_student_count(
    is_active: Optional[bool] = Query(True, description="Filter by active status"),
    department: Optional[str] = Query(None),
    use_erp: bool = Query(True, description="Use ERP cached data for count (default: True)"),
    db: Session = Depends(get_db)
):
    """
    Get count of employees from LOCAL DATABASE ONLY.
    
    Data is synced via cron job at 12am daily.
    No external API calls are made.
    """
    from app.services.erp_cache_service import ERPCacheService
    from app.core.validation import validate_department
    
    # Always use LOCAL DATABASE - no API fallback
    if use_erp:
        # Count from ERP cached data (local database)
        try:
            cached_employees = await ERPCacheService.get_cached_employees(db)
            if not cached_employees:
                # If cache is empty, return from students table
                logger.info("ERP cache empty, using students table")
                query = db.query(Student)
                if is_active is not None:
                    query = query.filter(Student.is_active == is_active)
                if department:
                    query = query.filter(Student.department == department)
                return {"count": query.count()}
            
            # Filter employees based on exitDate (previous employees have exitDate)
            # Use the exact same logic as test_erp_count.py which works correctly
            filtered_employees = []
            for emp in cached_employees:
                # Handle nested list structure - employees are wrapped in lists
                if isinstance(emp, list) and len(emp) > 0:
                    emp = emp[0]
                
                if not isinstance(emp, dict):
                    continue
                
                # Check if employee has exitDate - if yes, they are inactive
                exit_date = emp.get("exitDate")
                # exitDate is None, empty string, or False means active
                # Any other value (date string) means inactive
                emp_is_active = exit_date is None or exit_date == "" or exit_date is False
                
                # Match the requested is_active filter
                if is_active is None or emp_is_active == is_active:
                    # Filter by department if specified (and not None/empty)
                    if department and department.strip():
                        try:
                            validated_department = validate_department(department)
                            emp_dept = emp.get("department", {})
                            if isinstance(emp_dept, dict):
                                emp_dept_name = emp_dept.get("name", "")
                            else:
                                emp_dept_name = str(emp_dept)
                            
                            if emp_dept_name != validated_department:
                                continue
                        except (ValueError, AttributeError):
                            continue
                    
                    filtered_employees.append(emp)
            
            count = len(filtered_employees)
            return {
                "count": count,
                "is_active": is_active,
                "source": "erp_cache",
                "total_in_erp": len(cached_employees)
            }
        except Exception as e:
            logger.error(f"Error counting from ERP: {str(e)}, falling back to database")
            import traceback
            logger.error(traceback.format_exc())
            # Fall through to database count
    
    # Count from local database
    query = db.query(Student)
    if is_active is not None:
        query = query.filter(Student.is_active == is_active)
    
    if department:
        try:
            validated_department = validate_department(department)
            query = query.filter(Student.department == validated_department)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    
    count = query.count()
    return {
        "count": count,
        "is_active": is_active,
        "source": "database"
    }

@router.get("/sbu-head/{department}")
def get_sbu_head(department: str, employee_id: Optional[str] = Query(None), db: Session = Depends(get_db)):
    """Get the SBU head for a given department.
    
    Searches for employees with designation containing 'SBU Head' or 'Head of {department}'.
    Returns the first matching active employee.
    
    Returns null if:
    - Department is CXO (they're at the top of hierarchy)
    - The requesting employee is themselves an SBU Head
    """
    from sqlalchemy import or_
    
    if not department:
        return None
    
    # CXO department has no SBU head - they're at the top
    if department.upper() == 'CXO':
        return None
    
    # Check if the requesting employee is an SBU head themselves
    if employee_id:
        requesting_employee = db.query(Student).filter(
            Student.employee_id.ilike(employee_id)
        ).first()
        if requesting_employee and requesting_employee.designation:
            designation_lower = requesting_employee.designation.lower()
            if 'sbu head' in designation_lower or 'head of' in designation_lower or 'ceo' in designation_lower or 'cto' in designation_lower or 'coo' in designation_lower or 'director' in designation_lower:
                return None
    
    # Search for SBU Head or Head of {department} in the same department
    head = db.query(Student).filter(
        Student.is_active == True,
        Student.department == department,
        or_(
            Student.designation.ilike('%sbu head%'),
            Student.designation.ilike(f'%head of {department}%'),
            Student.designation.ilike(f'%head of%'),
            Student.designation.ilike('%director%'),
        )
    ).first()
    
    # If no head found in same department, try to find SBU Head with same department
    if not head:
        head = db.query(Student).filter(
            Student.is_active == True,
            Student.designation.ilike('%sbu head%')
        ).first()
    
    if head:
        return {
            "id": head.id,
            "employee_id": head.employee_id,
            "name": head.name,
            "email": head.email,
            "department": head.department,
            "designation": head.designation
        }
    
    return None


@router.get("/{student_id}", response_model=StudentResponse)
def get_student(student_id: int, db: Session = Depends(get_db)):
    """Get a specific student by ID."""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return StudentResponse.from_orm(student)

@router.get("/{student_id}/enrollments", response_model=dict)
def get_student_enrollments(student_id: int, db: Session = Depends(get_db)):
    """Get all enrollments for a specific student with full course details and overall completion rate.
    
    Includes both onsite enrollments and online (LMS) courses from the local database.
    """
    result = StudentService.get_student_enrollments(db, student_id)
    if not result:
        raise HTTPException(status_code=404, detail="Student not found")
    return result

@router.get("/all/with-courses", response_model=List[dict])
def get_all_students_with_courses(
    department: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(True, description="Filter by active status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(10000, ge=1, le=10000),
    db: Session = Depends(get_db)
):
    """
    Get all students with their complete course history and attendance data.
    
    Queries directly from the local database (synced from ERP).
    - is_active=True: Active employees (All Employees page)
    - is_active=False: Previous employees (Previous Employees page)
    
    Includes both onsite courses (from enrollments) and online courses (from LMS sync).
    No external API calls are made - uses only locally stored data.
    """
    return StudentService.get_all_students_with_courses(db, is_active, department, skip, limit)

@router.post("/import/excel")
async def import_employees_excel(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Upload and process Excel file with employee data."""
    # Validate and sanitize filename
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")
    
    validate_file_extension(file.filename)
    safe_filename = sanitize_filename(file.filename)
    
    # Read file content to check size
    content = await file.read()
    validate_file_size(len(content))
    
    # Reset file pointer
    await file.seek(0)
    
    # Save uploaded file temporarily with safe path
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    timestamped_filename = f"{timestamp}_{safe_filename}"
    file_path = get_safe_file_path(timestamped_filename)
    
    async with aiofiles.open(file_path, 'wb') as out_file:
        content = await file.read()
        await out_file.write(content)
    
    try:
        # Parse and process
        records = ImportService.parse_employee_excel(file_path)
        results = ImportService.process_employee_imports(db, records)
        
        return {
            "message": "File processed successfully",
            "results": results
        }
    except HTTPException:
        raise
    except Exception as e:
        # Don't expose internal error details
        raise HTTPException(status_code=400, detail=f"Error processing file: {str(e)}")
    finally:
        # Clean up local file
        if os.path.exists(file_path):
            os.remove(file_path)

@router.post("/import/csv")
async def import_employees_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Upload and process CSV file with employee data."""
    # Validate and sanitize filename
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")
    
    validate_file_extension(file.filename)
    safe_filename = sanitize_filename(file.filename)
    
    # Read file content to check size
    content = await file.read()
    validate_file_size(len(content))
    
    # Reset file pointer
    await file.seek(0)
    
    # Save uploaded file temporarily with safe path
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    timestamped_filename = f"{timestamp}_{safe_filename}"
    file_path = get_safe_file_path(timestamped_filename)
    
    async with aiofiles.open(file_path, 'wb') as out_file:
        content = await file.read()
        await out_file.write(content)
    
    try:
        records = ImportService.parse_employee_csv(file_path)
        results = ImportService.process_employee_imports(db, records)
        
        return {
            "message": "File processed successfully",
            "results": results
        }
    except HTTPException:
        raise
    except Exception as e:
        # Don't expose internal error details
        raise HTTPException(status_code=400, detail=f"Error processing file: {str(e)}")
    finally:
        # Clean up local file
        if os.path.exists(file_path):
            os.remove(file_path)

@router.post("/{student_id}/remove")
def remove_student(
    student_id: int,
    db: Session = Depends(get_db)
):
    """Remove a student (mark as inactive). Preserves all course history and enrollments."""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    if not student.is_active:
        raise HTTPException(status_code=400, detail="Student is already removed")
    
    # Mark as inactive instead of deleting
    student.is_active = False
    db.commit()
    db.refresh(student)
    
    return {
        "message": "Student removed successfully",
        "student_id": student.id,
        "employee_id": student.employee_id,
        "name": student.name
    }

@router.post("/{student_id}/restore")
def restore_student(
    student_id: int,
    db: Session = Depends(get_db)
):
    """Restore a previously removed student (mark as active again)."""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    if student.is_active:
        raise HTTPException(status_code=400, detail="Student is already active")
    
    # Mark as active again
    student.is_active = True
    db.commit()
    db.refresh(student)
    
    return {
        "message": "Student restored successfully",
        "student_id": student.id,
        "employee_id": student.employee_id,
        "name": student.name
    }

@router.get("/report/overall")
def generate_overall_report(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db)
):
    """Generate an Excel report with all employee enrollment history (active employees only).
    
    Supports date range filtering based on enrollment/assignment date.
    Includes both Onsite and Online (LMS) courses.
    """
    # Get all active students
    active_students = db.query(Student).filter(Student.is_active == True).all()
    
    filename = f"overall_employee_report_{datetime.now().strftime('%Y%m%d')}.xlsx"
    return ReportService.generate_employee_report(active_students, start_date, end_date, db, filename)


@router.get("/{student_id}/report")
def generate_student_report(
    student_id: int,
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db)
):
    """Generate an Excel report for a specific employee's enrollment history.
    
    Supports date range filtering based on enrollment/assignment date.
    Includes both Onsite and Online (LMS) courses.
    """
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
        
    filename = f"employee_report_{sanitize_filename(student.name)}_{datetime.now().strftime('%Y%m%d')}.xlsx"
    return ReportService.generate_employee_report([student], start_date, end_date, db, filename)
