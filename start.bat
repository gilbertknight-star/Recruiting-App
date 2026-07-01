@echo off

:: Kill any previous backend window by title (cascades to all child processes)
taskkill /FI "WINDOWTITLE eq Ducks In a Row - Backend" /F >nul 2>&1
timeout /t 1 /nobreak >nul

start "Ducks In a Row - Backend" cmd /k "cd /d "%~dp0backend" && venv\Scripts\activate && uvicorn main:app --reload --port 8001"
start "Ducks In a Row - Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"
timeout /t 3 /nobreak >nul
start "" http://localhost:5173
