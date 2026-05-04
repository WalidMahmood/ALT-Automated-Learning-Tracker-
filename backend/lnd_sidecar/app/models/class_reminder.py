"""Model for tracking sent class reminders."""
from sqlalchemy import Column, Integer, String, DateTime, Boolean, UniqueConstraint
from app.db.base import Base
from datetime import datetime

class ClassReminder(Base):
    """Track which class reminders have been sent to avoid duplicates."""
    __tablename__ = "class_reminders"
    __table_args__ = (
        UniqueConstraint('course_id', 'class_date', 'start_time', name='uq_class_reminder'),
    )
    
    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, nullable=False, index=True)
    course_name = Column(String, nullable=False)
    batch_code = Column(String, nullable=False)
    class_date = Column(DateTime, nullable=False, index=True)
    start_time = Column(String, nullable=False)  # HH:MM format
    end_time = Column(String, nullable=False)  # HH:MM format
    day = Column(String, nullable=False)  # Day of week
    reminder_sent_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    sent = Column(Boolean, default=True, nullable=False)
    
    def __repr__(self):
        return f"<ClassReminder(id={self.id}, course_id={self.course_id}, class_date={self.class_date})>"

