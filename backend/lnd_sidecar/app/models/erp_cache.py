"""Database models for caching ERP employee data."""
from sqlalchemy import Column, Integer, String, DateTime, JSON, Index
from sqlalchemy.sql import func
from app.db.base import Base

class ERPEmployeeCache(Base):
    """Cache table for ERP employees."""
    __tablename__ = "erp_employee_cache"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_data = Column(JSON, nullable=False)  # Store full employee data as JSON
    cached_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Index on cached_at for efficient cleanup queries
    __table_args__ = (
        Index('idx_erp_employee_cache_cached_at', 'cached_at'),
    )

