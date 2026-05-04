from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from typing import Optional
import os
import aiofiles
from datetime import datetime
from app.db.base import get_db
from app.core.config import settings
from app.services.imports import ImportService
from app.core.file_utils import sanitize_filename, validate_file_extension, validate_file_size, get_safe_file_path

router = APIRouter()

@router.post("/excel")
async def upload_excel(
    file: UploadFile = File(...),
    course_id: int = Query(..., description="ID of the course to enroll students in"),
    db: Session = Depends(get_db)
):
    """Upload and process Excel file with enrollment data."""
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
        records = ImportService.parse_excel(file_path)
        results = ImportService.process_incoming_enrollments(db, records, course_id)
        
        return {
            "message": "File processed successfully",
            "results": results
        }
    except HTTPException:
        raise
    except Exception as e:
        # Don't expose internal error details
        raise HTTPException(status_code=400, detail="Error processing file. Please check the file format and try again.")
    finally:
        # Clean up local file
        if os.path.exists(file_path):
            os.remove(file_path)

@router.post("/csv")
async def upload_csv(
    file: UploadFile = File(...),
    course_id: int = Query(..., description="ID of the course to enroll students in"),
    db: Session = Depends(get_db)
):
    """Upload and process CSV file with enrollment data."""
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
        records = ImportService.parse_csv(file_path)
        results = ImportService.process_incoming_enrollments(db, records, course_id)
        
        return {
            "message": "File processed successfully",
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

@router.get("/sync-status")
async def get_sync_status(db: Session = Depends(get_db)):
    """Get last sync status and statistics."""
    from app.models.enrollment import IncomingEnrollment
    from sqlalchemy import func
    
    last_sync = db.query(func.max(IncomingEnrollment.submitted_at)).scalar()
    total_pending = db.query(IncomingEnrollment).filter(
        IncomingEnrollment.processed == False
    ).count()
    
    return {
        "last_synced": last_sync.isoformat() if last_sync else None,
        "pending_processing": total_pending
    }

