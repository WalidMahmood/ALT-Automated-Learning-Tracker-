import pandas as pd
import json
from sqlalchemy.orm import Session
from typing import List, Dict
from datetime import datetime

from app.models.student import Student
from app.models.course import Course
from app.models.enrollment import Enrollment, IncomingEnrollment, ApprovalStatus, EligibilityStatus
from app.services.eligibility_service import EligibilityService
from app.services.imports.students import find_student_by_employee_id_or_email

def parse_excel(file_path: str) -> List[Dict]:
    """Parse Excel file and return list of enrollment records (for interest submissions)."""
    try:
        df = pd.read_excel(file_path)
        # Normalize column names (handle variations)
        df.columns = df.columns.str.strip().str.lower().str.replace(' ', '_')
        
        records = []
        for _, row in df.iterrows():
            record = {
                'employee_id': str(row.get('employee_id', '')).strip(),
                'name': str(row.get('name', '')).strip(),
                'email': str(row.get('email', '')).strip(),
                'department': str(row.get('department', row.get('sbu', ''))).strip() if pd.notna(row.get('department', row.get('sbu'))) else '',
                'designation': str(row.get('designation', '')).strip() if pd.notna(row.get('designation')) else '',
            }
            # Handle career_start_date
            if pd.notna(row.get('career_start_date')):
                record['career_start_date'] = row.get('career_start_date')
            # Handle bs_join_date or bs_joining_date (both variations)
            bs_date = row.get('bs_join_date') if pd.notna(row.get('bs_join_date')) else row.get('bs_joining_date')
            if pd.notna(bs_date):
                record['bs_joining_date'] = bs_date
            records.append(record)
        
        return records
    except Exception as e:
        raise ValueError(f"Error parsing Excel file: {str(e)}")

def parse_csv(file_path: str) -> List[Dict]:
    """Parse CSV file and return list of enrollment records (for interest submissions)."""
    try:
        df = pd.read_csv(file_path)
        df.columns = df.columns.str.strip().str.lower().str.replace(' ', '_')
        
        records = []
        for _, row in df.iterrows():
            record = {
                'employee_id': str(row.get('employee_id', '')).strip(),
                'name': str(row.get('name', '')).strip(),
                'email': str(row.get('email', '')).strip(),
                'department': str(row.get('department', row.get('sbu', ''))).strip() if pd.notna(row.get('department', row.get('sbu'))) else '',
                'designation': str(row.get('designation', '')).strip() if pd.notna(row.get('designation')) else '',
            }
            # Handle career_start_date
            if pd.notna(row.get('career_start_date')):
                record['career_start_date'] = row.get('career_start_date')
            # Handle bs_join_date or bs_joining_date (both variations)
            bs_date = row.get('bs_join_date') if pd.notna(row.get('bs_join_date')) else row.get('bs_joining_date')
            if pd.notna(bs_date):
                record['bs_joining_date'] = bs_date
            records.append(record)
        
        return records
    except Exception as e:
        raise ValueError(f"Error parsing CSV file: {str(e)}")

def process_incoming_enrollments(db: Session, records: List[Dict], course_id: int) -> Dict:
    """
    Process incoming enrollment records for a specific course:
    1. Store in incoming_enrollments table
    2. Find existing students (by employee_id or email) - don't create new ones
    3. Run eligibility checks
    4. Create enrollment records
    """
    # Get the course
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise ValueError(f"Course with ID {course_id} not found")
    
    results = {
        'total': len(records),
        'processed': 0,
        'errors': [],
        'eligible': 0,
        'ineligible': 0,
        'not_found': 0
    }
    
    for record in records:
        try:
            # Validate required fields
            if not all([record.get('employee_id'), record.get('name'), record.get('email')]):
                results['errors'].append({
                    'record': record,
                    'error': 'Missing required fields (employee_id, name, email)'
                })
                continue
            
            # Find existing student (don't create new ones)
            student = find_student_by_employee_id_or_email(
                db, 
                record['employee_id'],
                record['email']
            )
            
            if not student:
                results['errors'].append({
                    'record': record,
                    'error': f"Employee not found in database (employee_id: {record['employee_id']}, email: {record['email']})"
                })
                results['not_found'] += 1
                continue
            
            # Update student's career_start_date and bs_joining_date if provided
            if record.get('career_start_date'):
                try:
                    if isinstance(record['career_start_date'], str):
                        career_date = pd.to_datetime(record['career_start_date']).date()
                    elif isinstance(record['career_start_date'], (datetime, pd.Timestamp)):
                        career_date = record['career_start_date'].date() if hasattr(record['career_start_date'], 'date') else pd.to_datetime(record['career_start_date']).date()
                    else:
                        career_date = record['career_start_date']
                    student.career_start_date = career_date
                except Exception:
                    pass  # Skip if date parsing fails
            
            if record.get('bs_joining_date'):
                try:
                    if isinstance(record['bs_joining_date'], str):
                        bs_date = pd.to_datetime(record['bs_joining_date']).date()
                    elif isinstance(record['bs_joining_date'], (datetime, pd.Timestamp)):
                        bs_date = record['bs_joining_date'].date() if hasattr(record['bs_joining_date'], 'date') else pd.to_datetime(record['bs_joining_date']).date()
                    else:
                        bs_date = record['bs_joining_date']
                    student.bs_joining_date = bs_date
                except Exception:
                    pass  # Skip if date parsing fails
            
            # Store in incoming_enrollments
            incoming = IncomingEnrollment(
                employee_id=record['employee_id'],
                name=record['name'],
                email=record['email'],
                department=record.get('department', record.get('sbu', 'Other')),
                designation=record.get('designation'),
                course_name=course.name,
                batch_code=course.batch_code,
                raw_data=json.dumps(record)
            )
            db.add(incoming)
            db.flush()
            
            # Check if enrollment already exists
            existing_enrollment = db.query(Enrollment).filter(
                Enrollment.student_id == student.id,
                Enrollment.course_id == course.id
            ).first()
            
            if existing_enrollment:
                results['errors'].append({
                    'record': record,
                    'error': f"Enrollment already exists for {student.name} in {course.name}"
                })
                incoming.processed = True
                incoming.processed_at = datetime.utcnow()
                continue
            
            # Run eligibility checks
            eligibility_status, reason = EligibilityService.run_all_checks(
                db, student.id, course.id
            )
            
            # Create enrollment record
            # All enrollments start as PENDING (even if ineligible) so admin can manually approve if needed
            # The eligibility_reason will show why they're ineligible
            enrollment = Enrollment(
                student_id=student.id,
                course_id=course.id,
                course_name=course.name,  # Store course name for history preservation
                batch_code=course.batch_code,  # Store batch code for history preservation
                eligibility_status=eligibility_status,
                eligibility_reason=reason,
                eligibility_checked_at=datetime.utcnow(),
                approval_status=ApprovalStatus.PENDING,  # Always PENDING initially, admin can approve/reject manually
                incoming_enrollment_id=incoming.id
            )
            db.add(enrollment)
            
            # Mark incoming as processed
            incoming.processed = True
            incoming.processed_at = datetime.utcnow()
            
            results['processed'] += 1
            if eligibility_status == EligibilityStatus.ELIGIBLE:
                results['eligible'] += 1
            else:
                results['ineligible'] += 1
            
        except Exception as e:
            results['errors'].append({
                'record': record,
                'error': str(e)
            })
    
    db.commit()
    return results
