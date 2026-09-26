@echo off
REM Start the FutureAcad site locally on http://127.0.0.1:5000
REM Double-click this file, or run "start.bat" from a terminal. Ctrl+C stops it.

cd /d "%~dp0"

REM create_app() refuses to boot on the dev-default SECRET_KEY/ADMIN_PASSWORD
REM unless debug is on, so this is what makes a clean checkout run without a .env.
set "FLASK_DEBUG=1"

REM Prefer a virtualenv if one exists; fall back to whatever python is on PATH.
set "PY=python"
if exist "venv\Scripts\python.exe" set "PY=venv\Scripts\python.exe"
if exist ".venv\Scripts\python.exe" set "PY=.venv\Scripts\python.exe"

echo Starting FutureAcad on http://127.0.0.1:5000  (Ctrl+C to stop)
echo.
"%PY%" run.py

REM Only reached if the server exits or fails to start — keep the window open
REM so the traceback is readable when this was launched by double-click.
echo.
echo Server stopped (exit code %ERRORLEVEL%).
pause
