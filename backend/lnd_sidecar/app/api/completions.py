from fastapi import APIRouter, Depends, UploadFile, File, Query
from sqlalchemy.orm import Session
from app.db.base import get_db
from app.schemas.enrollment import CompletionUpload, CompletionBulkUpload
from app.services.completion_service import CompletionService

router = APIRouter()

@router.post("/upload", response_model=dict)
async def upload_completions(
    file: UploadFile = File(...),
    course_id: int = Query(..., description="ID of the course for these scores"),
    db: Session = Depends(get_db)
):
    """Upload completion results via Excel/CSV. Matches students by employee_id or email."""
    return await CompletionService.process_completion_upload(file, course_id, db)

@router.post("/bulk", response_model=dict)
def bulk_update_completions(
    completions: CompletionBulkUpload,
    db: Session = Depends(get_db)
):
    """Bulk update completion data via API."""
    return CompletionService.bulk_update_completions(completions, db)

@router.put("/{enrollment_id}", response_model=dict)
def update_completion(
    enrollment_id: int,
    completion: CompletionUpload,
    db: Session = Depends(get_db)
):
    """Update completion data for a specific enrollment."""
    return CompletionService.update_completion(enrollment_id, completion, db)

@router.post("/attendance/upload", response_model=dict)
async def upload_attendance(
    file: UploadFile = File(...),
    course_id: int = Query(..., description="ID of the course for attendance and scores"),
    db: Session = Depends(get_db)
):
    """Upload attendance and scores data via Excel/CSV. 
    Expected columns: name/email/bsid, total_classes_attended (or similar), score.
    Matches students by bsid/employee_id, email, or name.
    Calculates completion status based on 80% attendance threshold using course.total_classes_offered."""
    return await CompletionService.process_attendance_upload(file, course_id, db)

@router.put("/enrollment/{enrollment_id}", response_model=dict)
def update_enrollment_attendance(
    enrollment_id: int,
    classes_attended: int = Query(..., ge=0, description="Number of classes attended"),
    score: float = Query(..., ge=0, le=100, description="Score (0-100)"),
    db: Session = Depends(get_db)
):
    """Manually update attendance and score for a single enrollment.
    Uses the same logic as Excel upload: calculates attendance percentage from course.total_classes_offered
    and sets completion status based on 80% attendance threshold."""
    return CompletionService.update_enrollment_attendance(enrollment_id, classes_attended, score, db)
