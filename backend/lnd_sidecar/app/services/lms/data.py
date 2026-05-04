from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Dict, Any, Optional
from datetime import datetime
import logging

from app.models.lms_cache import LMSCourseCache
from app.models.lms_user import LMSUserCourse as LMSUserCourseModel
from app.models.student import Student
from app.services.lms.client import LMSService
from app.services.lms.sync import LMSSyncService

logger = logging.getLogger(__name__)

class LMSDataService:
    @staticmethod
    def get_courses(db: Session, include_enrollment_counts: bool = False) -> List[Dict[str, Any]]:
        """Get all online courses from LOCAL DATABASE ONLY."""
        cached_courses = db.query(LMSCourseCache).all()
        
        if not cached_courses:
            return []
        
        result = []
        for course in cached_courses:
            course_data = {
                "id": course.id,
                "fullname": course.fullname or "",
                "startdate": course.startdate,
                "enddate": course.enddate,
                "categoryid": course.categoryid,
                "categoryname": course.categoryname or "Unknown",
                "shortname": course.shortname or "",
                "summary": course.summary or "",
                "visible": course.visible or 1,
                "is_mandatory": course.is_mandatory == 1 if course.is_mandatory is not None else False,
            }
            
            if include_enrollment_counts:
                total_count = db.query(LMSUserCourseModel).filter(
                    LMSUserCourseModel.lms_course_id == str(course.id)
                ).count()
                
                active_count = db.query(LMSUserCourseModel).join(
                    Student, LMSUserCourseModel.student_id == Student.id
                ).filter(
                    LMSUserCourseModel.lms_course_id == str(course.id),
                    Student.is_active == True
                ).count()
                
                previous_count = total_count - active_count
                
                course_data["enrollment_count"] = total_count
                course_data["active_enrollment_count"] = active_count
                course_data["previous_enrollment_count"] = previous_count
            
            result.append(course_data)
        
        return result

    @staticmethod
    def get_course_enrollments(db: Session, course_id: int) -> List[Dict[str, Any]]:
        """Get all enrolled users for a course from LOCAL DATABASE ONLY."""
        enrollments = db.query(LMSUserCourseModel).filter(
            LMSUserCourseModel.lms_course_id == str(course_id)
        ).all()
        
        result = []
        for enrollment in enrollments:
            student = db.query(Student).filter(Student.id == enrollment.student_id).first()
            
            reporting_manager_email = None
            if student and student.reporting_manager_employee_id:
                reporting_manager = db.query(Student).filter(
                    Student.employee_id == student.reporting_manager_employee_id
                ).first()
                if reporting_manager:
                    reporting_manager_email = reporting_manager.email
            
            user_data = {
                "id": enrollment.id,
                "student_id": enrollment.student_id,
                "username": enrollment.employee_id,
                "employee_id": enrollment.employee_id,
                "fullname": student.name if student else "",
                "email": student.email if student else "",
                "department": student.department if student else "",
                "sbu_name": student.sbu_name if student else "",
                "designation": student.designation if student else "",
                "reporting_manager_name": student.reporting_manager_name if student else "",
                "reporting_manager_email": reporting_manager_email,
                "progress": enrollment.progress or 0,
                "completed": enrollment.completed,
                "firstaccess": int(enrollment.start_date.timestamp()) if enrollment.start_date else None,
                "lastaccess": int(enrollment.last_access.timestamp()) if enrollment.last_access else None,
                "is_active": student.is_active if student else True,
                "sbu_head_employee_id": student.sbu_head_employee_id if student else None,
                "sbu_head_name": student.sbu_head_name if student else None,
                "reporting_manager_employee_id": student.reporting_manager_employee_id if student else None,
                "bs_joining_date": student.bs_joining_date.isoformat() if student and student.bs_joining_date else None,
                "total_experience": student.total_experience if student else None,
                "career_start_date": student.career_start_date.isoformat() if student and student.career_start_date else None,
                "experience_years": student.experience_years if student else 0,
            }
            result.append(user_data)
        
        return result

    @staticmethod
    def get_user_courses(db: Session, username: str) -> Dict[str, Any]:
        """Get all courses for a user from LOCAL DATABASE ONLY."""
        student = db.query(Student).filter(Student.employee_id == username).first()
        
        if not student:
            return {"courses": [], "message": f"User {username} not found in database"}
        
        enrollments = db.query(LMSUserCourseModel).filter(
            LMSUserCourseModel.student_id == student.id
        ).all()
        
        result = []
        for enrollment in enrollments:
            course_data = {
                "id": enrollment.lms_course_id,
                "fullname": enrollment.course_name or "",
                "shortname": enrollment.course_shortname or "",
                "startdate": int(enrollment.start_date.timestamp()) if enrollment.start_date else None,
                "enddate": int(enrollment.end_date.timestamp()) if enrollment.end_date else None,
                "progress": enrollment.progress or 0,
                "completed": 1 if enrollment.completed else 0,
                "lastaccess": int(enrollment.last_access.timestamp()) if enrollment.last_access else None,
                "category": enrollment.category_name,
            }
            result.append(course_data)
        
        return {"courses": result}

    @staticmethod
    async def sync_lms_data(db: Session) -> Dict[str, Any]:
        """Manually trigger LMS data sync."""
        stats = {
            "courses_synced": 0,
            "categories_synced": 0,
            "users_synced": 0,
            "enrollments_synced": 0,
            "errors": []
        }
        
        try:
            # 1. Sync all users
            logger.info("Syncing LMS users...")
            try:
                users = await LMSService.fetch_all_users()
                await LMSSyncService.cache_users(db, users)
                stats["users_synced"] = len(users)
            except Exception as e:
                stats["errors"].append(f"Users sync error: {str(e)}")
            
            # 2. Sync courses and categories
            logger.info("Syncing LMS courses and categories...")
            try:
                courses = await LMSService.fetch_lms_courses()
                category_map = await LMSService.fetch_course_categories()
                await LMSSyncService.cache_courses(db, courses, category_map)
                stats["courses_synced"] = len(courses)
                stats["categories_synced"] = len(category_map)
            except Exception as e:
                stats["errors"].append(f"Courses sync error: {str(e)}")
            
            # 3. Sync enrollments for each course
            logger.info("Syncing LMS enrollments...")
            cached_courses = db.query(LMSCourseCache).all()
            total_courses = len(cached_courses)
            logger.info(f"Processing {total_courses} courses...")
            
            for idx, course in enumerate(cached_courses, 1):
                try:
                    # Log progress every 10 courses or for the first/last course
                    if idx == 1 or idx == total_courses or idx % 10 == 0:
                        logger.info(f"Progress: {idx}/{total_courses} courses processed ({(idx/total_courses*100):.1f}%)")
                    
                    enrolled_users = await LMSService.fetch_course_enrollments(course.id)

                    
                    for user in enrolled_users:
                        username = user.get("username", "")
                        if not username or not username.upper().startswith("BS"):
                            continue
                        
                        # Case-insensitive lookup for student
                        # ERP stores as 'BSxxxx', LMS returns 'bsxxxx'
                        student = db.query(Student).filter(
                            func.lower(Student.employee_id) == username.lower()
                        ).first()
                        if not student:
                            continue
                        
                        existing = db.query(LMSUserCourseModel).filter(
                            LMSUserCourseModel.student_id == student.id,
                            LMSUserCourseModel.lms_course_id == str(course.id)
                        ).first()
                        
                        is_mandatory = 1 if course.is_mandatory == 1 else 0
                        
                        # Get enrollment timestamp from user's enrollment data (not course creation time)
                        enrollment_timestamp = None
                        
                        # Priority 1: Check enrolments array for actual enrollment time
                        if 'enrolments' in user and isinstance(user['enrolments'], list) and len(user['enrolments']) > 0:
                            first_enrol = user['enrolments'][0]
                            if 'timecreated' in first_enrol and first_enrol.get('timecreated'):
                                enrollment_timestamp = datetime.fromtimestamp(first_enrol['timecreated'])
                            elif 'timestart' in first_enrol and first_enrol.get('timestart'):
                                enrollment_timestamp = datetime.fromtimestamp(first_enrol['timestart'])
                        
                        # Priority 2: User-level enrollment fields (from core_enrol_get_enrolled_users)
                        if not enrollment_timestamp:
                            if 'timecreated' in user and user.get('timecreated'):
                                enrollment_timestamp = datetime.fromtimestamp(user['timecreated'])
                            elif 'timestart' in user and user.get('timestart'):
                                enrollment_timestamp = datetime.fromtimestamp(user['timestart'])
                        
                        # Priority 3: First access time (if available and valid)
                        # This is useful when explicit enrollment data is missing but user has accessed the course
                        if not enrollment_timestamp:
                            if 'firstaccess' in user and user.get('firstaccess') and user.get('firstaccess') > 0:
                                enrollment_timestamp = datetime.fromtimestamp(user['firstaccess'])
                        
                        # Note: We do NOT use course.timecreated as that's when the course was created, 
                        # not when the user was enrolled

                        
                        if existing:
                            existing.course_name = course.fullname
                            existing.course_shortname = course.shortname
                            existing.category_name = course.categoryname
                            existing.is_mandatory = is_mandatory
                            existing.start_date = datetime.fromtimestamp(course.startdate) if course.startdate else None
                            existing.end_date = datetime.fromtimestamp(course.enddate) if course.enddate else None
                            # Always update enrollment_time when we have it from API (don't check if it exists)
                            if enrollment_timestamp:
                                existing.enrollment_time = enrollment_timestamp
                        else:
                            new_enrollment = LMSUserCourseModel(
                                student_id=student.id,
                                employee_id=username,
                                lms_course_id=str(course.id),
                                course_name=course.fullname,
                                course_shortname=course.shortname,
                                category_name=course.categoryname,
                                is_mandatory=is_mandatory,
                                start_date=datetime.fromtimestamp(course.startdate) if course.startdate else None,
                                end_date=datetime.fromtimestamp(course.enddate) if course.enddate else None,
                                enrollment_time=enrollment_timestamp,
                            )
                            db.add(new_enrollment)
                        
                        if not student.has_online_course:
                            student.has_online_course = True
                        
                        stats["enrollments_synced"] += 1
                    
                    db.commit()
                except Exception as e:
                    stats["errors"].append(f"Enrollment sync error for course {course.id}: {str(e)}")
                    db.rollback()
            
            return {
                "message": "LMS sync completed",
                "stats": stats
            }
            
        except Exception as e:
            logger.error(f"LMS sync error: {str(e)}")
            raise Exception(f"LMS sync failed: {str(e)}")

    @staticmethod
    def update_course_mandatory_status(db: Session, course_id: int, is_mandatory: bool) -> Dict[str, Any]:
        """Update the is_mandatory status of a specific course."""
        course = db.query(LMSCourseCache).filter(LMSCourseCache.id == course_id).first()
        
        if not course:
            raise ValueError(f"Course with ID {course_id} not found")
        
        course.is_mandatory = 1 if is_mandatory else 0
        db.commit()
        db.refresh(course)
        
        db.query(LMSUserCourseModel).filter(
            LMSUserCourseModel.lms_course_id == str(course_id)
        ).update({"is_mandatory": course.is_mandatory})
        db.commit()
        
        return {
            "course_id": course.id,
            "fullname": course.fullname,
            "is_mandatory": course.is_mandatory,
            "is_mandatory_bool": course.is_mandatory == 1,
            "message": f"Course mandatory status updated to {'mandatory' if is_mandatory else 'optional'}"
        }

    @staticmethod
    def get_enrollments_updated_since(db: Session, updated_since: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Get enrollments that were created or updated after the specified timestamp.
        
        Args:
            db: Database session
            updated_since: Unix timestamp - only return enrollments created/updated after this time
            
        Returns:
            List of enrollment dictionaries with user and course info
        """
        query = db.query(LMSUserCourseModel)
        
        if updated_since:
            # Convert Unix timestamp to datetime
            since_datetime = datetime.fromtimestamp(updated_since)
            
            # Filter: enrollment_time >= updated_since OR updated_at >= updated_since
            query = query.filter(
                (LMSUserCourseModel.enrollment_time >= since_datetime) |
                (LMSUserCourseModel.updated_at >= since_datetime)
            )
        
        enrollments = query.all()
        
        result = []
        for enrollment in enrollments:
            student = db.query(Student).filter(Student.id == enrollment.student_id).first()
            
            enrollment_data = {
                "userid": student.id if student else None,
                "courseid": int(enrollment.lms_course_id),
                "status": 0,  # Active enrollment
                "timestart": int(enrollment.start_date.timestamp()) if enrollment.start_date else None,
                "timeend": int(enrollment.end_date.timestamp()) if enrollment.end_date else None,
                "timecreated": int(enrollment.enrollment_time.timestamp()) if enrollment.enrollment_time else None,
                "timemodified": int(enrollment.updated_at.timestamp()) if enrollment.updated_at else None,
                # Additional fields for convenience
                "username": enrollment.employee_id,
                "course_name": enrollment.course_name,
                "student_name": student.name if student else None,
            }
            result.append(enrollment_data)
        
        return result

    @staticmethod
    async def sync_progress_data(db: Session) -> Dict[str, Any]:
        """Sync progress data for all enrolled students."""
        stats = {
            "students_processed": 0,
            "courses_updated": 0,
            "errors": [],
            "started_at": datetime.utcnow().isoformat(),
        }
        
        try:
            # Get all student IDs who have LMS enrollments (avoid DISTINCT on JSON columns)
            student_ids_with_enrollments = db.query(LMSUserCourseModel.student_id).distinct().all()
            student_ids = [sid[0] for sid in student_ids_with_enrollments]
            
            # Get those students
            students_with_enrollments = db.query(Student).filter(Student.id.in_(student_ids)).all()
            
            logger.info(f"PROGRESS SYNC: Processing {len(students_with_enrollments)} students with enrollments")
            
            from app.models.lms_user import LMSUser  # Import here to avoid circular imports
            
            for student in students_with_enrollments:
                try:
                    # Get LMS User ID for completion checks
                    lms_user = db.query(LMSUser).filter(LMSUser.username == student.employee_id).first()
                    lms_user_id = lms_user.lms_id if lms_user else None
                    
                    # Fetch user's courses with progress using core_enrol_get_users_courses
                    user_courses = await LMSService.fetch_user_courses(student.employee_id, None)  # Don't pass db to avoid cache issues
                    stats["students_processed"] += 1
                    
                    for course_data in user_courses:
                        course_id = str(course_data.get("id", ""))
                        progress = course_data.get("progress", 0) or 0
                        completed = course_data.get("completed", 0) == 1
                        last_access = course_data.get("lastaccess")
                        
                        # Update the LMSUserCourse record with progress
                        enrollment = db.query(LMSUserCourseModel).filter(
                            LMSUserCourseModel.student_id == student.id,
                            LMSUserCourseModel.lms_course_id == course_id
                        ).first()
                        
                        if enrollment:
                            old_progress = enrollment.progress or 0
                            enrollment.progress = progress
                            enrollment.completed = completed or (progress >= 100)
                            if last_access:
                                try:
                                    enrollment.last_access = datetime.fromtimestamp(last_access)
                                except:
                                    pass
                            
                            # Handle completion date
                            if (completed or progress >= 100):
                                # If we don't have a completion date, or if we want to verify it
                                # We should try to fetch the actual completion timestamp from LMS
                                if lms_user_id:
                                    try:
                                        status_data = await LMSService.fetch_course_completion_status(int(course_id), lms_user_id)
                                        if status_data and "completionstatus" in status_data:
                                            completions = status_data["completionstatus"].get("completions", [])
                                            # Find max timecompleted
                                            times = [c.get("timecompleted") for c in completions if c.get("timecompleted")]
                                            if times:
                                                max_time = max(times)
                                                enrollment.completion_date = datetime.fromtimestamp(max_time)
                                    except Exception as e:
                                        logger.warning(f"Failed to fetch completion date for user {student.employee_id} course {course_id}: {e}")
                                
                                # Fallback if API failed or didn't return date, and we still don't have one
                                if not enrollment.completion_date:
                                    enrollment.completion_date = datetime.utcnow()
                            
                            if old_progress != progress:
                                stats["courses_updated"] += 1
                    
                    # Commit after each student to avoid transaction buildup
                    db.commit()
                    
                except Exception as e:
                    db.rollback()  # Rollback on error to clear transaction
                    error_msg = f"Error syncing progress for {student.employee_id}: {str(e)}"
                    if len(stats["errors"]) < 10:  # Limit errors to avoid huge response
                        stats["errors"].append(error_msg)
                    logger.warning(error_msg)
            
            stats["completed_at"] = datetime.utcnow().isoformat()
            return stats
            
        except Exception as e:
            logger.error(f"Progress sync error: {str(e)}")
            raise Exception(f"Progress sync failed: {str(e)}")
