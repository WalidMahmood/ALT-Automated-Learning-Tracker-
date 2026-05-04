from sqlalchemy import Column, Integer, String, DateTime, Boolean, Date, Float, JSON
from sqlalchemy.orm import relationship
from app.db.base import Base
from datetime import datetime

class Student(Base):
    """
    Student/Employee model.
    
    Active status is determined by exit_date from ERP:
    - is_active = True: Employee is currently active (exit_date is NULL)
    - is_active = False: Employee has left the company (exit_date is NOT NULL)
    
    All Employees page shows is_active=True employees.
    Previous Employees page shows is_active=False employees.
    """
    __tablename__ = "students"
    
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    department = Column(String, nullable=False)  # Changed from sbu enum to department string
    designation = Column(String, nullable=True)
    experience_years = Column(Integer, default=0)
    career_start_date = Column(Date, nullable=True)  # For calculating total experience
    bs_joining_date = Column(Date, nullable=True)  # For calculating BS experience
    # is_active: True = active employee, False = previous employee (based on exit_date from ERP)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # ERP fields - matching ERP employee structure
    erp_id = Column(String, nullable=True, index=True)  # ERP employee id
    work_email = Column(String, nullable=True)  # workEmail from ERP
    active = Column(Boolean, default=True, nullable=True)  # active flag from ERP (different from is_active)
    is_onsite = Column(Boolean, default=False, nullable=True)  # isOnsite from ERP
    total_experience = Column(Float, nullable=True)  # totalExperience from ERP (in years)
    date_of_birth = Column(Date, nullable=True)  # dateOfBirth from ERP
    resignation_date = Column(Date, nullable=True)  # resignationDate from ERP
    exit_date = Column(Date, nullable=True, index=True)  # exitDate from ERP - determines if previous employee
    department_id = Column(String, nullable=True)  # department.id from ERP
    job_position_id = Column(String, nullable=True)  # jobPosition.id from ERP
    job_position_name = Column(String, nullable=True)  # jobPosition.name from ERP (same as designation)
    job_type_id = Column(String, nullable=True)  # jobType.id from ERP
    job_type_name = Column(String, nullable=True)  # jobType.name from ERP
    job_role_id = Column(String, nullable=True)  # jobRole.id from ERP
    sbu_name = Column(String, nullable=True)  # sbu.name from ERP
    user_id = Column(String, nullable=True)  # user.id from ERP
    user_name = Column(String, nullable=True)  # user.name from ERP
    user_email = Column(String, nullable=True)  # user.email from ERP
    erp_data = Column(JSON, nullable=True)  # Store full ERP employee data as JSON for reference
    
    # SBU Head and Reporting Manager from ERP
    sbu_head_employee_id = Column(String, nullable=True, index=True)  # sbuHead.employeeId from ERP
    sbu_head_name = Column(String, nullable=True)  # sbuHead.name from ERP
    reporting_manager_employee_id = Column(String, nullable=True, index=True)  # parent.employeeId from ERP
    reporting_manager_name = Column(String, nullable=True)  # parent.name from ERP
    exit_reason = Column(String, nullable=True)  # exitReason from ERP (why employee left)
    
    # Additional computed fields
    has_online_course = Column(Boolean, default=False, nullable=False, index=True)  # Set by matching with LMS data
    bs_experience = Column(Float, nullable=True)  # Calculated from joiningDate (bs_joining_date)
    is_mentor = Column(Boolean, default=False, nullable=False, index=True)  # Whether student is tagged as a mentor
    
    # Relationships
    enrollments = relationship("Enrollment", back_populates="student", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Student(id={self.id}, employee_id={self.employee_id}, name={self.name})>"

