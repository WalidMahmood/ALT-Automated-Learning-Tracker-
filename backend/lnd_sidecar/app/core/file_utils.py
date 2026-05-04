"""File upload security utilities."""
import os
import re
from pathlib import Path
from fastapi import HTTPException, UploadFile
from app.core.config import settings

ALLOWED_EXTENSIONS = {'.xlsx', '.xls', '.csv'}
MAX_FILENAME_LENGTH = 255

def sanitize_filename(filename: str) -> str:
    """
    Sanitize filename to prevent path traversal attacks.
    
    Args:
        filename: Original filename
        
    Returns:
        Sanitized filename
    """
    if not filename:
        raise HTTPException(status_code=400, detail="Filename is required")
    
    # Remove path components to prevent directory traversal (handles both / and \)
    filename = os.path.basename(filename)
    
    # Replace backslashes with underscores (Windows path separators)
    filename = filename.replace('\\', '_')
    
    # Remove any remaining dangerous characters (keeps alphanumeric, dots, underscores, hyphens, spaces)
    filename = re.sub(r'[<>:"|?*\x00-\x1f]', '', filename)
    
    # Limit filename length (preserve extension)
    if len(filename) > 100:
        name, ext = os.path.splitext(filename)
        # Reserve space for extension, limit name to 90 chars
        max_name_length = 100 - len(ext)
        if max_name_length < 1:
            max_name_length = 1
        filename = name[:max_name_length] + ext
    
    # Ensure filename is not empty after sanitization
    if not filename or filename.strip() == '':
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    return filename

def validate_file_extension(filename: str) -> None:
    """
    Validate file extension against allowed list.
    
    Args:
        filename: Filename to validate
        
    Raises:
        HTTPException if extension is not allowed
    """
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"
        )

def validate_file_size(file_size: int) -> None:
    """
    Validate file size against maximum allowed size.
    
    Args:
        file_size: File size in bytes
        
    Raises:
        HTTPException if file is too large
    """
    if file_size > settings.MAX_UPLOAD_SIZE:
        max_size_mb = settings.MAX_UPLOAD_SIZE / (1024 * 1024)
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size: {max_size_mb}MB"
        )

def get_safe_file_path(filename: str, upload_dir: str = None) -> str:
    """
    Get a safe file path for uploaded file.
    
    Args:
        filename: Original filename
        upload_dir: Upload directory (defaults to settings.UPLOAD_DIR)
        
    Returns:
        Safe file path
    """
    # Sanitize filename
    safe_filename = sanitize_filename(filename)
    
    # Use configured upload directory
    if upload_dir is None:
        upload_dir = settings.UPLOAD_DIR
    
    # Ensure upload directory exists
    os.makedirs(upload_dir, exist_ok=True)
    
    # Create absolute path to prevent directory traversal
    upload_path = os.path.abspath(upload_dir)
    file_path = os.path.join(upload_path, safe_filename)
    
    # Ensure file path is within upload directory (prevent path traversal)
    if not os.path.abspath(file_path).startswith(os.path.abspath(upload_path)):
        raise HTTPException(status_code=400, detail="Invalid file path")
    
    return file_path

