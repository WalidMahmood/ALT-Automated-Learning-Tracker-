from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date
import logging
from app.db.base import get_db
from app.models.course import Course
from app.models.course_mentor import CourseMentor
from app.models.course_comment import CourseComment
from app.models.course_draft import CourseDraft
from app.schemas.course import CourseCreate, CourseResponse, CourseUpdate, CourseCostUpdate
from app.schemas.course_mentor import CourseMentorCreate, CourseMentorResponse
from app.schemas.course_comment import CourseCommentCreate, CourseCommentResponse
from app.schemas.course_draft import CourseDraftCreate, CourseDraftResponse
from app.services.course_service import CourseService
from app.services.reporting import ReportService

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/", response_model=CourseResponse, status_code=201)
def create_course(course: CourseCreate, db: Session = Depends(get_db)):
    """Create a new course batch."""
    try:
        return CourseService.create_course(db, course)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/", response_model=List[CourseResponse])
def get_courses(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    course_type: Optional[str] = Query(None, description="Filter by course type: onsite, online, external"),
    db: Session = Depends(get_db)
):
    """Get all courses. Automatically updates course status from ongoing to completed if end_date has passed."""
    try:
        return CourseService.get_courses(db, skip, limit, course_type)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error fetching courses: {str(e)}")

@router.get("/{course_id}", response_model=CourseResponse)
def get_course(course_id: int, db: Session = Depends(get_db)):
    """Get a specific course by ID with mentors, comments, draft, and total training cost."""
    course = CourseService.get_course_details(db, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return course

@router.put("/{course_id}", response_model=CourseResponse)
def update_course(
    course_id: int, 
    course_update: CourseUpdate, 
    db: Session = Depends(get_db)
):
    """Update a course."""
    try:
        updated_course = CourseService.update_course(db, course_id, course_update)
        if not updated_course:
            raise HTTPException(status_code=404, detail="Course not found")
        
        # Return full details
        return CourseService.get_course_details(db, course_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/{course_id}", status_code=204)
def delete_course(course_id: int, db: Session = Depends(get_db)):
    """Permanently delete a course from the database. This action cannot be undone.
    Related enrollments will be preserved with course_id set to NULL to maintain user history."""
    if not CourseService.delete_course(db, course_id):
        raise HTTPException(status_code=404, detail="Course not found")
    return None

@router.put("/{course_id}/costs", response_model=CourseResponse)
def update_course_costs(
    course_id: int,
    cost_update: CourseCostUpdate,
    db: Session = Depends(get_db)
):
    """Update food_cost and other_cost for a course."""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    if cost_update.food_cost is not None:
        course.food_cost = cost_update.food_cost
    if cost_update.other_cost is not None:
        course.other_cost = cost_update.other_cost
    
    db.commit()
    db.refresh(course)
    
    # Return with mentors and total cost
    return CourseService.get_course_details(db, course_id)

@router.post("/{course_id}/mentors", response_model=CourseMentorResponse, status_code=201)
def assign_mentor_to_course(
    course_id: int,
    assignment: CourseMentorCreate,
    db: Session = Depends(get_db)
):
    """Assign a mentor to a course. If assignment exists, update hours and amount."""
    try:
        return CourseService.assign_mentor(db, course_id, assignment)
    except ValueError as e:
        if "not found" in str(e):
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/{course_id}/mentors/{course_mentor_id}", status_code=204)
def remove_course_mentor(
    course_id: int,
    course_mentor_id: int,
    db: Session = Depends(get_db)
):
    """Remove a mentor assignment from a course."""
    assignment = db.query(CourseMentor).filter(
        CourseMentor.id == course_mentor_id,
        CourseMentor.course_id == course_id
    ).first()
    
    if not assignment:
        raise HTTPException(status_code=404, detail="Mentor assignment not found")
    
    db.delete(assignment)
    db.commit()
    return None

@router.get("/{course_id}/report")
def generate_course_report(
    course_id: int, 
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db)
):
    """Generate an Excel report for a course with enrolled students data (Approved and Withdrawn only).
    
    Supports date range filtering based on enrollment/approval date.
    """
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    return ReportService.generate_course_participants_report(course, start_date, end_date, db)

@router.get("/{course_id}/report/summary")
def generate_course_summary_report(
    course_id: int,
    db: Session = Depends(get_db)
):
    """Generate a summary report for a specific course."""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
        
    return ReportService.generate_course_summary_report(course, db)

@router.get("/report/overall")
def generate_overall_courses_report(
    course_type: str = Query(..., description="Course type: onsite or external"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db)
):
    """Generate a consolidated Excel report for all courses of a specific type with summary stats.
    
    Supports date range filtering based on enrollment/approval date.
    """
    return ReportService.generate_overall_courses_report(course_type, start_date, end_date, db)

# ========== COMMENT ENDPOINTS ==========

@router.post("/{course_id}/comments", response_model=CourseCommentResponse, status_code=201)
def add_comment(
    course_id: int,
    comment_data: CourseCommentCreate,
    db: Session = Depends(get_db)
):
    """Add a comment/update to a course (especially useful for planning courses)."""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    comment = CourseComment(
        course_id=course_id,
        comment=comment_data.comment,
        created_by=comment_data.created_by
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    
    return CourseCommentResponse.from_orm(comment)

@router.get("/{course_id}/comments", response_model=List[CourseCommentResponse])
def get_comments(course_id: int, db: Session = Depends(get_db)):
    """Get all comments for a course."""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    comments = db.query(CourseComment).filter(
        CourseComment.course_id == course_id
    ).order_by(CourseComment.created_at.desc()).all()
    
    return [CourseCommentResponse.from_orm(c) for c in comments]

# ========== DRAFT ENDPOINTS ==========

@router.post("/{course_id}/draft", response_model=CourseDraftResponse, status_code=201)
@router.put("/{course_id}/draft", response_model=CourseDraftResponse)
def save_draft(
    course_id: int,
    draft_data: CourseDraftCreate,
    db: Session = Depends(get_db)
):
    """Save or update draft data for a planning course (temporary mentor assignments, costs, etc.)."""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    draft = db.query(CourseDraft).filter(CourseDraft.course_id == course_id).first()
    
    if draft:
        # Update existing draft
        update_data = draft_data.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(draft, field, value)
    else:
        # Create new draft
        draft = CourseDraft(
            course_id=course_id,
            **draft_data.dict()
        )
        db.add(draft)
    
    db.commit()
    db.refresh(draft)
    return CourseDraftResponse.from_orm(draft)

@router.get("/{course_id}/draft", response_model=CourseDraftResponse)
def get_draft(course_id: int, db: Session = Depends(get_db)):
    """Get draft data for a course."""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    draft = db.query(CourseDraft).filter(CourseDraft.course_id == course_id).first()
    if not draft:
        # Return empty draft structure if none exists
        return CourseDraftResponse(
            id=0,
            course_id=course_id,
            mentors=[],
            food_cost=None,
            other_cost=None,
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
    
    return CourseDraftResponse.from_orm(draft)
