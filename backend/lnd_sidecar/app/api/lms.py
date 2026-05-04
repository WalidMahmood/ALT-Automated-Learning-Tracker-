from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Dict, Any, Optional
from datetime import date
import logging
from app.db.base import get_db
from app.core.auth import get_current_admin
from app.services.lms.data import LMSDataService
from app.services.reporting import ReportService

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/courses")
async def get_lms_courses(
    include_enrollment_counts: bool = Query(False, description="Include enrollment count for each course"),
    db: Session = Depends(get_db),
    current_admin: Dict[str, Any] = Depends(get_current_admin)
):
    """Get all online courses from LOCAL DATABASE ONLY."""
    try:
        courses = LMSDataService.get_courses(db, include_enrollment_counts)
        if not courses:
            return {"courses": [], "message": "No courses in database. Data syncs daily at 12am."}
        return {"courses": courses}
    except Exception as e:
        logger.error(f"Error fetching courses from local database: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching courses: {str(e)}")

@router.get("/courses/{course_id}/enrollments")
async def get_lms_course_enrollments(course_id: int, db: Session = Depends(get_db)):
    """Get all enrolled users for a course from LOCAL DATABASE ONLY."""
    try:
        enrollments = LMSDataService.get_course_enrollments(db, course_id)
        return {"enrollments": enrollments}
    except Exception as e:
        logger.error(f"Error fetching enrollments from local database: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching enrollments: {str(e)}")

@router.get("/users/{username}/courses")
async def get_lms_user_courses(username: str, db: Session = Depends(get_db)):
    """Get all courses for a user from LOCAL DATABASE ONLY."""
    try:
        return LMSDataService.get_user_courses(db, username)
    except Exception as e:
        logger.error(f"Error fetching user courses from local database: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching user courses: {str(e)}")

@router.get("/test-connections")
async def test_api_connections(
    db: Session = Depends(get_db),
    current_admin: Dict[str, Any] = Depends(get_current_admin)
):
    """Test connections to both LMS and ERP APIs."""
    from app.services.erp_service import ERPService
    from app.services.lms.client import LMSService
    from app.core.config import settings
    
    results = {
        "lms": {},
        "erp": {}
    }
    
    # Test LMS connection
    try:
        if not settings.LMS_TOKEN or not settings.LMS_BASE_URL:
            results["lms"] = {
                "connected": False,
                "configured": False,
                "error": "LMS_TOKEN or LMS_BASE_URL is not configured"
            }
        else:
            try:
                users = await LMSService.fetch_all_users()
                results["lms"] = {
                    "connected": True,
                    "configured": True,
                    "url": settings.LMS_BASE_URL,
                    "users_count": len(users),
                    "message": "Successfully connected to LMS API"
                }
            except Exception as e:
                results["lms"] = {
                    "connected": False,
                    "configured": True,
                    "url": settings.LMS_BASE_URL,
                    "error": str(e)
                }
    except Exception as e:
        results["lms"] = {
            "connected": False,
            "configured": False,
            "error": str(e)
        }
    
    # Test ERP connection
    try:
        erp_result = await ERPService.test_connection()
        results["erp"] = erp_result
    except Exception as e:
        results["erp"] = {
            "connected": False,
            "configured": False,
            "error": str(e)
        }
    
    return results

@router.post("/sync")
async def sync_lms_data(
    db: Session = Depends(get_db),
    current_admin: Dict[str, Any] = Depends(get_current_admin)
):
    """Manually trigger LMS data sync."""
    try:
        return await LMSDataService.sync_lms_data(db)
    except Exception as e:
        logger.error(f"LMS sync error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"LMS sync failed: {str(e)}")

@router.get("/courses/{course_id}/check-mandatory")
async def check_course_mandatory(
    course_id: int,
    db: Session = Depends(get_db),
    current_admin: Dict[str, Any] = Depends(get_current_admin)
):
    """Check the is_mandatory status of a specific course."""
    from app.models.lms_cache import LMSCourseCache
    try:
        course = db.query(LMSCourseCache).filter(LMSCourseCache.id == course_id).first()
        if not course:
            raise HTTPException(status_code=404, detail=f"Course with ID {course_id} not found")
        
        return {
            "course_id": course.id,
            "fullname": course.fullname,
            "shortname": course.shortname,
            "is_mandatory": course.is_mandatory,
            "is_mandatory_bool": course.is_mandatory == 1 if course.is_mandatory is not None else False,
            "is_mandatory_type": str(type(course.is_mandatory)),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking course mandatory status: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error checking course: {str(e)}")

@router.put("/courses/{course_id}/mandatory")
async def update_course_mandatory(
    course_id: int,
    is_mandatory: bool = Query(..., description="Set to true for mandatory, false for optional"),
    db: Session = Depends(get_db),
    current_admin: Dict[str, Any] = Depends(get_current_admin)
):
    """Update the is_mandatory status of a specific course."""
    try:
        return LMSDataService.update_course_mandatory_status(db, course_id, is_mandatory)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating course: {str(e)}")

@router.get("/courses/{course_id}/report")
def generate_lms_course_report(
    course_id: int, 
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db)
):
    """Generate an Excel report for an online course with enrolled students data."""
    report = ReportService.generate_lms_course_report(course_id, start_date, end_date, db)
    if not report:
        raise HTTPException(status_code=404, detail="Course not found")
    return report

@router.get("/report/overall")
def generate_overall_lms_report(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db)
):
    """Generate a consolidated Excel report for all online courses with summary stats."""
    return ReportService.generate_overall_lms_report(start_date, end_date, db)

@router.get("/courses/{course_id}/report/summary")
def generate_lms_course_summary_report(
    course_id: int,
    db: Session = Depends(get_db)
):
    """Generate a summary report for a specific online course."""
    report = ReportService.generate_lms_course_summary_report(course_id, db)
    if not report:
        raise HTTPException(status_code=404, detail="Course not found")
    return report

@router.get("/enrollments")
async def get_lms_enrollments_updated_since(
    updated_since: Optional[int] = Query(None, description="Unix timestamp - only return enrollments created/updated after this time"),
    db: Session = Depends(get_db),
    current_admin: Dict[str, Any] = Depends(get_current_admin)
):
    """
    Get enrollments that were created or updated after the specified timestamp.
    
    Note: Moodle API doesn't provide updated_since filtering, so this is implemented
    using our local database. Filters by enrollment_time (timecreated) or updated_at (timemodified).
    """
    try:
        enrollments = LMSDataService.get_enrollments_updated_since(db, updated_since)
        
        return {
            "enrollments": enrollments,
            "count": len(enrollments),
            "synced_after": updated_since if updated_since else None,
            "message": f"Found {len(enrollments)} enrollment(s)" + (f" updated since {updated_since}" if updated_since else "")
        }
    except Exception as e:
        logger.error(f"Error fetching enrollments: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching enrollments: {str(e)}")
