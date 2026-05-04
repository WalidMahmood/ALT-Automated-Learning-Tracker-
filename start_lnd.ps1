# ============================================
# Start LND Sidecar (FastAPI on port 8001)
# ============================================
# Run this BEFORE starting the ALTS Django server.
# The ALTS Django proxy forwards /api/lnd/* to this service.
# ============================================

Write-Host "🚀 Starting LND Sidecar (FastAPI) on port 8001..." -ForegroundColor Cyan

$sidecarDir = Join-Path $PSScriptRoot "backend\lnd_sidecar"

# Check if venv exists
$venvPath = Join-Path $sidecarDir "venv\Scripts\Activate.ps1"
if (-not (Test-Path $venvPath)) {
    Write-Host "⚠️  Virtual environment not found. Creating one..." -ForegroundColor Yellow
    Push-Location $sidecarDir
    python -m venv venv
    & $venvPath
    pip install -r requirements.txt
    Pop-Location
} else {
    & $venvPath
}

Push-Location $sidecarDir
uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
Pop-Location
