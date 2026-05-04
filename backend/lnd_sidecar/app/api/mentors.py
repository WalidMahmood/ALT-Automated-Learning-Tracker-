from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_
from typing import List, Optional
from decimal import Decimal
from app.db.base import get_db
from app.models.mentor import Mentor
from app.models.course_mentor import CourseMentor
from app.models.student import Student
from app.models.course import Course
from app.models.enrollment import Enrollment, ApprovalStatus, CompletionStatus
from app.schemas.mentor import MentorCreate, MentorUpdate, MentorResponse
from app.schemas.course_mentor import CourseMentorCreate

router = APIRouter()

@router.get("/", response_model=List[MentorResponse])
def get_mentors(
    type: Optional[str] = Query("all", description="Filter by type: all, internal, external"),
    db: Session = Depends(get_db)
):
    """Get all mentors with optional type filter."""
    query = db.query(Mentor).options(joinedload(Mentor.student))
    
    if type == "internal":
        query = query.filter(Mentor.is_internal == True)
    elif type == "external":
        query = query.filter(Mentor.is_internal == False)
    # else "all" - no filter
    
    mentors = query.order_by(Mentor.name.asc()).all()
    
    # Build response with course count
    result = []
    for mentor in mentors:
        course_count = db.query(func.count(CourseMentor.id)).filter(
            CourseMentor.mentor_id == mentor.id
        ).scalar() or 0
        
        # Create response object and add course_count
        mentor_dict = MentorResponse.model_validate(mentor).model_dump()
        mentor_dict['course_count'] = course_count
        result.append(MentorResponse(**mentor_dict))
    
    return result

@router.post("/", response_model=MentorResponse, status_code=201)
def create_external_mentor(mentor: MentorCreate, db: Session = Depends(get_db)):
    """Create an external mentor (is_internal=False)."""
    if mentor.is_internal:
        raise HTTPException(
            status_code=400, 
            detail="Use POST /mentors/internal/{student_id} to create internal mentors"
        )
    
    if mentor.student_id is not None:
        raise HTTPException(
            status_code=400,
            detail="External mentors cannot have a student_id"
        )
    
    if not mentor.name:
        raise HTTPException(status_code=400, detail="Name is required for external mentors")
    
    # Calculate next external_id
    max_external_id = db.query(func.max(Mentor.external_id)).scalar() or 0
    next_external_id = max_external_id + 1
    
    db_mentor = Mentor(
        is_internal=False,
        name=mentor.name,
        email=mentor.email,
        company=mentor.company,
        department=mentor.department,
        designation=mentor.designation,
        specialty=mentor.specialty,
        external_id=next_external_id
    )
    db.add(db_mentor)
    db.commit()
    db.refresh(db_mentor)
    return MentorResponse.from_orm(db_mentor)

@router.post("/internal/{student_id}", response_model=MentorResponse, status_code=201)
def create_internal_mentor(student_id: int, db: Session = Depends(get_db)):
    """Create an internal mentor from an existing student."""
    # Check if student exists
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Check if mentor already exists for this student
    existing_mentor = db.query(Mentor).filter(Mentor.student_id == student_id).first()
    if existing_mentor:
        return MentorResponse.from_orm(existing_mentor)
    
    # Create mentor record with student data
    db_mentor = Mentor(
        is_internal=True,
        student_id=student_id,
        name=student.name,
        email=student.email,
        department=student.department,
        designation=student.designation
    )
    db.add(db_mentor)
    
    # Update student.is_mentor flag
    student.is_mentor = True
    
    db.commit()
    db.refresh(db_mentor)
    return MentorResponse.from_orm(db_mentor)

@router.get("/{mentor_id}", response_model=MentorResponse)
def get_mentor(mentor_id: int, db: Session = Depends(get_db)):
    """Get a specific mentor by ID."""
    mentor = db.query(Mentor).filter(Mentor.id == mentor_id).first()
    if not mentor:
        raise HTTPException(status_code=404, detail="Mentor not found")
    return MentorResponse.from_orm(mentor)

@router.put("/{mentor_id}", response_model=MentorResponse)
def update_mentor(
    mentor_id: int,
    mentor_update: MentorUpdate,
    db: Session = Depends(get_db)
):
    """Update mentor details."""
    mentor = db.query(Mentor).filter(Mentor.id == mentor_id).first()
    if not mentor:
        raise HTTPException(status_code=404, detail="Mentor not found")
    
    update_data = mentor_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(mentor, field, value)
    
    db.commit()
    db.refresh(mentor)
    return MentorResponse.from_orm(mentor)

@router.get("/{mentor_id}/stats")
def get_mentor_stats(mentor_id: int, db: Session = Depends(get_db)):
    """Get aggregated statistics for a mentor."""
    mentor = db.query(Mentor).filter(Mentor.id == mentor_id).first()
    if not mentor:
        raise HTTPException(status_code=404, detail="Mentor not found")
    
    # Get all course assignments for this mentor
    course_assignments = db.query(CourseMentor).filter(
        CourseMentor.mentor_id == mentor_id
    ).all()
    
    total_courses = len(course_assignments)
    total_hours = sum(float(cm.hours_taught) for cm in course_assignments)
    total_amount = sum(float(cm.amount_paid) for cm in course_assignments)
    
    # Per-course statistics
    course_stats = []
    for cm in course_assignments:
        course = db.query(Course).filter(Course.id == cm.course_id).first()
        if not course:
            continue
        
        # Count participants (approved enrollments)
        participants = db.query(Enrollment).filter(
            and_(
                Enrollment.course_id == cm.course_id,
                Enrollment.approval_status == ApprovalStatus.APPROVED
            )
        ).count()
        
        # Count completed enrollments
        completed = db.query(Enrollment).filter(
            and_(
                Enrollment.course_id == cm.course_id,
                Enrollment.approval_status == ApprovalStatus.APPROVED,
                Enrollment.completion_status == CompletionStatus.COMPLETED
            )
        ).count()
        
        completion_ratio = completed / participants if participants > 0 else 0.0
        
        course_stats.append({
            "course_id": course.id,
            "course_name": course.name,
            "batch_code": course.batch_code,
            "start_date": course.start_date.isoformat() if course.start_date else None,
            "end_date": course.end_date.isoformat() if course.end_date else None,
            "hours_taught": float(cm.hours_taught),
            "amount_paid": float(cm.amount_paid),
            "participants_count": participants,
            "completion_ratio": round(completion_ratio, 2)
        })
    
    return {
        "mentor_id": mentor_id,
        "name": mentor.name,
        "is_internal": mentor.is_internal,
        "total_courses_mentored": total_courses,
        "total_hours_overall": round(total_hours, 2),
        "total_amount_overall": round(total_amount, 2),
        "per_course_stats": course_stats
    }

@router.delete("/{mentor_id}", status_code=204)
def delete_mentor(mentor_id: int, db: Session = Depends(get_db)):
    """Delete a mentor (only external mentors can be deleted)."""
    mentor = db.query(Mentor).filter(Mentor.id == mentor_id).first()
    if not mentor:
        raise HTTPException(status_code=404, detail="Mentor not found")
    
    if mentor.is_internal:
        raise HTTPException(
            status_code=400,
            detail="Internal mentors cannot be deleted. Remove mentor tag from student instead."
        )
    
    # Check if mentor has course assignments
    assignments = db.query(CourseMentor).filter(CourseMentor.mentor_id == mentor_id).count()
    if assignments > 0:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete mentor with existing course assignments. Remove assignments first."
        )
    
    db.delete(mentor)
    db.commit()
    return None

