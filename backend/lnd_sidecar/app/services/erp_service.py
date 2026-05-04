"""Service for interacting with ERP GraphQL API."""
import httpx
from typing import List, Dict, Optional, Any
from app.core.config import settings
import logging
from datetime import datetime, date
from sqlalchemy.orm import Session
from app.models.student import Student
from app.core.validation import validate_department

logger = logging.getLogger(__name__)

class ERPService:
    """Service for fetching employee data from ERP GraphQL API."""
    
    @staticmethod
    def _parse_date(date_str: Optional[str]) -> Optional[date]:
        """Parse date string YYYY-MM-DD to date object."""
        if not date_str:
            return None
        try:
            return datetime.strptime(date_str, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            return None
    
    @staticmethod
    async def fetch_all_employees(include_archived: bool = True) -> List[Dict[str, Any]]:
        """
        Fetch all employees from ERP GraphQL API.
        
        Uses pagination to fetch all employees, handling large datasets.
        
        Args:
            include_archived: Whether to include archived employees (default: True)
        
        Returns:
            List of employee dictionaries from ERP API
        """
        erp_url = settings.erp_graphql_url
        if not erp_url:
            raise ValueError("ERP_GRAPHQL_URL or BS_ERP_GRAPHQL_URL is not configured. Please set it in .env file")
        
        erp_key = settings.erp_api_key
        if not erp_key and not settings.ERP_API_TOKEN:
            raise ValueError("ERP_API_KEY, BS_ERP_API_KEY, or ERP_API_TOKEN is required. Please set it in .env file")
        
        # GraphQL query to fetch all employees with pagination support
        # Includes sbuHead, parent (reporting manager), and exitReason
        query = """
        query GetAllEmployees($limit: Int, $offset: Int, $includeArchived: Boolean) {
            allEmployees(limit: $limit, offset: $offset, includeArchived: $includeArchived) {
                id
                name
                employeeId
                workEmail
                active
                isOnsite
                joiningDate
                careerStartDate
                totalExperience
                dateOfBirth
                resignationDate
                exitDate
                department {
                    id
                    name
                }
                jobPosition {
                    id
                    name
                }
                jobType {
                    id
                    name
                }
                jobRole {
                    id
                }
                sbu {
                    name
                }
                sbuHead {
                    id
                    name
                    employeeId
                    workEmail
                }
                parent {
                    id
                    name
                    employeeId
                    workEmail
                }
                user {
                    id
                    name
                    email
                }
            }
        }
        """
        
        headers = {
            "Content-Type": "application/json",
        }
        
        # Add authentication header
        erp_key = settings.erp_api_key
        if settings.ERP_API_TOKEN:
            headers["Authorization"] = f"Bearer {settings.ERP_API_TOKEN}"
        elif erp_key:
            headers["api-key"] = erp_key  # Use lowercase with hyphen as shown in curl example
        
        # Ensure URL ends with /graphql
        graphql_url = erp_url
        if not graphql_url.endswith('/graphql'):
            graphql_url = graphql_url.rstrip('/') + '/graphql'
        
        all_employees = []
        page_size = 1000  # Fetch in batches of 1000
        offset = 0
        
        try:
            async with httpx.AsyncClient(timeout=300.0) as client:  # Increased timeout for large fetches
                while True:
                    # Prepare payload with pagination variables
                    payload = {
                        "query": query,
                        "variables": {
                            "limit": page_size,
                            "offset": offset,
                            "includeArchived": include_archived
                        }
                    }
                    
                    response = await client.post(
                        graphql_url,
                        json=payload,
                        headers=headers
                    )
                    response.raise_for_status()
                    
                    data = response.json()
                    
                    # Handle GraphQL errors
                    if "errors" in data:
                        error_msg = "; ".join([err.get("message", "Unknown error") for err in data["errors"]])
                        raise Exception(f"ERP GraphQL API error: {error_msg}")
                    
                    # Extract employees from response
                    employees = data.get("data", {}).get("allEmployees", [])
                    
                    if not employees:
                        # No more employees to fetch
                        break
                    
                    all_employees.extend(employees)
                    logger.info(f"Fetched {len(employees)} employees (total so far: {len(all_employees)})")
                    
                    # If we got fewer than page_size, we've reached the end
                    if len(employees) < page_size:
                        break
                    
                    offset += page_size
                
                logger.info(f"Total fetched {len(all_employees)} employees from ERP API")
                return all_employees
                
        except httpx.HTTPError as e:
            logger.error(f"HTTP error fetching employees from ERP: {str(e)}")
            raise Exception(f"Failed to fetch employees from ERP API: {str(e)}")
        except Exception as e:
            logger.error(f"Error fetching employees from ERP: {str(e)}")
            raise
    
    @staticmethod
    def map_erp_employee_to_student(employee: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Map ERP API employee data to our student/employee format.
        
        Mapping:
        - employee_id = employeeId (e.g., "BS1981")
        - name = name
        - email = workEmail
        - department = department.name
        - is_active = active
        - career_start_date = careerStartDate
        - bs_joining_date = joiningDate
        - designation = jobPosition.name
        
        Args:
            employee: Employee dictionary from ERP API
            
        Returns:
            Dictionary with mapped student data or None if required fields are missing
        """
        employee_id = employee.get("employeeId")
        name = employee.get("name")
        email = employee.get("workEmail")
        
        if not employee_id or not name or not email:
            logger.warning(f"Skipping employee with missing required fields: {employee.get('id')}")
            return None
        
        # Extract department name
        department_obj = employee.get("department", {})
        department = department_obj.get("name", "") if department_obj else ""
        if not department:
            department = "Other"  # Default if not specified
        
        # Extract job position/designation
        job_position_obj = employee.get("jobPosition", {})
        designation = job_position_obj.get("name", "") if job_position_obj else ""
        
        # Get active status
        is_active = employee.get("active", True)
        
        # Parse dates
        career_start_date = ERPService._parse_date(employee.get("careerStartDate"))
        bs_joining_date = ERPService._parse_date(employee.get("joiningDate"))
        
        # Extract SBU Head info
        sbu_head_obj = employee.get("sbuHead", {})
        sbu_head_employee_id = sbu_head_obj.get("employeeId") if sbu_head_obj else None
        sbu_head_name = sbu_head_obj.get("name") if sbu_head_obj else None
        
        # Extract Reporting Manager (parent) info
        parent_obj = employee.get("parent", {})
        reporting_manager_employee_id = parent_obj.get("employeeId") if parent_obj else None
        reporting_manager_name = parent_obj.get("name") if parent_obj else None
        
        return {
            "employee_id": employee_id,  # Use employeeId from ERP as employee_id
            "name": name,
            "email": email,
            "department": department,
            "is_active": is_active,
            "designation": designation,
            "career_start_date": career_start_date,
            "bs_joining_date": bs_joining_date,
            "total_experience": employee.get("totalExperience"),
            "is_onsite": employee.get("isOnsite", False),
            "date_of_birth": ERPService._parse_date(employee.get("dateOfBirth")),
            "resignation_date": ERPService._parse_date(employee.get("resignationDate")),
            "exit_date": ERPService._parse_date(employee.get("exitDate")),
            # Store additional ERP data for reference
            "erp_id": employee.get("id"),
            "job_type": employee.get("jobType", {}).get("name") if employee.get("jobType") else None,
            "sbu": employee.get("sbu", {}).get("name") if employee.get("sbu") else None,
            # SBU Head and Reporting Manager from ERP
            "sbu_head_employee_id": sbu_head_employee_id,
            "sbu_head_name": sbu_head_name,
            "reporting_manager_employee_id": reporting_manager_employee_id,
            "reporting_manager_name": reporting_manager_name,
        }
    
    @staticmethod
    def sync_employees_to_db(db: Session, employees: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Sync employees from ERP to local database.
        
        Args:
            db: Database session
            employees: List of employee dictionaries from ERP
            
        Returns:
            Statistics about the sync operation
        """
        stats = {"created": 0, "updated": 0, "skipped": 0, "errors": []}
        
        for employee in employees:
            try:
                # Handle nested list structure if present
                if isinstance(employee, list) and len(employee) > 0:
                    employee = employee[0]
                
                if not isinstance(employee, dict):
                    continue
                
                # Map ERP employee to student format
                student_data = ERPService.map_erp_employee_to_student(employee)
                
                if not student_data:
                    stats["skipped"] += 1
                    continue
                
                employee_id = student_data["employee_id"]
                email = student_data["email"]
                
                # Validate department
                try:
                    department = validate_department(student_data.get("department", "Other"))
                    student_data["department"] = department
                except ValueError:
                    student_data["department"] = "Other"
                
                # Calculate BS experience
                bs_experience = None
                if student_data.get("bs_joining_date"):
                    try:
                        today = date.today()
                        delta = today - student_data["bs_joining_date"]
                        bs_experience = round(delta.days / 365.25, 2)
                    except Exception:
                        pass
                student_data["bs_experience"] = bs_experience
                
                # Determine is_active based on exit_date
                if student_data.get("exit_date"):
                    student_data["is_active"] = False
                
                # Check if student exists
                existing_student = db.query(Student).filter(
                    (Student.employee_id == employee_id) | (Student.email == email)
                ).first()
                
                if existing_student:
                    # Update existing
                    for key, value in student_data.items():
                        if hasattr(existing_student, key):
                            setattr(existing_student, key, value)
                    
                    # Store full ERP data
                    existing_student.erp_data = employee
                    stats["updated"] += 1
                else:
                    # Create new
                    student_data["erp_data"] = employee
                    new_student = Student(**student_data)
                    db.add(new_student)
                    stats["created"] += 1
                    
            except Exception as e:
                emp_id = employee.get('employeeId', 'unknown') if isinstance(employee, dict) else 'unknown'
                error_msg = f"Error processing employee {emp_id}: {str(e)}"
                stats["errors"].append(error_msg)
                logger.error(error_msg)
        
        try:
            db.commit()
        except Exception as e:
            db.rollback()
            error_msg = f"Error committing employee sync: {str(e)}"
            logger.error(error_msg)
            stats["errors"].append(error_msg)
            # Don't raise, just return stats with error
            return stats
            
        return stats
    
    @staticmethod
    async def test_connection() -> Dict[str, Any]:
        """
        Test the ERP API connection.
        
        Returns:
            Dictionary with connection status and details
        """
        try:
            erp_url = settings.erp_graphql_url
            if not erp_url:
                return {
                    "connected": False,
                    "error": "ERP_GRAPHQL_URL or BS_ERP_GRAPHQL_URL is not configured"
                }
            
            erp_key = settings.erp_api_key
            if not erp_key and not settings.ERP_API_TOKEN:
                return {
                    "connected": False,
                    "error": "ERP_API_KEY, BS_ERP_API_KEY, or ERP_API_TOKEN is not configured"
                }
            
            # Try to fetch a small number of employees to test connection
            employees = await ERPService.fetch_all_employees()
            
            return {
                "connected": True,
                "url": erp_url,
                "employees_count": len(employees),
                "message": "Successfully connected to ERP API"
            }
        except Exception as e:
            return {
                "connected": False,
                "error": str(e),
                "url": settings.erp_graphql_url if settings.erp_graphql_url else "Not configured"
            }

