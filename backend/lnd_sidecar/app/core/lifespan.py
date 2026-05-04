from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.services.scheduler_service import SchedulerService

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan - startup and shutdown."""
    # Startup
    SchedulerService.start()
    
    yield
    
    # Shutdown
    SchedulerService.shutdown()
