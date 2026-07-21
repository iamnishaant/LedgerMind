@echo off
REM ============================================================
REM  AI FinanceOS - start backend + frontend together (Windows)
REM  Double-click this file, or run  start-dev.bat  from a terminal.
REM  Opens each server in its own window so you can read the logs
REM  and stop them independently (Ctrl+C, or just close the window).
REM ============================================================
setlocal

REM Folder this script lives in (has a trailing backslash), so it
REM works no matter what directory you launch it from.
set "ROOT=%~dp0"

echo.
echo   AI FinanceOS - starting dev servers
echo   ------------------------------------
echo   Backend   http://localhost:8000   (API docs at /docs)
echo   Frontend  http://localhost:3000
echo.

REM --- prerequisite checks -----------------------------------
if not exist "%ROOT%backend\venv\Scripts\python.exe" (
  echo [ERROR] Python venv not found at backend\venv
  echo         Create it once with:
  echo             cd backend
  echo             python -m venv venv
  echo             venv\Scripts\pip install -r requirements.txt
  echo.
  pause
  exit /b 1
)

if not exist "%ROOT%frontend\node_modules" (
  echo [ERROR] frontend\node_modules not found - install deps once with:
  echo             cd frontend
  echo             npm install
  echo.
  pause
  exit /b 1
)

REM Sanity-check the venv interpreter can load its compiled packages. This
REM catches the "venv was rebuilt with a different Python" mismatch, which
REM otherwise fails at startup with a cryptic
REM   ModuleNotFoundError: No module named 'pydantic_core._pydantic_core'
REM This machine has multiple Pythons installed and a newer one is the
REM default, so a stray "python -m venv venv" silently swaps the venv's
REM interpreter while leaving 3.11-built packages behind.
"%ROOT%backend\venv\Scripts\python.exe" -c "import pydantic_core" 1>nul 2>nul
if errorlevel 1 (
  echo [ERROR] The backend venv is broken - its interpreter and its installed
  echo         packages are built for different Python versions. This project
  echo         needs Python 3.11.
  echo.
  echo         Fast fix ^(re-points the venv at 3.11, keeps installed packages^):
  echo             cd backend
  echo             py -3.11 -m venv venv
  echo.
  echo         If imports still fail after that, reinstall deps:
  echo             backend\venv\Scripts\pip install -r backend\requirements.txt
  echo.
  pause
  exit /b 1
)

REM --- launch each server in its own window ------------------
REM  /D sets the working directory (handles spaces in the path).
REM  cmd /k keeps the window open if a server exits, so you can
REM  read any error instead of it vanishing.
start "AI FinanceOS - Backend"  /D "%ROOT%backend"  cmd /k "venv\Scripts\python -m uvicorn main:app --reload"
start "AI FinanceOS - Frontend" /D "%ROOT%frontend" cmd /k "npm run dev"

echo   Two windows are opening (Backend + Frontend).
echo   Give them a few seconds, then open  http://localhost:3000
echo.
echo   To stop: press Ctrl+C in each window, or just close them.
echo.
endlocal
