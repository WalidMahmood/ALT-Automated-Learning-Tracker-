from fastapi import APIRouter, HTTPException, status, Depends, Request
from pydantic import BaseModel, EmailStr
from app.core.auth import create_access_token, get_current_admin
import os

router = APIRouter()

# Request/Response Schemas
class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    email: str


@router.post("/login", response_model=LoginResponse)
async def login(request: Request, credentials: LoginRequest):
    """
    Admin login using only environment variables.
    No database lookup. No hashing.
    """

    env_email = os.getenv("ADMIN_EMAIL")
    env_password = os.getenv("ADMIN_PASSWORD")

    # Safety check: credentials must exist
    if not env_email or not env_password:
        raise HTTPException(
            status_code=500,
            detail="Admin credentials not configured on server."
        )

    # Validate credentials
    if credentials.email != env_email or credentials.password != env_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    # Create JWT
    access_token = create_access_token(credentials.email)

    return LoginResponse(
        access_token=access_token,
        email=credentials.email
    )


@router.get("/me")
def get_current_user(current_admin: dict = Depends(get_current_admin)):
    """
    Return the currently authenticated admin user.
    """
    return {
        "email": current_admin.get("sub"),
        "role": "admin"
    }

