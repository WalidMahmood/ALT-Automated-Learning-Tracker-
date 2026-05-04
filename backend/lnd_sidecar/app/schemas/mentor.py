from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from datetime import datetime
from app.schemas.student import StudentResponse

class MentorBase(BaseModel):
    is_internal: bool = True
    student_id: Optional[int] = None
    name: str
    email: Optional[EmailStr] = None
    company: Optional[str] = None
    department: Optional[str] = None  # Changed from sbu enum to department string
    designation: Optional[str] = None
    specialty: Optional[str] = None
    
    @field_validator('email', mode='before')
    @classmethod
    def validate_email(cls, v):
        """Convert empty strings to None for email field."""
        if v == '' or v is None:
            return None
        return v

class MentorCreate(MentorBase):
    """For creating mentors (external or internal)."""
    pass

class MentorUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    company: Optional[str] = None
    department: Optional[str] = None  # Changed from sbu enum to department string
    designation: Optional[str] = None
    specialty: Optional[str] = None

class MentorResponse(MentorBase):
    id: int
    created_at: datetime
    updated_at: datetime
    student: Optional[StudentResponse] = None
    course_count: Optional[int] = 0  # Number of courses this mentor has been assigned to
    
    class Config:
        from_attributes = True

