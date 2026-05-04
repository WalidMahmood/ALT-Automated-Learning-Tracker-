"""Database models for caching LMS data."""
from sqlalchemy import Column, Integer, BigInteger, String, Text, DateTime, JSON, Index
from sqlalchemy.sql import func
from app.db.base import Base
import json

class LMSCourseCache(Base):
    """Cache table for LMS courses."""
    __tablename__ = "lms_course_cache"
    
    id = Column(Integer, primary_key=True, index=True)  # LMS course ID
    fullname = Column(String, nullable=False)
    shortname = Column(String)
    summary = Column(Text)
    startdate = Column(BigInteger)  # Unix timestamp
    enddate = Column(BigInteger)  # Unix timestamp
    timecreated = Column(BigInteger)  # Unix timestamp - when course was created
    categoryid = Column(Integer)
    categoryname = Column(String)
    visible = Column(Integer, default=1)
    is_mandatory = Column(Integer, default=0)  # 1 = mandatory, 0 = not mandatory
    cached_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Index on cached_at for efficient cleanup queries
    __table_args__ = (
        Index('idx_lms_course_cache_cached_at', 'cached_at'),
    )
    
    def to_dict(self):
        """Convert to dictionary format matching API response."""
        return {
            "id": self.id,
            "fullname": self.fullname,
            "shortname": self.shortname or "",
            "summary": self.summary or "",
            "startdate": self.startdate,
            "enddate": self.enddate,
            "categoryid": self.categoryid,
            "categoryname": self.categoryname or "Unknown",
            "visible": self.visible,
            "is_mandatory": self.is_mandatory == 1,
        }


class LMSCategoryCache(Base):
    """Cache table for LMS course categories."""
    __tablename__ = "lms_category_cache"
    
    id = Column(Integer, primary_key=True, index=True)  # Category ID
    name = Column(String, nullable=False)
    cached_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class LMSCourseEnrollmentCache(Base):
    """Cache table for course enrollments."""
    __tablename__ = "lms_course_enrollment_cache"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    course_id = Column(Integer, nullable=False, index=True)
    enrollment_data = Column(JSON, nullable=False)  # Store full enrollment data as JSON
    cached_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Index on course_id and cached_at
    __table_args__ = (
        Index('idx_lms_enrollment_cache_course_id', 'course_id'),
        Index('idx_lms_enrollment_cache_cached_at', 'cached_at'),
    )


class LMSUserCourseCache(Base):
    """Cache table for user courses."""
    __tablename__ = "lms_user_course_cache"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String, nullable=False, index=True)  # Employee ID / username
    course_data = Column(JSON, nullable=False)  # Store full course data as JSON
    cached_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Index on username and cached_at
    __table_args__ = (
        Index('idx_lms_user_course_cache_username', 'username'),
        Index('idx_lms_user_course_cache_cached_at', 'cached_at'),
    )


class LMSUserCache(Base):
    """Cache table for all LMS users."""
    __tablename__ = "lms_user_cache"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_data = Column(JSON, nullable=False)  # Store full user data as JSON
    cached_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Index on cached_at for efficient cleanup queries
    __table_args__ = (
        Index('idx_lms_user_cache_cached_at', 'cached_at'),
    )

