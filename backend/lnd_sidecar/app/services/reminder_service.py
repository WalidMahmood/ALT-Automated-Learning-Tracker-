"""Service for checking and sending class reminders."""
from datetime import datetime, timedelta
from typing import List
from sqlalchemy.orm import Session
from app.db.base import SessionLocal
from app.models.course import Course
from app.models.class_reminder import ClassReminder
from app.services.email_service import EmailService
from app.core.config import settings
from app.models.course import CourseStatus
import logging

logger = logging.getLogger(__name__)

def get_db():
    """Get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class ReminderService:
    """Service for managing class reminders."""
    
    @staticmethod
    def check_and_send_reminders():
        """
        Check for upcoming classes and send reminders if needed.
        This should be called periodically (e.g., every minute).
        """
        if not EmailService.is_enabled():
            logger.debug("Email service is not enabled. Skipping reminder check.")
            return
        
        if not settings.ADMIN_EMAIL:
            logger.warning("ADMIN_EMAIL is not configured. Cannot send reminders.")
            return
        
        db = SessionLocal()
        try:
            # Get current time
            now = datetime.now()
            reminder_time = now + timedelta(minutes=settings.REMINDER_MINUTES_BEFORE)
            
            # Round to the nearest minute for comparison
            reminder_time = reminder_time.replace(second=0, microsecond=0)
            now_rounded = now.replace(second=0, microsecond=0)
            
            # Get all courses with class schedules
            courses = db.query(Course).all()
            
            reminders_sent = 0
            
            for course in courses:
                # Only send reminders for ongoing courses
                if course.status != CourseStatus.ONGOING:
                    continue
                
                if not course.class_schedule or not isinstance(course.class_schedule, list):
                    continue
                
                # Check each scheduled class
                for schedule in course.class_schedule:
                    if not schedule.get('day') or not schedule.get('start_time'):
                        continue
                    
                    # Get today's date
                    today = now.date()
                    
                    # Map day name to day of week (Python: 0=Monday, 6=Sunday)
                    day_map = {
                        'Monday': 0,
                        'Tuesday': 1,
                        'Wednesday': 2,
                        'Thursday': 3,
                        'Friday': 4,
                        'Saturday': 5,
                        'Sunday': 6
                    }
                    
                    scheduled_day = day_map.get(schedule['day'])
                    if scheduled_day is None:
                        continue
                    
                    # Calculate the date for the next occurrence of the scheduled day
                    today_weekday = today.weekday()  # 0=Monday, 6=Sunday
                    days_until = (scheduled_day - today_weekday) % 7
                    
                    # If it's today, check if the time has already passed
                    if days_until == 0:
                        try:
                            start_hour, start_min = map(int, schedule['start_time'].split(':'))
                            current_minutes = now.hour * 60 + now.minute
                            scheduled_minutes = start_hour * 60 + start_min
                            
                            # If time has passed today, get next week's occurrence
                            if current_minutes >= scheduled_minutes:
                                days_until = 7
                        except (ValueError, IndexError):
                            # If we can't parse time, skip this schedule
                            continue
                    
                    class_date = today + timedelta(days=days_until)
                    
                    # Parse start time
                    try:
                        start_hour, start_min = map(int, schedule['start_time'].split(':'))
                        class_datetime = datetime.combine(class_date, datetime.min.time().replace(hour=start_hour, minute=start_min))
                    except (ValueError, IndexError):
                        logger.warning(f"Invalid start_time format for course {course.id}: {schedule.get('start_time')}")
                        continue
                    
                    # Check if reminder should be sent (within the current minute window)
                    # We want to send reminder exactly REMINDER_MINUTES_BEFORE minutes before class
                    time_diff_minutes = (class_datetime - now_rounded).total_seconds() / 60
                    
                    # Check if we're within 1 minute of the reminder time (to account for scheduler timing)
                    if abs(time_diff_minutes - settings.REMINDER_MINUTES_BEFORE) <= 1:
                        # Check if reminder already sent
                        existing_reminder = db.query(ClassReminder).filter(
                            ClassReminder.course_id == course.id,
                            ClassReminder.class_date == class_datetime,
                            ClassReminder.start_time == schedule['start_time']
                        ).first()
                        
                        if existing_reminder:
                            continue  # Already sent
                        
                        # Check if class is within course date range
                        course_start = course.start_date
                        course_end = course.end_date
                        
                        if class_date < course_start or (course_end and class_date > course_end):
                            continue  # Class is outside course date range
                        
                        # Send reminder
                        try:
                            success = EmailService.send_class_reminder(
                                admin_email=settings.ADMIN_EMAIL,
                                course_name=course.name,
                                batch_code=course.batch_code,
                                class_time=class_datetime,
                                start_time=schedule['start_time'],
                                end_time=schedule.get('end_time', ''),
                                day=schedule['day']
                            )
                            
                            if success:
                                # Record that reminder was sent
                                reminder = ClassReminder(
                                    course_id=course.id,
                                    course_name=course.name,
                                    batch_code=course.batch_code,
                                    class_date=class_datetime,
                                    start_time=schedule['start_time'],
                                    end_time=schedule.get('end_time', ''),
                                    day=schedule['day'],
                                    sent=True
                                )
                                db.add(reminder)
                                db.commit()
                                reminders_sent += 1
                                logger.info(f"Reminder sent for course {course.name} ({course.batch_code}) on {class_datetime}")
                            else:
                                logger.error(f"Failed to send reminder for course {course.id}")
                                
                        except Exception as e:
                            logger.error(f"Error sending reminder for course {course.id}: {str(e)}")
                            db.rollback()
            
            if reminders_sent > 0:
                logger.info(f"Sent {reminders_sent} class reminder(s)")
                
        except Exception as e:
            logger.error(f"Error in reminder check: {str(e)}")
            db.rollback()
        finally:
            db.close()
    
    @staticmethod
    def get_upcoming_classes(hours_ahead: int = 24) -> List[dict]:
        """
        Get list of upcoming classes within the specified hours.
        
        Args:
            hours_ahead: Number of hours to look ahead (default: 24)
            
        Returns:
            List of upcoming class dictionaries
        """
        db = SessionLocal()
        try:
            now = datetime.now()
            end_time = now + timedelta(hours=hours_ahead)
            
            courses = db.query(Course).all()
            upcoming_classes = []
            
            for course in courses:
                if course.status != CourseStatus.ONGOING:
                    continue
                
                if not course.class_schedule or not isinstance(course.class_schedule, list):
                    continue
                
                for schedule in course.class_schedule:
                    if not schedule.get('day') or not schedule.get('start_time'):
                        continue
                    
                    # Calculate next occurrence
                    day_map = {
                        'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3,
                        'Friday': 4, 'Saturday': 5, 'Sunday': 6
                    }
                    
                    scheduled_day = day_map.get(schedule['day'])
                    if scheduled_day is None:
                        continue
                    
                    today = now.date()
                    days_until = (scheduled_day - today.weekday()) % 7
                    
                    if days_until == 0:
                        # Check if time has passed today
                        try:
                            start_hour, start_min = map(int, schedule['start_time'].split(':'))
                            if now.hour * 60 + now.minute >= start_hour * 60 + start_min:
                                days_until = 7  # Next week
                        except (ValueError, IndexError):
                            continue
                    
                    class_date = today + timedelta(days=days_until)
                    
                    try:
                        start_hour, start_min = map(int, schedule['start_time'].split(':'))
                        class_datetime = datetime.combine(class_date, datetime.min.time().replace(hour=start_hour, minute=start_min))
                    except (ValueError, IndexError):
                        continue
                    
                    if now <= class_datetime <= end_time:
                        # Check course date range
                        course_start = course.start_date
                        course_end = course.end_date
                        
                        if class_date >= course_start and (not course_end or class_date <= course_end):
                            upcoming_classes.append({
                                'course_id': course.id,
                                'course_name': course.name,
                                'batch_code': course.batch_code,
                                'class_datetime': class_datetime,
                                'start_time': schedule['start_time'],
                                'end_time': schedule.get('end_time', ''),
                                'day': schedule['day']
                            })
            
            # Sort by datetime
            upcoming_classes.sort(key=lambda x: x['class_datetime'])
            return upcoming_classes
            
        finally:
            db.close()

