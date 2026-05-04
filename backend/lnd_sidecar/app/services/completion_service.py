import pandas as pd
import os
import aiofiles
from datetime import datetime
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from fastapi import UploadFile, HTTPException

from app.models.course import Course
from app.models.student import Student
from app.models.enrollment import Enrollment, CompletionStatus
from app.schemas.enrollment import CompletionUpload, CompletionBulkUpload
from app.core.file_utils import sanitize_filename, validate_file_extension, validate_file_size, get_safe_file_path

class CompletionService:
    @staticmethod
    async def process_completion_upload(file: UploadFile, course_id: int, db: Session) -> Dict[str, Any]:
        """Process completion results upload via Excel/CSV."""
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
            # Parse file
            if file.filename.endswith('.csv'):
                df = pd.read_csv(file_path)
            else:
                df = pd.read_excel(file_path)
            
            # Normalize column names
            df.columns = df.columns.str.strip().str.lower().str.replace(' ', '_')
            
            # Get course
            course = db.query(Course).filter(Course.id == course_id).first()
            if not course:
                raise HTTPException(status_code=404, detail=f"Course with ID {course_id} not found")
            
            results = {
                "processed": 0,
                "not_found": 0,
                "errors": []
            }
            
            # Process each row
            for idx, row in df.iterrows():
                try:
                    # Extract data - match by employee_id or email
                    employee_id = str(row.get('employee_id', '')).strip() if pd.notna(row.get('employee_id')) else None
                    email = str(row.get('email', '')).strip() if pd.notna(row.get('email')) else None
                    
                    if not employee_id and not email:
                        results["errors"].append({
                            "row": idx + 2,
                            "error": "Missing employee_id or email"
                        })
                        continue
                    
                    # Find student
                    student = None
                    if employee_id:
                        student = db.query(Student).filter(Student.employee_id == employee_id).first()
                    if not student and email:
                        student = db.query(Student).filter(Student.email == email).first()
                    
                    if not student:
                        results["not_found"] += 1
                        results["errors"].append({
                            "row": idx + 2,
                            "error": f"Student not found (employee_id: {employee_id}, email: {email})"
                        })
                        continue
                    
                    # Find enrollment for this student and course
                    enrollment = db.query(Enrollment).filter(
                        Enrollment.student_id == student.id,
                        Enrollment.course_id == course_id
                    ).first()
                    
                    if not enrollment:
                        results["errors"].append({
                            "row": idx + 2,
                            "error": f"Enrollment not found for {student.name} in {course.name}"
                        })
                        continue
                    
                    # Extract score and assessment data
                    score = None
                    if pd.notna(row.get('score')):
                        try:
                            score = float(row.get('score'))
                        except:
                            pass
                    
                    attendance = None
                    if pd.notna(row.get('attendance_percentage')):
                        try:
                            attendance = float(row.get('attendance_percentage'))
                        except:
                            pass
                    
                    status_str = str(row.get('completion_status', 'Completed')).strip() if pd.notna(row.get('completion_status')) else 'Completed'
                    
                    # Map status string to enum
                    status_map = {
                        'completed': CompletionStatus.COMPLETED,
                        'failed': CompletionStatus.FAILED,
                        'in_progress': CompletionStatus.IN_PROGRESS,
                        'not_started': CompletionStatus.NOT_STARTED
                    }
                    completion_status = status_map.get(status_str.lower(), CompletionStatus.COMPLETED)
                    
                    # Update enrollment
                    enrollment.score = score
                    enrollment.attendance_percentage = attendance
                    enrollment.completion_status = completion_status
                    if completion_status == CompletionStatus.COMPLETED and not enrollment.completion_date:
                        enrollment.completion_date = datetime.utcnow()
                    
                    results["processed"] += 1
                    
                except Exception as e:
                    results["errors"].append({
                        "row": idx + 2,
                        "error": "Error processing row"
                    })
            
            db.commit()
            
            return {
                "message": "Completion data uploaded successfully",
                "results": results
            }
            
        except HTTPException:
            raise
        except Exception as e:
            # Don't expose internal error details
            raise HTTPException(status_code=400, detail="Error processing file. Please check the file format and try again.")
        finally:
            if os.path.exists(file_path):
                os.remove(file_path)

    @staticmethod
    def bulk_update_completions(completions: CompletionBulkUpload, db: Session) -> Dict[str, Any]:
        """Bulk update completion data."""
        results = {
            "processed": 0,
            "errors": []
        }
        
        for completion in completions.completions:
            try:
                enrollment = db.query(Enrollment).filter(
                    Enrollment.id == completion.enrollment_id
                ).first()
                
                if not enrollment:
                    results["errors"].append({
                        "enrollment_id": completion.enrollment_id,
                        "error": "Enrollment not found"
                    })
                    continue
                
                enrollment.score = completion.score
                enrollment.attendance_percentage = completion.attendance_percentage
                enrollment.completion_status = completion.completion_status
                
                if completion.completion_status == CompletionStatus.COMPLETED:
                    enrollment.completion_date = datetime.utcnow()
                
                results["processed"] += 1
                
            except Exception as e:
                results["errors"].append({
                    "enrollment_id": completion.enrollment_id,
                    "error": str(e)
                })
        
        db.commit()
        return results

    @staticmethod
    def update_completion(enrollment_id: int, completion: CompletionUpload, db: Session) -> Dict[str, str]:
        """Update completion data for a specific enrollment."""
        enrollment = db.query(Enrollment).filter(Enrollment.id == enrollment_id).first()
        if not enrollment:
            raise HTTPException(status_code=404, detail="Enrollment not found")
        
        enrollment.score = completion.score
        enrollment.attendance_percentage = completion.attendance_percentage
        enrollment.completion_status = completion.completion_status
        
        if completion.completion_status == CompletionStatus.COMPLETED:
            enrollment.completion_date = datetime.utcnow()
        
        db.commit()
        return {"message": "Completion updated successfully"}

    @staticmethod
    async def process_attendance_upload(file: UploadFile, course_id: int, db: Session) -> Dict[str, Any]:
        """Process attendance and scores upload via Excel/CSV."""
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
            # Parse file
            if file.filename.endswith('.csv'):
                df = pd.read_csv(file_path)
            else:
                df = pd.read_excel(file_path)
            
            # Normalize column names
            df.columns = df.columns.str.strip().str.lower().str.replace(' ', '_')
            
            # Get course
            course = db.query(Course).filter(Course.id == course_id).first()
            if not course:
                raise HTTPException(status_code=404, detail=f"Course with ID {course_id} not found")
            
            # Check if course has total_classes_offered set
            if not course.total_classes_offered or course.total_classes_offered <= 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"Course '{course.name}' does not have 'Total Classes Offered' set. Please set this in the course settings before uploading attendance."
                )
            
            # Required columns: name or email (or bsid/employee_id), classes attended, score
            # Accept various column name variations
            has_name = 'name' in df.columns
            has_email = 'email' in df.columns
            has_bsid = 'bsid' in df.columns or 'employee_id' in df.columns
            
            if not (has_name or has_email or has_bsid):
                raise HTTPException(
                    status_code=400,
                    detail="Missing required column: 'name', 'email', or 'bsid'/'employee_id'. Found columns: " + ', '.join(df.columns)
                )
            
            # Check for classes attended column (accept various names)
            classes_attended_col = None
            for col in ['total_classes_attended', 'classes_attended', 'attended', 'completed', 'present']:
                if col in df.columns:
                    classes_attended_col = col
                    break
            
            if not classes_attended_col:
                raise HTTPException(
                    status_code=400,
                    detail="Missing required column for classes attended. Expected one of: 'total_classes_attended', 'classes_attended', 'attended', 'completed', 'present'. Found columns: " + ', '.join(df.columns)
                )
            
            # Check for score column
            has_score = 'score' in df.columns
            if not has_score:
                raise HTTPException(
                    status_code=400,
                    detail="Missing required column: 'score'. Found columns: " + ', '.join(df.columns)
                )
            
            results = {
                "processed": 0,
                "updated": 0,
                "not_found": 0,
                "errors": []
            }
            
            for idx, row in df.iterrows():
                try:
                    # Find student by bsid/employee_id, email, or name (in that order of preference)
                    bsid = None
                    if 'bsid' in df.columns and pd.notna(row.get('bsid')):
                        bsid = str(row.get('bsid', '')).strip()
                    elif 'employee_id' in df.columns and pd.notna(row.get('employee_id')):
                        bsid = str(row.get('employee_id', '')).strip()
                    
                    email = str(row.get('email', '')).strip() if pd.notna(row.get('email')) else None
                    name = str(row.get('name', '')).strip() if pd.notna(row.get('name')) else None
                    
                    if not bsid and not email and not name:
                        results["errors"].append({
                            "row": idx + 2,  # +2 for header and 0-index
                            "error": "Name, email, or bsid/employee_id is required"
                        })
                        continue
                    
                    # Find student (prefer bsid/employee_id, then email, then name)
                    student = None
                    if bsid:
                        student = db.query(Student).filter(Student.employee_id == bsid).first()
                    if not student and email:
                        student = db.query(Student).filter(Student.email == email).first()
                    if not student and name:
                        student = db.query(Student).filter(Student.name == name).first()
                    
                    if not student:
                        results["not_found"] += 1
                        results["errors"].append({
                            "row": idx + 2,
                            "error": f"Student not found: {bsid or email or name}"
                        })
                        continue
                    
                    # Find enrollment for this student and course
                    enrollment = db.query(Enrollment).filter(
                        Enrollment.student_id == student.id,
                        Enrollment.course_id == course_id
                    ).first()
                    
                    if not enrollment:
                        results["not_found"] += 1
                        results["errors"].append({
                            "row": idx + 2,
                            "error": f"Enrollment not found for {student.name} in {course.name}"
                        })
                        continue
                    
                    # Get classes attended
                    classes_attended = None
                    if pd.notna(row.get(classes_attended_col)):
                        try:
                            classes_attended = int(float(row.get(classes_attended_col)))
                        except (ValueError, TypeError):
                            results["errors"].append({
                                "row": idx + 2,
                                "error": f"Invalid classes attended value for {student.name}"
                            })
                            continue
                    
                    if classes_attended is None:
                        results["errors"].append({
                            "row": idx + 2,
                            "error": f"Missing classes attended value for {student.name}"
                        })
                        continue
                    
                    # Get score
                    score = None
                    if pd.notna(row.get('score')):
                        try:
                            score = float(row.get('score'))
                        except (ValueError, TypeError):
                            results["errors"].append({
                                "row": idx + 2,
                                "error": f"Invalid score value for {student.name}"
                            })
                            continue
                    
                    if score is None:
                        results["errors"].append({
                            "row": idx + 2,
                            "error": f"Missing score value for {student.name}"
                        })
                        continue
                    
                    # Update attendance data using course.total_classes_offered
                    enrollment.total_attendance = course.total_classes_offered
                    enrollment.present = classes_attended
                    enrollment.score = score
                    
                    # Calculate attendance percentage using course.total_classes_offered
                    if course.total_classes_offered > 0:
                        enrollment.attendance_percentage = (classes_attended / course.total_classes_offered) * 100
                        
                        # Determine completion status based on 80% attendance threshold
                        # Always update completion status based on new attendance percentage
                        # Pass if attendance >= 80%, Fail otherwise
                        if enrollment.attendance_percentage >= 80.0:
                            enrollment.attendance_status = "Pass"
                            # Always update to COMPLETED if attendance >= 80%
                            enrollment.completion_status = CompletionStatus.COMPLETED
                            if not enrollment.completion_date:
                                enrollment.completion_date = datetime.utcnow()
                        else:
                            enrollment.attendance_status = "Fail"
                            # Always update to FAILED if attendance < 80%
                            enrollment.completion_status = CompletionStatus.FAILED
                    else:
                        enrollment.attendance_percentage = None
                        enrollment.attendance_status = None
                    
                    results["processed"] += 1
                    results["updated"] += 1
                    
                except Exception as e:
                    results["errors"].append({
                        "row": idx + 2,
                        "error": "Error processing row"
                    })
            
            db.commit()
            
            return results
            
        except HTTPException:
            raise
        except Exception as e:
            db.rollback()
            # Don't expose internal error details
            raise HTTPException(status_code=500, detail="Error processing file. Please check the file format and try again.")
        finally:
            # Clean up temp file
            if os.path.exists(file_path):
                os.remove(file_path)

    @staticmethod
    def update_enrollment_attendance(enrollment_id: int, classes_attended: int, score: float, db: Session) -> Dict[str, Any]:
        """Manually update attendance and score for a single enrollment."""
        enrollment = db.query(Enrollment).filter(Enrollment.id == enrollment_id).first()
        if not enrollment:
            raise HTTPException(status_code=404, detail="Enrollment not found")
        
        # Get the course to access total_classes_offered
        course = None
        if enrollment.course_id:
            course = db.query(Course).filter(Course.id == enrollment.course_id).first()
        elif enrollment.course_name:
            # If course is deleted, try to get total_classes_offered from a similar course
            # For now, we'll require the course to exist
            raise HTTPException(
                status_code=400,
                detail="Cannot update attendance for a deleted course. Please restore the course first."
            )
        
        if not course:
            raise HTTPException(status_code=404, detail="Course not found for this enrollment")
        
        # Check if course has total_classes_offered set
        if not course.total_classes_offered or course.total_classes_offered <= 0:
            raise HTTPException(
                status_code=400,
                detail=f"Course '{course.name}' does not have 'Total Classes Offered' set. Please set this in the course settings first."
            )
        
        # Validate classes_attended doesn't exceed total_classes_offered
        if classes_attended > course.total_classes_offered:
            raise HTTPException(
                status_code=400,
                detail=f"Classes attended ({classes_attended}) cannot exceed total classes offered ({course.total_classes_offered})"
            )
        
        # Update attendance data using course.total_classes_offered
        enrollment.total_attendance = course.total_classes_offered
        enrollment.present = classes_attended
        enrollment.score = score
        
        # Calculate attendance percentage using course.total_classes_offered
        enrollment.attendance_percentage = (classes_attended / course.total_classes_offered) * 100
        
        # Determine completion status based on 80% attendance threshold
        # Always update completion status based on new attendance percentage
        # Pass if attendance >= 80%, Fail otherwise
        if enrollment.attendance_percentage >= 80.0:
            enrollment.attendance_status = "Pass"
            # Always update to COMPLETED if attendance >= 80%
            enrollment.completion_status = CompletionStatus.COMPLETED
            if not enrollment.completion_date:
                enrollment.completion_date = datetime.utcnow()
        else:
            enrollment.attendance_status = "Fail"
            # Always update to FAILED if attendance < 80%
            enrollment.completion_status = CompletionStatus.FAILED
        
        db.commit()
        db.refresh(enrollment)
        
        return {
            "message": "Enrollment attendance and score updated successfully",
            "enrollment_id": enrollment.id,
            "attendance_percentage": round(enrollment.attendance_percentage, 1),
            "completion_status": enrollment.completion_status.value,
            "attendance_status": enrollment.attendance_status
        }
