$ErrorActionPreference = "Stop"
Start-Process -NoNewWindow -FilePath ".\.venv\Scripts\python.exe" -ArgumentList "-m", "uvicorn", "backend.api.main:app", "--port", "8000"
Set-Location "frontend"
npm run dev
