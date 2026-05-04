"""LMS User model - stores all users from the LMS (Moodle) system."""

from sqlalchemy import Column, Integer, String, DateTime, Boolean, JSON, BigInteger, Index, ForeignKey, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base


class LMSUserCourse(Base):
    """Model for storing LMS course enrollments for students."""
    
    __tablename__ = "lms_user_courses"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Link to student
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id = Column(String, index=True, nullable=False)  # e.g., BS0733
    
    # LMS identifiers
    lms_user_id = Column(String, nullable=True)  # LMS user id
    lms_course_id = Column(String, nullable=False, index=True)  # LMS course id
    
    # Course info
    course_name = Column(String, nullable=False)
    course_shortname = Column(String, nullable=True)
    category_name = Column(String, nullable=True)
    is_mandatory = Column(Integer, default=0, nullable=False)  # 1 = mandatory, 0 = not mandatory
    
    # Progress tracking
    progress = Column(Float, default=0, nullable=True)  # 0-100
    completed = Column(Boolean, default=False, nullable=False)
    completion_date = Column(DateTime, nullable=True)
    
    # Course dates
    start_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=True)
    last_access = Column(DateTime, nullable=True)
    
    # Enrollment timestamp from LMS (when user was actually enrolled in the course)
    enrollment_time = Column(DateTime, nullable=True)  # From LMS API timecreated/timestart if available
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationship
    student = relationship("Student", backref="lms_courses")
    
    __table_args__ = (
        Index('idx_lms_user_course_student', 'student_id'),
        Index('idx_lms_user_course_employee', 'employee_id'),
        Index('idx_lms_user_course_course', 'lms_course_id'),
        # Unique constraint: one enrollment per student per course
        Index('idx_lms_user_course_unique', 'student_id', 'lms_course_id', unique=True),
    )
    
    def __repr__(self):
        return f"<LMSUserCourse(student={self.employee_id}, course={self.course_name})>"


class LMSUser(Base):
    """Model for storing LMS (Moodle) user data."""
    
    __tablename__ = "lms_users"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # LMS identifiers
    lms_id = Column(Integer, unique=True, index=True, nullable=False)  # id from LMS
    username = Column(String, unique=True, index=True, nullable=False)  # Usually employee_id (e.g., BS0733)
    
    # User info
    firstname = Column(String, nullable=True)
    lastname = Column(String, nullable=True)
    fullname = Column(String, nullable=True)
    email = Column(String, index=True, nullable=True)
    department = Column(String, nullable=True)
    
    # Access timestamps (Unix timestamps from LMS)
    firstaccess = Column(BigInteger, nullable=True)
    lastaccess = Column(BigInteger, nullable=True)
    
    # Account status
    auth = Column(String, nullable=True)  # e.g., "manual"
    suspended = Column(Boolean, default=False, nullable=True)
    confirmed = Column(Boolean, default=True, nullable=True)
    
    # Preferences
    lang = Column(String, nullable=True)
    theme = Column(String, nullable=True)
    timezone = Column(String, nullable=True)
    mailformat = Column(Integer, nullable=True)
    country = Column(String, nullable=True)
    
    # Description
    description = Column(String, nullable=True)
    descriptionformat = Column(Integer, nullable=True)
    
    # Profile images
    profileimageurlsmall = Column(String, nullable=True)
    profileimageurl = Column(String, nullable=True)
    
    # Custom fields stored as JSON (includes employment status, etc.)
    customfields = Column(JSON, nullable=True)
    
    # Full LMS data as JSON for reference
    lms_data = Column(JSON, nullable=True)
    
    # Timestamps
    cached_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    __table_args__ = (
        Index('idx_lms_user_lms_id', 'lms_id'),
        Index('idx_lms_user_username', 'username'),
        Index('idx_lms_user_email', 'email'),
    )
    
    def __repr__(self):
        return f"<LMSUser(id={self.id}, username={self.username}, fullname={self.fullname})>"

