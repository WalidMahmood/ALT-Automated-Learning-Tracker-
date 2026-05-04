from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from decimal import Decimal
from app.schemas.mentor import MentorResponse

class CourseMentorBase(BaseModel):
    mentor_id: int
    hours_taught: Decimal
    amount_paid: Decimal

class CourseMentorCreate(CourseMentorBase):
    """For creating/updating course-mentor assignments."""
    pass

class CourseMentorUpdate(BaseModel):
    hours_taught: Optional[Decimal] = None
    amount_paid: Optional[Decimal] = None

class CourseMentorResponse(CourseMentorBase):
    id: int
    course_id: int
    mentor: MentorResponse
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

