from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from decimal import Decimal
from app.schemas.course_mentor import CourseMentorResponse
from app.schemas.course_comment import CourseCommentResponse
from app.schemas.course_draft import CourseDraftResponse
from app.models.course import CourseStatus

class CourseCreate(BaseModel):
    name: str
    batch_code: str
    description: Optional[str] = None
    start_date: date
    end_date: Optional[date] = None
    seat_limit: int
    total_classes_offered: Optional[int] = None
    prerequisite_course_id: Optional[int] = None
    status: Optional[CourseStatus] = CourseStatus.DRAFT  # Default to draft for planning courses
    class_schedule: Optional[List[Dict[str, str]]] = None  # Array of {day, start_time, end_time}
    course_type: Optional[str] = 'onsite'  # onsite, online, external
    location: Optional[str] = None  # For external courses
    cost: Optional[Decimal] = None  # For external courses

class CourseUpdate(BaseModel):
    name: Optional[str] = None
    batch_code: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    seat_limit: Optional[int] = None
    total_classes_offered: Optional[int] = None
    prerequisite_course_id: Optional[int] = None
    status: Optional[CourseStatus] = None
    class_schedule: Optional[List[Dict[str, str]]] = None  # Array of {day, start_time, end_time}
    course_type: Optional[str] = None  # onsite, online, external
    location: Optional[str] = None  # For external courses
    cost: Optional[Decimal] = None  # For external courses

class CourseCostUpdate(BaseModel):
    food_cost: Optional[Decimal] = None
    other_cost: Optional[Decimal] = None

class CourseResponse(BaseModel):
    id: int
    name: str
    batch_code: str
    description: Optional[str]
    start_date: date
    end_date: Optional[date]
    seat_limit: int
    current_enrolled: int
    total_classes_offered: Optional[int]
    prerequisite_course_id: Optional[int]
    is_archived: bool
    status: CourseStatus
    course_type: str  # onsite, online, external
    location: Optional[str] = None  # For external courses
    cost: Optional[Decimal] = None  # For external courses
    food_cost: Decimal
    other_cost: Decimal
    class_schedule: Optional[List[Dict[str, str]]] = None  # Array of {day, start_time, end_time}
    total_training_cost: Optional[Decimal] = None  # Computed server-side
    mentors: Optional[List[CourseMentorResponse]] = None
    comments: Optional[List[CourseCommentResponse]] = None
    draft: Optional[CourseDraftResponse] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

