@echo off
setlocal
cd /d "%~dp0"
title TPDD Build Kit

echo ====================================================
echo   Thinking Process Development Diagram Editor (TPDD)
echo   Build Kit
echo ====================================================

where powershell >nul 2>nul
if not errorlevel 1 goto ps_ok
echo [ERROR] PowerShell is required to run the build kit.
pause
exit /b 1

:ps_ok
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-release.ps1"

echo.
pause
