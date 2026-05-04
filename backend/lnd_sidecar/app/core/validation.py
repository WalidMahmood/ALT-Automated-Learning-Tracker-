"""Input validation utilities to prevent injection attacks and validate user input."""
import re
from typing import Optional

def validate_string_input(value: str, max_length: int = 255, allow_empty: bool = False) -> str:
    """
    Validate and sanitize string input.
    
    Args:
        value: Input string to validate
        max_length: Maximum allowed length
        allow_empty: Whether empty strings are allowed
        
    Returns:
        Sanitized string
        
    Raises:
        ValueError if validation fails
    """
    if value is None:
        if allow_empty:
            return ""
        raise ValueError("Value cannot be None")
    
    # Convert to string if not already
    value = str(value).strip()
    
    # Check empty
    if not value and not allow_empty:
        raise ValueError("Value cannot be empty")
    
    # Check length
    if len(value) > max_length:
        raise ValueError(f"Value exceeds maximum length of {max_length} characters")
    
    # Remove null bytes and control characters
    value = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', value)
    
    return value

def validate_email(email: str) -> str:
    """
    Validate email format.
    
    Args:
        email: Email address to validate
        
    Returns:
        Validated email
        
    Raises:
        ValueError if email is invalid
    """
    email = validate_string_input(email, max_length=255)
    
    # Basic email validation
    email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if not re.match(email_pattern, email):
        raise ValueError("Invalid email format")
    
    return email.lower()

def validate_employee_id(employee_id: str) -> str:
    """
    Validate employee ID format.
    
    Args:
        employee_id: Employee ID to validate
        
    Returns:
        Validated employee ID
        
    Raises:
        ValueError if employee ID is invalid
    """
    employee_id = validate_string_input(employee_id, max_length=50)
    
    # Allow alphanumeric and common separators
    if not re.match(r'^[a-zA-Z0-9_-]+$', employee_id):
        raise ValueError("Employee ID contains invalid characters")
    
    return employee_id

def validate_department(department: Optional[str]) -> Optional[str]:
    """
    Validate department value. Since department is now a free text field from LMS API,
    we only validate that it's a valid string (not empty if provided).
    
    Args:
        department: Department value to validate
        
    Returns:
        Validated department or None
        
    Raises:
        ValueError if department is invalid
    """
    if department is None:
        return None
    
    department = validate_string_input(department, max_length=100)
    
    # Department is now a free text field, so we just validate it's not empty
    if not department.strip():
        raise ValueError("Department cannot be empty")
    
    return department.strip()

def sanitize_sql_like_pattern(pattern: str) -> str:
    """
    Sanitize string for use in SQL LIKE patterns to prevent injection.
    
    Args:
        pattern: Pattern string to sanitize
        
    Returns:
        Sanitized pattern
    """
    # Escape SQL LIKE special characters
    pattern = pattern.replace('\\', '\\\\')
    pattern = pattern.replace('%', '\\%')
    pattern = pattern.replace('_', '\\_')
    return pattern

