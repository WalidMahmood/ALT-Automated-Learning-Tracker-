from sqlalchemy.orm import Session, selectinload, joinedload
from sqlalchemy import or_
from datetime import date, datetime, timedelta
from typing import List, Optional, Dict, Any
from decimal import Decimal
import logging

from app.models.course import Course, CourseStatus
from app.models.course_mentor import CourseMentor
from app.models.mentor import Mentor
from app.models.course_comment import CourseComment
from app.models.course_draft import CourseDraft
from app.schemas.course import CourseCreate, CourseUpdate, CourseResponse, CourseCostUpdate
from app.schemas.course_mentor import CourseMentorCreate, CourseMentorResponse
from app.schemas.course_comment import CourseCommentCreate, CourseCommentResponse
from app.schemas.course_draft import CourseDraftCreate, CourseDraftResponse

logger = logging.getLogger(__name__)

class CourseService:
    @staticmethod
    def create_course(db: Session, course_data: CourseCreate) -> Course:
        """Create a new course batch with validation."""
        # Check for duplicate batch code within the same course name
        existing = db.query(Course).filter(
            Course.name == course_data.name,
            Course.batch_code == course_data.batch_code
        ).first()
        if existing:
            raise ValueError(f"Batch code '{course_data.batch_code}' already exists for course '{course_data.name}'")
        
        # Check for overlapping batches if needed
        if course_data.start_date:
            end_date_check = course_data.end_date if course_data.end_date else date.today() + timedelta(days=365)
            overlapping = db.query(Course).filter(
                Course.name == course_data.name,
                Course.start_date <= end_date_check,
                or_(Course.end_date >= course_data.start_date, Course.end_date.is_(None))
            ).first()
            if overlapping:
                raise ValueError("Overlapping batch exists for this course")
        
        course_dict = course_data.dict()
        # Ensure status is set (default to DRAFT if not provided)
        if 'status' not in course_dict or course_dict['status'] is None:
            course_dict['status'] = CourseStatus.DRAFT
        
        db_course = Course(**course_dict)
        db.add(db_course)
        db.commit()
        db.refresh(db_course)
        
        # Load relationships for response
        return db.query(Course).options(
            selectinload(Course.mentors).joinedload(CourseMentor.mentor),
            selectinload(Course.comments),
            selectinload(Course.draft)
        ).filter(Course.id == db_course.id).first()

    @staticmethod
    def update_course(db: Session, course_id: int, course_update: CourseUpdate) -> Course:
        """Update a course with validation."""
        course = db.query(Course).filter(Course.id == course_id).first()
        if not course:
            return None
        
        update_data = course_update.dict(exclude_unset=True)
        
        # Check for duplicate batch code within the same course name if name or batch_code is being updated
        if 'name' in update_data or 'batch_code' in update_data:
            new_name = update_data.get('name', course.name)
            new_batch_code = update_data.get('batch_code', course.batch_code)
            
            existing = db.query(Course).filter(
                Course.id != course_id,  # Exclude current course
                Course.name == new_name,
                Course.batch_code == new_batch_code
            ).first()
            
            if existing:
                raise ValueError(f"Batch code '{new_batch_code}' already exists for course '{new_name}'")
        
        for field, value in update_data.items():
            setattr(course, field, value)
        
        db.commit()
        db.refresh(course)
        return course

    @staticmethod
    def get_courses(db: Session, skip: int = 0, limit: int = 100, course_type: Optional[str] = None) -> List[CourseResponse]:
        """Get all courses with auto-status update."""
        # Auto-update course status
        today = date.today()
        courses_to_update = db.query(Course).filter(
            Course.status == CourseStatus.ONGOING,
            Course.end_date.isnot(None),
            Course.end_date <= today
        ).all()
        
        for course in courses_to_update:
            course.status = CourseStatus.COMPLETED
            course.updated_at = datetime.utcnow()
        
        if courses_to_update:
            db.commit()
            logger.info(f"Auto-updated {len(courses_to_update)} course(s) from ongoing to completed based on end_date")
        
        # Query courses
        query = db.query(Course)
        if course_type:
            query = query.filter(Course.course_type == course_type)
            
        courses = query.order_by(Course.start_date.desc()).offset(skip).limit(limit).all()
        
        # Load relationships manually to avoid N+1 and lazy loading issues
        course_ids = [c.id for c in courses]
        course_mentors_map = {}
        course_comments_map = {}
        course_drafts_map = {}
        
        if course_ids:
            # Load mentors
            course_mentors = db.query(CourseMentor).filter(
                CourseMentor.course_id.in_(course_ids)
            ).options(joinedload(CourseMentor.mentor)).all()
            for cm in course_mentors:
                if cm.course_id not in course_mentors_map:
                    course_mentors_map[cm.course_id] = []
                course_mentors_map[cm.course_id].append(cm)
            
            # Load comments
            comments = db.query(CourseComment).filter(
                CourseComment.course_id.in_(course_ids)
            ).order_by(CourseComment.created_at.desc()).all()
            for comment in comments:
                if comment.course_id not in course_comments_map:
                    course_comments_map[comment.course_id] = []
                course_comments_map[comment.course_id].append(comment)
            
            # Load drafts
            drafts = db.query(CourseDraft).filter(
                CourseDraft.course_id.in_(course_ids)
            ).all()
            for draft in drafts:
                course_drafts_map[draft.course_id] = draft
        
        result = []
        for course in courses:
            try:
                # Get mentors
                course_mentors_list = course_mentors_map.get(course.id, [])
                if not course_mentors_list and hasattr(course, 'mentors') and course.mentors:
                    course_mentors_list = course.mentors
                
                # Calculate costs
                total_mentor_cost = sum(float(cm.amount_paid) for cm in course_mentors_list) if course_mentors_list else 0.0
                total_training_cost = float(course.food_cost or 0) + float(course.other_cost or 0) + total_mentor_cost
                
                # Serialize mentors
                mentors_list = []
                for cm in course_mentors_list:
                    try:
                        mentors_list.append(CourseMentorResponse.from_orm(cm))
                    except Exception:
                        continue
                
                # Get comments and draft
                comments_list = course_comments_map.get(course.id, [])
                if not comments_list and hasattr(course, 'comments') and course.comments:
                    comments_list = course.comments
                
                draft_obj = course_drafts_map.get(course.id)
                if not draft_obj and hasattr(course, 'draft') and course.draft:
                    draft_obj = course.draft
                
                course_dict = {
                    'id': course.id,
                    'name': course.name,
                    'batch_code': course.batch_code,
                    'description': course.description,
                    'start_date': course.start_date,
                    'end_date': course.end_date,
                    'seat_limit': course.seat_limit,
                    'current_enrolled': course.current_enrolled or 0,
                    'total_classes_offered': course.total_classes_offered,
                    'prerequisite_course_id': course.prerequisite_course_id,
                    'is_archived': course.is_archived if course.is_archived is not None else False,
                    'status': course.status if hasattr(course, 'status') and course.status else CourseStatus.DRAFT,
                    'course_type': course.course_type if hasattr(course, 'course_type') else 'onsite',
                    'location': course.location if hasattr(course, 'location') else None,
                    'cost': course.cost if hasattr(course, 'cost') else None,
                    'food_cost': Decimal(str(course.food_cost)) if course.food_cost is not None else Decimal('0'),
                    'other_cost': Decimal(str(course.other_cost)) if course.other_cost is not None else Decimal('0'),
                    'class_schedule': course.class_schedule if hasattr(course, 'class_schedule') else None,
                    'total_training_cost': Decimal(str(total_training_cost)),
                    'mentors': mentors_list if mentors_list else None,
                    'comments': [CourseCommentResponse.from_orm(c) for c in comments_list] if comments_list else None,
                    'draft': CourseDraftResponse.from_orm(draft_obj) if draft_obj else None,
                    'created_at': course.created_at,
                    'updated_at': course.updated_at,
                }
                result.append(CourseResponse(**course_dict))
            except Exception as e:
                logger.warning(f"Failed to serialize course {course.id}: {str(e)}")
                continue
                
        return result

    @staticmethod
    def get_course_details(db: Session, course_id: int) -> CourseResponse:
        """Get full details for a single course."""
        course = db.query(Course).options(
            selectinload(Course.mentors).joinedload(CourseMentor.mentor),
            selectinload(Course.comments),
            selectinload(Course.draft)
        ).filter(Course.id == course_id).first()
        
        if not course:
            return None
        
        # Get mentor assignments
        course_mentors = course.mentors if course.mentors else []
        if not course_mentors:
            course_mentors = db.query(CourseMentor).filter(
                CourseMentor.course_id == course_id
            ).options(joinedload(CourseMentor.mentor)).all()
        
        # Calculate costs
        total_mentor_cost = sum(float(cm.amount_paid) for cm in course_mentors) if course_mentors else 0.0
        total_training_cost = float(course.food_cost or 0) + float(course.other_cost or 0) + total_mentor_cost
        
        course_dict = {
            'id': course.id,
            'name': course.name,
            'batch_code': course.batch_code,
            'description': course.description,
            'start_date': course.start_date,
            'end_date': course.end_date,
            'seat_limit': course.seat_limit,
            'current_enrolled': course.current_enrolled or 0,
            'total_classes_offered': course.total_classes_offered,
            'prerequisite_course_id': course.prerequisite_course_id,
            'is_archived': course.is_archived if course.is_archived is not None else False,
            'status': course.status if hasattr(course, 'status') and course.status else CourseStatus.DRAFT,
            'course_type': course.course_type if hasattr(course, 'course_type') else 'onsite',
            'location': course.location if hasattr(course, 'location') else None,
            'cost': course.cost if hasattr(course, 'cost') else None,
            'food_cost': Decimal(str(course.food_cost)) if course.food_cost is not None else Decimal('0'),
            'other_cost': Decimal(str(course.other_cost)) if course.other_cost is not None else Decimal('0'),
            'class_schedule': course.class_schedule if hasattr(course, 'class_schedule') else None,
            'total_training_cost': Decimal(str(total_training_cost)),
            'mentors': [CourseMentorResponse.from_orm(cm) for cm in course_mentors] if course_mentors else None,
            'comments': [CourseCommentResponse.from_orm(c) for c in course.comments] if course.comments else None,
            'draft': CourseDraftResponse.from_orm(course.draft) if course.draft else None,
            'created_at': course.created_at,
            'updated_at': course.updated_at,
        }
        
        return CourseResponse(**course_dict)

    @staticmethod
    def delete_course(db: Session, course_id: int) -> bool:
        """Permanently delete a course, preserving enrollment history."""
        from app.models.enrollment import Enrollment
        
        course = db.query(Course).filter(Course.id == course_id).first()
        if not course:
            return False
        
        # Preserve enrollments
        enrollments = db.query(Enrollment).filter(Enrollment.course_id == course_id).all()
        for enrollment in enrollments:
            if not enrollment.course_name:
                enrollment.course_name = course.name
            if not enrollment.batch_code:
                enrollment.batch_code = course.batch_code
            enrollment.course_id = None
        
        db.delete(course)
        db.commit()
        return True

    @staticmethod
    def assign_mentor(db: Session, course_id: int, assignment: CourseMentorCreate) -> CourseMentorResponse:
        """Assign or update mentor for a course."""
        course = db.query(Course).filter(Course.id == course_id).first()
        if not course:
            raise ValueError("Course not found")
        
        mentor = db.query(Mentor).filter(Mentor.id == assignment.mentor_id).first()
        if not mentor:
            raise ValueError("Mentor not found")
        
        existing = db.query(CourseMentor).filter(
            CourseMentor.course_id == course_id,
            CourseMentor.mentor_id == assignment.mentor_id
        ).first()
        
        if existing:
            existing.hours_taught = assignment.hours_taught
            existing.amount_paid = assignment.amount_paid
            db.commit()
            db.refresh(existing)
            return CourseMentorResponse.from_orm(existing)
        else:
            db_assignment = CourseMentor(
                course_id=course_id,
                mentor_id=assignment.mentor_id,
                hours_taught=assignment.hours_taught,
                amount_paid=assignment.amount_paid
            )
            db.add(db_assignment)
            db.commit()
            db.refresh(db_assignment)
            return CourseMentorResponse.from_orm(db_assignment)
