@echo off
setlocal
cd /d "%~dp0"
title LLM Gateway (Port 8765)

echo ====================================================
echo   Lightweight LLM Gateway
echo ====================================================
echo URL:    http://127.0.0.1:8765/v1
echo Config: config\gateway.json
echo.

if exist "llm-gateway.exe" goto exe_found
echo [ERROR] llm-gateway.exe not found!
pause
exit /b 1

:exe_found
llm-gateway.exe config\gateway.json
pause
