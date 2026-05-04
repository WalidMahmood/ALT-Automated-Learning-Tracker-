from sqlalchemy.orm import Session
from typing import Optional

from app.models.course import Course

def get_course_by_batch_code(db: Session, batch_code: str, course_name: Optional[str] = None) -> Optional[Course]:
    """
    Get course by batch code. If course_name is provided, matches both.
    If course_name is not provided, returns the first match (for backward compatibility).
    """
    query = db.query(Course).filter(Course.batch_code == batch_code)
    if course_name:
        query = query.filter(Course.name == course_name)
    return query.first()
