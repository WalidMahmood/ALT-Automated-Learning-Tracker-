from sqlalchemy import Column, Integer, String, DateTime, Date, Boolean, ForeignKey, UniqueConstraint, Numeric, Enum, JSON
from sqlalchemy.orm import relationship
from app.db.base import Base
from datetime import datetime, date
import enum

class CourseStatus(str, enum.Enum):
    """Course status enum."""
    DRAFT = "draft"  # Planning/not approved yet
    ONGOING = "ongoing"  # Approved and active
    COMPLETED = "completed"  # Finished
    
    def __str__(self):
        return self.value

class Course(Base):
    __tablename__ = "courses"
    __table_args__ = (
        UniqueConstraint('name', 'batch_code', name='uq_course_name_batch_code'),
    )
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    batch_code = Column(String, index=True, nullable=False)  # Not unique alone - unique with name
    description = Column(String, nullable=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)
    seat_limit = Column(Integer, nullable=False, default=0)
    current_enrolled = Column(Integer, default=0)
    total_classes_offered = Column(Integer, nullable=True)
    prerequisite_course_id = Column(Integer, ForeignKey("courses.id"), nullable=True)
    is_archived = Column(Boolean, default=False)
    status = Column(Enum(CourseStatus, values_callable=lambda x: [e.value for e in x]), nullable=False, default=CourseStatus.DRAFT, index=True)  # draft, ongoing, completed
    course_type = Column(String, nullable=False, default='onsite', index=True)  # onsite, online, external
    location = Column(String, nullable=True)  # For external courses
    cost = Column(Numeric(10, 2), nullable=True)  # For external courses
    food_cost = Column(Numeric(10, 2), nullable=False, default=0.0)
    other_cost = Column(Numeric(10, 2), nullable=False, default=0.0)
    class_schedule = Column(JSON, nullable=True)  # Array of {day: str, start_time: str, end_time: str} e.g., [{"day": "Tuesday", "start_time": "14:00", "end_time": "17:00"}]
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    enrollments = relationship("Enrollment", back_populates="course")  # No cascade - preserve enrollments when course is deleted
    prerequisite = relationship("Course", remote_side=[id], backref="dependent_courses")
    mentors = relationship("CourseMentor", back_populates="course", cascade="all, delete-orphan")
    comments = relationship("CourseComment", back_populates="course", cascade="all, delete-orphan", order_by="CourseComment.created_at.desc()")
    draft = relationship("CourseDraft", back_populates="course", cascade="all, delete-orphan", uselist=False)
    
    def __repr__(self):
        return f"<Course(id={self.id}, name={self.name}, batch_code={self.batch_code})>"

