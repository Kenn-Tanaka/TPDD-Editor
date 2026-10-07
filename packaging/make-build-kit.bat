@echo off
setlocal
cd /d "%~dp0"
title TPDD Build Kit Packager

echo ====================================================
echo   Thinking Process Development Diagram Editor (TPDD Editor)
echo   Package Build Kit into ZIP
echo ====================================================

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0make-build-kit.ps1"

echo.
pause
