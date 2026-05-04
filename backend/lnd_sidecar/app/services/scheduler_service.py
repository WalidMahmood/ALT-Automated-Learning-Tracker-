import logging
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger
from app.core.config import settings
from app.services.reminder_service import ReminderService
from app.services.sync_orchestrator import sync_all_data

logger = logging.getLogger(__name__)

class SchedulerService:
    scheduler = None

    @classmethod
    def start(cls):
        """Initialize and start the scheduler."""
        cls.scheduler = BackgroundScheduler()
        
        # Schedule reminder check if email is enabled
        if settings.SMTP_ENABLED and settings.ADMIN_EMAIL:
            try:
                # Schedule reminder check to run every minute
                cls.scheduler.add_job(
                    ReminderService.check_and_send_reminders,
                    trigger=IntervalTrigger(minutes=1),
                    id='class_reminder_check',
                    name='Check and send class reminders',
                    replace_existing=True
                )
                logger.info("Scheduled class reminder check - will run every minute")
            except Exception as e:
                logger.error(f"Failed to schedule reminder check: {str(e)}")
        else:
            logger.info("Class reminder check not scheduled - email service not enabled or ADMIN_EMAIL not configured")
        
        # Schedule combined sync job to run daily at 12 AM Bangladesh time (18:00 UTC previous day)
        try:
            cls.scheduler.add_job(
                sync_all_data,
                trigger=CronTrigger(hour=18, minute=0),  # Run daily at 12 AM Bangladesh time (UTC+6 = 18:00 UTC previous day)
                id='sync_all_data',
                name='Sync all data from LMS and ERP daily at 12 AM Bangladesh time',
                replace_existing=True
            )
            logger.info("Scheduled combined LMS and ERP sync - will run daily at 12 AM Bangladesh time (18:00 UTC)")
        except Exception as e:
            logger.error(f"Failed to schedule data sync: {str(e)}")
        
        # Start scheduler if any jobs were added
        if cls.scheduler.get_jobs():
            cls.scheduler.start()
            logger.info("Scheduler started")
        else:
            logger.info("Scheduler not started - no jobs scheduled")

    @classmethod
    def shutdown(cls):
        """Shutdown the scheduler."""
        if cls.scheduler and cls.scheduler.running:
            cls.scheduler.shutdown()
            logger.info("Scheduler stopped")
