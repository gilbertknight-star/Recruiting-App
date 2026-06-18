@echo off
start "Recruiting Bot - Backend" cmd /k "cd /d "%~dp0backend" && venv\Scripts\activate && uvicorn main:app --reload"
start "Recruiting Bot - Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"
timeout /t 3 /nobreak >nul
start "" http://localhost:5173
