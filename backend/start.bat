@echo off
REM ========================================
REM  ALT System - Start Backend + AI Worker
REM ========================================

cd /d "%~dp0"

echo.
echo ========================================
echo  Starting ALT System Backend
echo ========================================
echo.

REM Activate virtual environment
call venv\Scripts\activate.bat

REM Start Django + Celery together
python manage.py runserver_with_celery

pause
