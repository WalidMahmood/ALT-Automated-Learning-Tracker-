from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Numeric, Text, JSON
from sqlalchemy.orm import relationship
from app.db.base import Base
from datetime import datetime

class CourseDraft(Base):
    """Temporary draft data for planning courses (mentors, costs, etc.) - not saved until approved."""
    __tablename__ = "course_drafts"
    
    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, unique=True, index=True)
    
    # Temporary mentor assignments (stored as JSON)
    mentor_assignments = Column(JSON, nullable=True)  # [{mentor_id, hours_taught, amount_paid}, ...]
    
    # Temporary costs
    food_cost = Column(Numeric(10, 2), nullable=True)
    other_cost = Column(Numeric(10, 2), nullable=True)
    
    # Any other temporary data
    draft_data = Column(JSON, nullable=True)  # For any other temporary fields
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    course = relationship("Course", back_populates="draft", uselist=False)
    
    def __repr__(self):
        return f"<CourseDraft(id={self.id}, course_id={self.course_id})>"

