from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.db.base import Base
from datetime import datetime

class CourseComment(Base):
    """Comment/update history for courses, especially planning courses."""
    __tablename__ = "course_comments"
    
    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    comment = Column(Text, nullable=False)
    created_by = Column(String, nullable=False)  # Admin email or name
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    course = relationship("Course", back_populates="comments")
    
    def __repr__(self):
        return f"<CourseComment(id={self.id}, course_id={self.course_id}, created_by={self.created_by})>"

