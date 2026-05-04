import pandas as pd
from sqlalchemy.orm import Session
from typing import List, Dict, Optional
from datetime import datetime

from app.models.student import Student

def parse_employee_excel(file_path: str) -> List[Dict]:
    """Parse Excel file and return list of employee records."""
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
                'experience_years': int(row.get('experience_years', 0)) if pd.notna(row.get('experience_years')) else 0,
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

def parse_employee_csv(file_path: str) -> List[Dict]:
    """Parse CSV file and return list of employee records."""
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
                'experience_years': int(row.get('experience_years', 0)) if pd.notna(row.get('experience_years')) else 0,
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

def process_employee_imports(db: Session, records: List[Dict]) -> Dict:
    """
    Process employee import records:
    1. Create new employees or update existing ones (by employee_id or email)
    2. Update employee information if they already exist
    """
    results = {
        'total': len(records),
        'created': 0,
        'updated': 0,
        'errors': []
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
            
            # Check if employee exists by employee_id or email
            existing_student = db.query(Student).filter(
                (Student.employee_id == record['employee_id']) | 
                (Student.email == record['email'])
            ).first()
            
            if existing_student:
                # Update existing employee
                # If employee_id matches, update all fields
                # If only email matches, update employee_id and other fields
                if existing_student.employee_id != record['employee_id']:
                    # Email match but different employee_id - check if new employee_id exists
                    conflicting = db.query(Student).filter(
                        Student.employee_id == record['employee_id']
                    ).first()
                    if conflicting:
                        results['errors'].append({
                            'record': record,
                            'error': f"Employee ID {record['employee_id']} already exists for another employee"
                        })
                        continue
                    existing_student.employee_id = record['employee_id']
                
                # Check if email is being changed to one that exists for another employee
                if existing_student.email != record['email']:
                    email_conflict = db.query(Student).filter(
                        Student.email == record['email'],
                        Student.id != existing_student.id
                    ).first()
                    if email_conflict:
                        results['errors'].append({
                            'record': record,
                            'error': f"Email {record['email']} already exists for another employee"
                        })
                        continue
                
                existing_student.name = record['name']
                existing_student.email = record['email']
                
                # Map SBU string to enum
                # Update department (now a string field)
                department = record.get('department', record.get('sbu', existing_student.department))
                if department:
                    existing_student.department = department.strip() if department.strip() else "Other"
                
                if record.get('designation'):
                    existing_student.designation = record['designation']
                
                if record.get('experience_years') is not None:
                    existing_student.experience_years = record['experience_years']
                
                # Update career_start_date if provided
                if record.get('career_start_date'):
                    try:
                        if isinstance(record['career_start_date'], str):
                            career_date = pd.to_datetime(record['career_start_date']).date()
                        elif isinstance(record['career_start_date'], (datetime, pd.Timestamp)):
                            career_date = record['career_start_date'].date() if hasattr(record['career_start_date'], 'date') else pd.to_datetime(record['career_start_date']).date()
                        else:
                            career_date = record['career_start_date']
                        existing_student.career_start_date = career_date
                    except Exception:
                        pass  # Skip if date parsing fails
                
                # Update bs_joining_date if provided
                if record.get('bs_joining_date'):
                    try:
                        if isinstance(record['bs_joining_date'], str):
                            bs_date = pd.to_datetime(record['bs_joining_date']).date()
                        elif isinstance(record['bs_joining_date'], (datetime, pd.Timestamp)):
                            bs_date = record['bs_joining_date'].date() if hasattr(record['bs_joining_date'], 'date') else pd.to_datetime(record['bs_joining_date']).date()
                        else:
                            bs_date = record['bs_joining_date']
                        existing_student.bs_joining_date = bs_date
                    except Exception:
                        pass  # Skip if date parsing fails
                
                results['updated'] += 1
            else:
                # Create new employee
                # Department is now a string field
                department = record.get('department', record.get('sbu', 'Other'))
                department = department.strip() if department and department.strip() else "Other"
                
                # Parse date fields
                career_date = None
                if record.get('career_start_date'):
                    try:
                        if isinstance(record['career_start_date'], str):
                            career_date = pd.to_datetime(record['career_start_date']).date()
                        elif isinstance(record['career_start_date'], (datetime, pd.Timestamp)):
                            career_date = record['career_start_date'].date() if hasattr(record['career_start_date'], 'date') else pd.to_datetime(record['career_start_date']).date()
                        else:
                            career_date = record['career_start_date']
                    except Exception:
                        pass  # Skip if date parsing fails
                
                bs_date = None
                if record.get('bs_joining_date'):
                    try:
                        if isinstance(record['bs_joining_date'], str):
                            bs_date = pd.to_datetime(record['bs_joining_date']).date()
                        elif isinstance(record['bs_joining_date'], (datetime, pd.Timestamp)):
                            bs_date = record['bs_joining_date'].date() if hasattr(record['bs_joining_date'], 'date') else pd.to_datetime(record['bs_joining_date']).date()
                        else:
                            bs_date = record['bs_joining_date']
                    except Exception:
                        pass  # Skip if date parsing fails
                
                new_student = Student(
                    employee_id=record['employee_id'],
                    name=record['name'],
                    email=record['email'],
                    department=department,
                    designation=record.get('designation'),
                    experience_years=record.get('experience_years', 0),
                    career_start_date=career_date,
                    bs_joining_date=bs_date
                )
                db.add(new_student)
                results['created'] += 1
            
        except Exception as e:
            results['errors'].append({
                'record': record,
                'error': str(e)
            })
    
    db.commit()
    return results

def create_or_get_student(db: Session, employee_id: str, name: str, email: str, 
                         department: str, designation: Optional[str] = None) -> Student:
    """Create or get existing student record."""
    student = db.query(Student).filter(Student.employee_id == employee_id).first()
    
    if not student:
        # Department is now a string field, use as-is or default to "Other"
        department = department.strip() if department else "Other"
        
        student = Student(
            employee_id=employee_id,
            name=name,
            email=email,
            department=department,
            designation=designation
        )
        db.add(student)
        db.flush()
    else:
        # Update existing student info if needed
        if student.name != name:
            student.name = name
        if student.email != email:
            student.email = email
        if student.designation != designation:
            student.designation = designation
    
    return student

def find_student_by_employee_id_or_email(db: Session, employee_id: str, email: str) -> Optional[Student]:
    """Find existing student by employee_id or email."""
    student = db.query(Student).filter(Student.employee_id == employee_id).first()
    if not student:
        student = db.query(Student).filter(Student.email == email).first()
    return student
