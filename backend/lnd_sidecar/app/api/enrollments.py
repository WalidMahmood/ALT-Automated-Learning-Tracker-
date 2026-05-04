from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
import logging
from app.db.base import get_db
from app.models.enrollment import Enrollment, ApprovalStatus, EligibilityStatus
from app.schemas.enrollment import EnrollmentResponse, EnrollmentApproval, EnrollmentBulkApproval, EnrollmentCreate
from app.services.enrollment_service import EnrollmentService

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/", response_model=List[EnrollmentResponse])
def get_enrollments(
    course_id: Optional[int] = Query(None),
    student_id: Optional[int] = Query(None),
    eligibility_status: Optional[str] = Query(None),
    approval_status: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    """Get enrollments with optional filters."""
    if eligibility_status:
        try:
            EligibilityStatus(eligibility_status)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid eligibility_status value")
            
    if approval_status:
        try:
            ApprovalStatus(approval_status)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid approval_status value")
            
    try:
        return EnrollmentService.get_enrollments(
            db, course_id, student_id, eligibility_status, approval_status, department, skip, limit
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/eligible", response_model=List[EnrollmentResponse])
def get_eligible_enrollments(
    course_id: Optional[int] = Query(None),
    department: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Get eligible enrollments pending approval."""
    return EnrollmentService.get_eligible_enrollments(db, course_id, department)

@router.post("/approve", response_model=EnrollmentResponse)
def approve_enrollment(
    approval: EnrollmentApproval,
    approved_by: str = Query(..., description="Admin name"),
    db: Session = Depends(get_db)
):
    """Approve or reject a single enrollment."""
    try:
        return EnrollmentService.approve_enrollment(db, approval, approved_by)
    except ValueError as e:
        if "not found" in str(e):
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/approve/bulk", response_model=dict)
def bulk_approve_enrollments(
    bulk_approval: EnrollmentBulkApproval,
    approved_by: str = Query(..., description="Admin name"),
    db: Session = Depends(get_db)
):
    """Bulk approve multiple enrollments."""
    try:
        return EnrollmentService.bulk_approve_enrollments(db, bulk_approval, approved_by)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/{enrollment_id}/withdraw", response_model=EnrollmentResponse)
def withdraw_enrollment(
    enrollment_id: int,
    withdrawal_reason: str = Query(..., description="Reason for withdrawal"),
    withdrawn_by: str = Query(..., description="Admin name"),
    db: Session = Depends(get_db)
):
    """Withdraw a student from a course (e.g., for misbehavior)."""
    try:
        return EnrollmentService.withdraw_enrollment(db, enrollment_id, withdrawal_reason, withdrawn_by)
    except ValueError as e:
        if "not found" in str(e):
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{enrollment_id}/reapprove", response_model=EnrollmentResponse)
def reapprove_enrollment(
    enrollment_id: int,
    approved_by: str = Query(..., description="Admin name"),
    db: Session = Depends(get_db)
):
    """Reapprove a previously withdrawn enrollment."""
    try:
        return EnrollmentService.reapprove_enrollment(db, enrollment_id, approved_by)
    except ValueError as e:
        if "not found" in str(e):
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/", response_model=EnrollmentResponse, status_code=201)
def create_enrollment(
    enrollment_data: EnrollmentCreate,
    db: Session = Depends(get_db)
):
    """Manually create a new enrollment for a student in a course."""
    try:
        return EnrollmentService.create_enrollment(db, enrollment_data)
    except ValueError as e:
        if "not found" in str(e):
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/dashboard/stats")
async def get_dashboard_stats(db: Session = Depends(get_db)):
    """Get dashboard statistics including counts for employees, courses, and enrollments."""
    return EnrollmentService.get_dashboard_stats(db)

@router.get("/{enrollment_id}", response_model=EnrollmentResponse)
def get_enrollment(enrollment_id: int, db: Session = Depends(get_db)):
    """Get a specific enrollment by ID."""
    enrollment = db.query(Enrollment).filter(Enrollment.id == enrollment_id).first()
    if not enrollment:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    
    return EnrollmentService._enrich_enrollment(db, enrollment)
