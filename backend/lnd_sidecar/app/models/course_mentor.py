from sqlalchemy import Column, Integer, Float, DateTime, ForeignKey, UniqueConstraint, Numeric
from sqlalchemy.orm import relationship
from app.db.base import Base
from datetime import datetime

class CourseMentor(Base):
    """Association table for course-mentor assignments with payment and hours tracking."""
    __tablename__ = "course_mentors"
    __table_args__ = (
        UniqueConstraint('course_id', 'mentor_id', name='uq_course_mentor'),
    )
    
    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    mentor_id = Column(Integer, ForeignKey("mentors.id"), nullable=False, index=True)
    
    hours_taught = Column(Numeric(10, 2), nullable=False, default=0.0)
    amount_paid = Column(Numeric(10, 2), nullable=False, default=0.0)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    course = relationship("Course", back_populates="mentors")
    mentor = relationship("Mentor", back_populates="course_assignments")
    
    def __repr__(self):
        return f"<CourseMentor(id={self.id}, course_id={self.course_id}, mentor_id={self.mentor_id}, hours={self.hours_taught}, amount={self.amount_paid})>"

