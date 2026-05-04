from pydantic_settings import BaseSettings
from typing import List, Union, Optional
from pydantic import field_validator
import os
import sys

class Settings(BaseSettings):
    # Database - REQUIRED in production
    DATABASE_URL: str
    
    # Azure AD (Optional - for Microsoft Forms integration)
    AZURE_CLIENT_ID: str = ""
    AZURE_CLIENT_SECRET: str = ""
    AZURE_TENANT_ID: str = ""
    
    # Microsoft Graph API (Optional)
    MICROSOFT_GRAPH_API_KEY: str = ""
    MICROSOFT_GRAPH_SCOPE: str = "https://graph.microsoft.com/.default"
    
    # Security - REQUIRED in production
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # CORS - can be a list or comma-separated string
    CORS_ORIGINS: Union[str, List[str]] = ["http://localhost:3000", "http://localhost:5173"]
    
    @field_validator('CORS_ORIGINS', mode='before')
    @classmethod
    def parse_cors_origins(cls, v):
        """Parse CORS origins from string or list."""
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v
    
    # Application
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    
    # File Upload
    MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024  # 10MB
    UPLOAD_DIR: str = "uploads"
    
    # Azure Blob Storage (Optional - files stored locally if not set)
    AZURE_STORAGE_CONNECTION_STRING: str = ""
    AZURE_STORAGE_CONTAINER: str = "enrollment-uploads"
    
    # Admin Authentication - REQUIRED in production
    ADMIN_EMAIL: str
    ADMIN_PASSWORD: str
    
    # Email Configuration (for reminders)
    SMTP_ENABLED: bool = False
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = ""
    SMTP_USE_TLS: bool = True
    REMINDER_MINUTES_BEFORE: int = 30  # Send reminder 30 minutes before class
    
    # LMS (Moodle) Configuration (Optional - for online course integration)
    LMS_BASE_URL: str = "https://lms.elearning23.com/webservice/rest/server.php"
    LMS_TOKEN: str = ""  # Moodle web service token
    LMS_REST_FORMAT: str = "json"
    
    # ERP (GraphQL) Configuration (Optional - for employee data)
    # Support both naming conventions: BS_ERP_* (existing) and ERP_* (new)
    BS_ERP_GRAPHQL_URL: str = ""  # GraphQL endpoint URL (alternative: ERP_GRAPHQL_URL)
    BS_ERP_API_KEY: str = ""  # API key for GraphQL authentication (alternative: ERP_API_KEY)
    ERP_GRAPHQL_URL: str = ""  # GraphQL endpoint URL
    ERP_API_KEY: str = ""  # API key for GraphQL authentication
    ERP_API_TOKEN: str = ""  # Bearer token for GraphQL authentication
    
    # Cron Job Configuration
    CRON_SECRET_KEY: str = "bs23-cron-2025"  # Secret key for authorizing cron job API calls
    
    class Config:
        env_file = ".env"
        case_sensitive = True
    
    @property
    def erp_graphql_url(self) -> str:
        """Get ERP GraphQL URL from either BS_ERP_GRAPHQL_URL or ERP_GRAPHQL_URL."""
        return self.BS_ERP_GRAPHQL_URL or self.ERP_GRAPHQL_URL
    
    @property
    def erp_api_key(self) -> str:
        """Get ERP API key from either BS_ERP_API_KEY or ERP_API_KEY."""
        return self.BS_ERP_API_KEY or self.ERP_API_KEY

# Initialize settings
try:
    settings = Settings()
except Exception as e:
    print(f"ERROR: Failed to load settings. Please ensure all required environment variables are set.")
    print(f"Required variables: DATABASE_URL, SECRET_KEY, ADMIN_EMAIL, ADMIN_PASSWORD")
    print(f"Error details: {e}")
    if os.getenv("ENVIRONMENT") == "production":
        sys.exit(1)
    else:
        # For development, provide helpful defaults
        print("\n⚠️  WARNING: Using development defaults. DO NOT use in production!")
        os.environ.setdefault("DATABASE_URL", "postgresql://user:password@localhost/enrollment_db")
        os.environ.setdefault("SECRET_KEY", "dev-secret-key-CHANGE-THIS")
        os.environ.setdefault("ADMIN_EMAIL", "admin@example.com")
        os.environ.setdefault("ADMIN_PASSWORD", "admin123")
        settings = Settings()

