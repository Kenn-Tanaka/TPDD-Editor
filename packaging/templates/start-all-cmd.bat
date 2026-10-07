@echo off
setlocal
cd /d "%~dp0"
title TPDD Launcher

echo ====================================================
echo   Thinking Process Development Diagram Editor (TPDD Editor) Launcher
echo ====================================================

where node >nul 2>nul
if not errorlevel 1 goto node_ready
echo [ERROR] Node.js was not found in PATH.
echo Please install Node.js v18 or later.
pause
exit /b 1

:node_ready
echo [1/2] Starting LLM Gateway on port 8765...
start "LLM Gateway" /D "%~dp0gateway" start-gateway.bat

ping -n 3 127.0.0.1 >nul

echo [2/2] Starting Web Server on port 3000...
start "TPDD Web Server" /D "%~dp0app" start-app.bat

ping -n 3 127.0.0.1 >nul

echo Opening browser...
start "" "http://127.0.0.1:3000"

echo.
echo ====================================================
echo   Startup completed!
echo   - Web UI:  http://127.0.0.1:3000
echo   - Gateway: http://127.0.0.1:8765/v1
echo ====================================================
ping -n 4 127.0.0.1 >nul
