# Bootstraps the local FastAPI development server
$env:PYTHONPATH = "."
.\.venv\Scripts\uvicorn.exe backend.main:app --reload --host 127.0.0.1 --port 8000
