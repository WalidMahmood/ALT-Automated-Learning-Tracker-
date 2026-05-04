from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.db.base import Base
from datetime import datetime

class Mentor(Base):
    """Mentor model - can be internal (linked to student) or external."""
    __tablename__ = "mentors"
    __table_args__ = (
        UniqueConstraint('student_id', name='uq_mentor_student_id'),
    )
    
    id = Column(Integer, primary_key=True, index=True)
    is_internal = Column(Boolean, default=True, nullable=False)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=True, unique=True, index=True)
    
    # For external mentors, these are required. For internal, they can mirror student data
    name = Column(String, nullable=False)
    email = Column(String, nullable=True, index=True)
    company = Column(String, nullable=True)  # Company name for external mentors
    department = Column(String, nullable=True)  # Changed from sbu enum to department string
    designation = Column(String, nullable=True)  # For internal mentors, may mirror student
    specialty = Column(String, nullable=True)  # Specialty/area of expertise
    external_id = Column(Integer, nullable=True)  # Auto-incrementing ID for external mentors (starts from 1)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    student = relationship("Student", foreign_keys=[student_id])
    course_assignments = relationship("CourseMentor", back_populates="mentor", cascade="all, delete-orphan")
    
    def __repr__(self):
        mentor_type = "Internal" if self.is_internal else "External"
        return f"<Mentor(id={self.id}, name={self.name}, type={mentor_type})>"

