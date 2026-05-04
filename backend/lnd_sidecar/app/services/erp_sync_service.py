"""Service for caching ERP employee data to reduce API calls."""
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional, Any
import logging
from app.models.erp_cache import ERPEmployeeCache
from app.services.erp_service import ERPService

logger = logging.getLogger(__name__)

class ERPSyncService:
    """Service for managing ERP employee data synchronization."""
    
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
        expiry_time = synced_at + timedelta(hours=ERPSyncService.SYNC_EXPIRY_HOURS)
        return now < expiry_time
    
    @staticmethod
    async def get_cached_employees(db: Session) -> Optional[List[Dict[str, Any]]]:
        """Get cached employees if available and valid."""
        try:
            cached_employee_entry = db.query(ERPEmployeeCache).first()
            
            if not cached_employee_entry:
                return None
            
            # Check if cache is valid
            if not ERPSyncService.is_sync_valid(cached_employee_entry.cached_at):
                logger.info("ERP employee cache expired, will refresh")
                return None
            
            # Return employee data
            employees = cached_employee_entry.employee_data
            logger.info(f"Retrieved {len(employees)} employees from ERP cache")
            return employees
            
        except Exception as e:
            logger.error(f"Error retrieving cached ERP employees: {str(e)}")
            return None
    
    @staticmethod
    async def cache_employees(db: Session, employees: List[Dict[str, Any]]):
        """Cache all employees."""
        try:
            # Clear existing cache
            db.query(ERPEmployeeCache).delete()
            
            # Cache employees (store all in one entry as JSON)
            employee_cache = ERPEmployeeCache(
                employee_data=employees,
                cached_at=datetime.now(timezone.utc)
            )
            db.add(employee_cache)
            db.commit()
            logger.info(f"Cached {len(employees)} employees from ERP")
            
        except Exception as e:
            db.rollback()
            logger.error(f"Error caching ERP employees: {str(e)}")
            raise
    
    @staticmethod
    async def refresh_cache(db: Session):
        """Refresh ERP cache by fetching from API.
        
        This refreshes all employees from the ERP GraphQL API.
        """
        logger.info("Starting ERP cache refresh...")
        
        try:
            # Fetch all employees from ERP API
            logger.info("Fetching all employees from ERP API...")
            employees = await ERPService.fetch_all_employees()
            await ERPSyncService.cache_employees(db, employees)
            logger.info(f"Cached {len(employees)} employees from ERP")
            
            logger.info("ERP cache refresh completed successfully")
            
        except Exception as e:
            logger.error(f"Error refreshing ERP cache: {str(e)}")
            raise
    
    @staticmethod
    def cleanup_old_cache(db: Session, days_old: int = 7):
        """Clean up cache entries older than specified days."""
        try:
            cutoff_date = datetime.now(timezone.utc) - timedelta(days=days_old)
            
            # Delete old employee cache
            deleted_employees = db.query(ERPEmployeeCache).filter(
                ERPEmployeeCache.cached_at < cutoff_date
            ).delete()
            
            db.commit()
            logger.info(f"Cleaned up old ERP cache: {deleted_employees} employee entries")
            
        except Exception as e:
            db.rollback()
            logger.error(f"Error cleaning up old ERP cache: {str(e)}")

