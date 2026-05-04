from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from datetime import datetime, timedelta, timezone
from app.core.config import settings

security = HTTPBearer()

def verify_admin_credentials(email: str, password: str) -> bool:
    """Verify admin credentials from environment variables.
    Uses constant-time comparison to prevent timing attacks."""
    from secrets import compare_digest
    
    admin_email = getattr(settings, 'ADMIN_EMAIL', '')
    admin_password = getattr(settings, 'ADMIN_PASSWORD', '')
    
    # Use constant-time comparison to prevent timing attacks
    email_match = compare_digest(email.encode('utf-8'), admin_email.encode('utf-8'))
    password_match = compare_digest(password.encode('utf-8'), admin_password.encode('utf-8'))
    
    return email_match and password_match

def create_access_token(email: str) -> str:
    """Create JWT access token for admin."""
    # Use ACCESS_TOKEN_EXPIRE_MINUTES from settings (default 30 minutes)
    # Use UTC-aware datetime for consistent timestamp calculation
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    # Convert datetime to Unix timestamp (JWT exp must be numeric)
    expire_timestamp = int(expire.timestamp())
    to_encode = {"sub": email, "exp": expire_timestamp, "role": "admin"}
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Verify JWT token and return payload."""
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email: str = payload.get("sub")
        role: str = payload.get("role")
        
        if email is None or role != "admin":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Verify email matches admin email
        admin_email = getattr(settings, 'ADMIN_EMAIL', '')
        if email != admin_email:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied"
            )
        
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Dependency to get current admin from token."""
    return verify_token(credentials)

