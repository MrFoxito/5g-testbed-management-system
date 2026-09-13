Set-Location -Path $PSScriptRoot
Write-Host "Starting MAEstro FastAPI Backend on http://127.0.0.1:8000 ..." -ForegroundColor Cyan
& "$PSScriptRoot\.venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
