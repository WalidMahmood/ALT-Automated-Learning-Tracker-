"""Service for caching LMS data to reduce API calls."""
from sqlalchemy.orm import Session
from sqlalchemy import and_
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional, Any
import logging
from app.models.lms_cache import (
    LMSCourseCache,
    LMSCategoryCache,
    LMSCourseEnrollmentCache,
    LMSUserCourseCache,
    LMSUserCache
)
from app.services.lms.client import LMSService

logger = logging.getLogger(__name__)

class LMSSyncService:
    """Service for managing LMS data synchronization."""
    
    # Sync expiry time (24 hours)
    SYNC_EXPIRY_HOURS = 24
    
    @staticmethod
    def is_sync_valid(synced_at: datetime) -> bool:
        """Check if sync is still valid (within expiry time)."""
        if not synced_at:
            return False
        # Ensure both datetimes are timezone-aware for comparison
        if synced_at.tzinfo is None:
            # If synced_at is naive, assume it's UTC
            synced_at = synced_at.replace(tzinfo=timezone.utc)
        
        now = datetime.now(timezone.utc)
        expiry_time = synced_at + timedelta(hours=LMSSyncService.SYNC_EXPIRY_HOURS)
        return now < expiry_time
    
    @staticmethod
    async def get_cached_courses(db: Session) -> Optional[List[Dict[str, Any]]]:
        """Get cached courses if available and valid."""
        try:
            # Get all cached courses
            cached_courses = db.query(LMSCourseCache).all()
            
            if not cached_courses:
                return None
            
            # Check if cache is valid (check first course's cached_at)
            if cached_courses and not LMSSyncService.is_sync_valid(cached_courses[0].cached_at):
                logger.info("Course cache expired, will refresh")
                return None
            
            # Convert to dict format
            courses = [course.to_dict() for course in cached_courses]
            logger.info(f"Retrieved {len(courses)} courses from cache")
            return courses
            
        except Exception as e:
            logger.error(f"Error retrieving cached courses: {str(e)}")
            return None
    
    @staticmethod
    async def cache_courses(db: Session, courses: List[Dict[str, Any]], category_map: Dict[int, str]):
        """Cache courses and categories."""
        try:
            # Clear existing cache
            db.query(LMSCourseCache).delete()
            db.query(LMSCategoryCache).delete()
            
            # Cache categories
            now = datetime.now(timezone.utc)
            for cat_id, cat_name in category_map.items():
                category_cache = LMSCategoryCache(
                    id=cat_id,
                    name=cat_name,
                    cached_at=now
                )
                db.merge(category_cache)
            
            # Cache courses
            for course in courses:
                # Check if course is mandatory - from LMS custom fields
                # LMS uses customfields with shortname "is_mandatory" (primary) or "mandatory_status" (fallback)
                # Value can be "Mandatory" or "Optional"
                is_mandatory = 0
                is_mandatory_found = False
                custom_fields = course.get("customfields", [])
                
                # First, look for the primary "is_mandatory" field
                for field in custom_fields:
                    shortname = field.get("shortname", "").lower()
                    value = field.get("value", "") or ""
                    
                    if shortname == "is_mandatory":
                        is_mandatory_found = True
                        if str(value).lower() == "mandatory":
                            is_mandatory = 1
                        break
                
                # If "is_mandatory" field not found, check "mandatory_status" as fallback
                if not is_mandatory_found:
                    for field in custom_fields:
                        shortname = field.get("shortname", "").lower()
                        value = field.get("value", "") or ""
                        
                        if shortname == "mandatory_status":
                            if str(value).lower() == "mandatory":
                                is_mandatory = 1
                            break
                
                course_cache = LMSCourseCache(
                    id=course.get("id"),
                    fullname=course.get("fullname", ""),
                    shortname=course.get("shortname", ""),
                    summary=course.get("summary", ""),
                    startdate=course.get("startdate"),
                    enddate=course.get("enddate"),
                    timecreated=course.get("timecreated"),  # Store course creation time
                    categoryid=course.get("categoryid"),
                    categoryname=category_map.get(course.get("categoryid"), "Unknown"),
                    visible=course.get("visible", 1),
                    is_mandatory=is_mandatory,
                    cached_at=now
                )
                db.merge(course_cache)
            
            db.commit()
            logger.info(f"Cached {len(courses)} courses and {len(category_map)} categories")
            
        except Exception as e:
            db.rollback()
            logger.error(f"Error caching courses: {str(e)}")
            raise
    
    @staticmethod
    async def get_cached_categories(db: Session) -> Optional[Dict[int, str]]:
        """Get cached categories if available and valid."""
        try:
            cached_categories = db.query(LMSCategoryCache).all()
            
            if not cached_categories:
                return None
            
            # Check if cache is valid
            if cached_categories and not LMSSyncService.is_sync_valid(cached_categories[0].cached_at):
                logger.info("Category cache expired, will refresh")
                return None
            
            # Convert to dict
            category_map = {cat.id: cat.name for cat in cached_categories}
            logger.info(f"Retrieved {len(category_map)} categories from cache")
            return category_map
            
        except Exception as e:
            logger.error(f"Error retrieving cached categories: {str(e)}")
            return None
    
    @staticmethod
    async def get_cached_course_enrollments(db: Session, course_id: int) -> Optional[List[Dict[str, Any]]]:
        """Get cached enrollments for a course if available and valid."""
        try:
            cached_enrollment = db.query(LMSCourseEnrollmentCache).filter(
                LMSCourseEnrollmentCache.course_id == course_id
            ).first()
            
            if not cached_enrollment:
                return None
            
            # Check if cache is valid
            if not LMSSyncService.is_sync_valid(cached_enrollment.cached_at):
                logger.info(f"Enrollment cache expired for course {course_id}, will refresh")
                return None
            
            # Return enrollment data
            enrollments = cached_enrollment.enrollment_data
            logger.info(f"Retrieved {len(enrollments)} enrollments from cache for course {course_id}")
            return enrollments
            
        except Exception as e:
            logger.error(f"Error retrieving cached enrollments: {str(e)}")
            return None
    
    @staticmethod
    async def cache_course_enrollments(db: Session, course_id: int, enrollments: List[Dict[str, Any]]):
        """Cache enrollments for a course."""
        try:
            # Delete existing cache for this course
            db.query(LMSCourseEnrollmentCache).filter(
                LMSCourseEnrollmentCache.course_id == course_id
            ).delete()
            
            # Cache new enrollments
            enrollment_cache = LMSCourseEnrollmentCache(
                course_id=course_id,
                enrollment_data=enrollments,
                cached_at=datetime.now(timezone.utc)
            )
            db.add(enrollment_cache)
            db.commit()
            logger.info(f"Cached {len(enrollments)} enrollments for course {course_id}")
            
        except Exception as e:
            db.rollback()
            logger.error(f"Error caching enrollments: {str(e)}")
            raise
    
    @staticmethod
    async def get_cached_user_courses(db: Session, username: str) -> Optional[List[Dict[str, Any]]]:
        """Get cached courses for a user if available and valid."""
        try:
            cached_user_courses = db.query(LMSUserCourseCache).filter(
                LMSUserCourseCache.username == username
            ).all()
            
            if not cached_user_courses:
                return None
            
            # Check if cache is valid (check first entry)
            if cached_user_courses and not LMSSyncService.is_sync_valid(cached_user_courses[0].cached_at):
                logger.info(f"User course cache expired for {username}, will refresh")
                return None
            
            # Combine all course data
            courses = []
            for cache_entry in cached_user_courses:
                courses.append(cache_entry.course_data)
            
            logger.info(f"Retrieved {len(courses)} courses from cache for user {username}")
            return courses
            
        except Exception as e:
            logger.error(f"Error retrieving cached user courses: {str(e)}")
            return None
    
    @staticmethod
    async def cache_user_courses(db: Session, username: str, courses: List[Dict[str, Any]]):
        """Cache courses for a user."""
        try:
            # Delete existing cache for this user
            db.query(LMSUserCourseCache).filter(
                LMSUserCourseCache.username == username
            ).delete()
            
            # Cache new courses (one entry per course)
            now = datetime.now(timezone.utc)
            for course in courses:
                user_course_cache = LMSUserCourseCache(
                    username=username,
                    course_data=course,
                    cached_at=now
                )
                db.add(user_course_cache)
            
            db.commit()
            logger.info(f"Cached {len(courses)} courses for user {username}")
            
        except Exception as e:
            db.rollback()
            logger.error(f"Error caching user courses: {str(e)}")
            raise
    
    @staticmethod
    async def get_cached_users(db: Session) -> Optional[List[Dict[str, Any]]]:
        """Get cached users if available and valid."""
        try:
            cached_user_entry = db.query(LMSUserCache).first()
            
            if not cached_user_entry:
                return None
            
            # Check if cache is valid
            if not LMSSyncService.is_sync_valid(cached_user_entry.cached_at):
                logger.info("User cache expired, will refresh")
                return None
            
            # Return user data
            users = cached_user_entry.user_data
            logger.info(f"Retrieved {len(users)} users from cache")
            return users
            
        except Exception as e:
            logger.error(f"Error retrieving cached users: {str(e)}")
            return None
    
    @staticmethod
    async def cache_users(db: Session, users: List[Dict[str, Any]]):
        """Cache all users."""
        try:
            # Clear existing cache
            db.query(LMSUserCache).delete()
            
            # Cache users (store all in one entry as JSON)
            user_cache = LMSUserCache(
                user_data=users,
                cached_at=datetime.now(timezone.utc)
            )
            db.add(user_cache)
            db.commit()
            logger.info(f"Cached {len(users)} users")
            
        except Exception as e:
            db.rollback()
            logger.error(f"Error caching users: {str(e)}")
            raise
    
    @staticmethod
    async def refresh_all_caches(db: Session):
        """Refresh all LMS caches by fetching from API.
        
        This refreshes:
        - All users (core_user_get_users)
        - All courses (core_course_get_courses)
        - All categories (core_course_get_categories or fallback)
        
        Note: Course enrollments and user courses are cached on-demand when requested.
        """
        logger.info("Starting full LMS cache refresh...")
        
        try:
            # Refresh users first (needed for user lookups)
            logger.info("Fetching all users from LMS API...")
            users = await LMSService.fetch_all_users()
            await LMSSyncService.cache_users(db, users)
            logger.info(f"Cached {len(users)} users")
            
            # Refresh courses and categories
            logger.info("Fetching courses from LMS API...")
            courses = await LMSService.fetch_lms_courses()
            category_map = await LMSService.fetch_course_categories()
            await LMSSyncService.cache_courses(db, courses, category_map)
            logger.info(f"Cached {len(courses)} courses and {len(category_map)} categories")
            
            logger.info("LMS cache refresh completed successfully - all data cached")
            
        except Exception as e:
            logger.error(f"Error refreshing LMS cache: {str(e)}")
            raise
    
    @staticmethod
    def cleanup_old_cache(db: Session, days_old: int = 7):
        """Clean up cache entries older than specified days."""
        try:
            cutoff_date = datetime.now(timezone.utc) - timedelta(days=days_old)
            
            # Delete old course cache
            deleted_courses = db.query(LMSCourseCache).filter(
                LMSCourseCache.cached_at < cutoff_date
            ).delete()
            
            # Delete old category cache
            deleted_categories = db.query(LMSCategoryCache).filter(
                LMSCategoryCache.cached_at < cutoff_date
            ).delete()
            
            # Delete old enrollment cache
            deleted_enrollments = db.query(LMSCourseEnrollmentCache).filter(
                LMSCourseEnrollmentCache.cached_at < cutoff_date
            ).delete()
            
            # Delete old user course cache
            deleted_user_courses = db.query(LMSUserCourseCache).filter(
                LMSUserCourseCache.cached_at < cutoff_date
            ).delete()
            
            # Delete old user cache
            deleted_users = db.query(LMSUserCache).filter(
                LMSUserCache.cached_at < cutoff_date
            ).delete()
            
            db.commit()
            logger.info(f"Cleaned up old cache: {deleted_courses} courses, {deleted_categories} categories, "
                       f"{deleted_enrollments} enrollments, {deleted_user_courses} user courses, {deleted_users} user entries")
            
        except Exception as e:
            db.rollback()
            logger.error(f"Error cleaning up old cache: {str(e)}")

