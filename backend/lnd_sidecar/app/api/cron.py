"""Cron job endpoints - NO AUTHENTICATION (protected by secret key).

These endpoints are called by scheduled cron jobs only.
They are the ONLY places where external API calls are made.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
import logging
from app.db.base import get_db
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/sync-progress")
async def sync_progress_only(
    secret_key: str = Query(..., description="Secret key to authorize cron job"),
    db: Session = Depends(get_db)
):
    """
    Sync ONLY progress data from LMS for all enrolled students.
    
    This uses core_enrol_get_users_courses which returns progress and completed status.
    Faster than full sync - only updates progress fields.
    """
    from app.services.lms.data import LMSDataService
    
    # Verify secret key
    expected_key = settings.CRON_SECRET_KEY
    if secret_key != expected_key:
        raise HTTPException(status_code=403, detail="Invalid secret key")
    
    try:
        stats = await LMSDataService.sync_progress_data(db)
        
        logger.info(f"PROGRESS SYNC complete: {stats['students_processed']} students, {stats['courses_updated']} courses updated")
        
        return {
            "message": "Progress sync completed",
            "stats": stats
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"PROGRESS SYNC error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Progress sync failed: {str(e)}")


@router.post("/daily-sync")
async def daily_sync_cron_job(
    secret_key: str = Query(..., description="Secret key to authorize cron job")
):
    """
    CRON JOB ENDPOINT - Daily sync at 12am.
    
    This is the ONLY endpoint that makes external API calls.
    All other endpoints read from local database ONLY.
    
    This endpoint:
    1. Syncs all employees from ERP
    2. Syncs all courses from LMS
    3. Syncs all LMS enrollments
    4. Updates has_online_course flags
    5. Cleans up non-BS employees
    
    Call this from cron job at 12am daily:
    curl -X POST "http://localhost:8000/api/v1/cron/daily-sync?secret_key=YOUR_SECRET"
    """
    from app.services.sync_orchestrator import sync_all_data_async
    
    # Verify secret key
    expected_key = settings.CRON_SECRET_KEY
    if secret_key != expected_key:
        raise HTTPException(status_code=403, detail="Invalid secret key")
    
    try:
        # Use async version directly since we're in an async endpoint
        stats = await sync_all_data_async()
        
        return {
            "message": "Daily sync completed",
            "stats": stats
        }
        
    except Exception as e:
        logger.error(f"CRON: Fatal error in daily sync: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Daily sync failed: {str(e)}")
