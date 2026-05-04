from fastapi import APIRouter, Depends
from app.api import auth, enrollments, courses, students, imports, completions, mentors, lms, cron
from app.core.auth import get_current_admin

api_router = APIRouter()

# Public routes
api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])

# Cron job routes (protected by secret key, no JWT auth)
api_router.include_router(cron.router, prefix="/cron", tags=["cron"])

# Protected routes (require admin authentication)
api_router.include_router(enrollments.router, prefix="/enrollments", tags=["enrollments"], dependencies=[Depends(get_current_admin)])
api_router.include_router(courses.router, prefix="/courses", tags=["courses"], dependencies=[Depends(get_current_admin)])
api_router.include_router(students.router, prefix="/students", tags=["students"], dependencies=[Depends(get_current_admin)])
api_router.include_router(imports.router, prefix="/imports", tags=["imports"], dependencies=[Depends(get_current_admin)])
api_router.include_router(completions.router, prefix="/completions", tags=["completions"], dependencies=[Depends(get_current_admin)])
api_router.include_router(mentors.router, prefix="/mentors", tags=["mentors"], dependencies=[Depends(get_current_admin)])
api_router.include_router(lms.router, prefix="/lms", tags=["lms"], dependencies=[Depends(get_current_admin)])

