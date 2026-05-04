from pydantic import BaseModel
from datetime import datetime

class CourseCommentCreate(BaseModel):
    comment: str
    created_by: str

class CourseCommentResponse(BaseModel):
    id: int
    course_id: int
    comment: str
    created_by: str
    created_at: datetime
    
    class Config:
        from_attributes = True

