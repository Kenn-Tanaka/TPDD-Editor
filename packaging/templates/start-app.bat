@echo off
setlocal
cd /d "%~dp0"
title TPDD Editor (Port 3000)

echo ====================================================
echo   Thinking Process Development Diagram Editor (TPDD Editor)
echo ====================================================

where node >nul 2>nul
if not errorlevel 1 goto node_ready
echo [ERROR] Node.js is not found in PATH.
echo Please install Node.js v18 or later.
pause
exit /b 1

:node_ready
start "" "http://127.0.0.1:3000"
node serve.mjs
pause
