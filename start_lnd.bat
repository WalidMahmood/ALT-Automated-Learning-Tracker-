@echo off
REM ============================================
REM Start LND Sidecar (FastAPI on port 8001)
REM ============================================
echo Starting LND Sidecar (FastAPI) on port 8001...

cd /d "%~dp0backend\lnd_sidecar"

if not exist "venv\Scripts\activate.bat" (
    echo Creating virtual environment...
    python -m venv venv
    call venv\Scripts\activate.bat
    pip install -r requirements.txt
) else (
    call venv\Scripts\activate.bat
)

uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
