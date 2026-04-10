@echo off
echo Starting backend server...
cd /d "%~dp0backend"
python -m uvicorn main:app --reload --port 8000
