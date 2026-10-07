@echo off
setlocal
cd /d "%~dp0"
title TPDD Shortcut Installer

echo ====================================================
echo   Thinking Process Development Diagram Editor (TPDD Editor)
echo   Create Desktop Shortcut
echo ====================================================

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$desktop = [Environment]::GetFolderPath('Desktop'); " ^
  "$shortcutPath = Join-Path $desktop '思考展開図エディタ (TPDD Editor).lnk'; " ^
  "$targetPath = Join-Path (Get-Location) 'TPDD-Launcher.exe'; " ^
  "$shortcut = $ws.CreateShortcut($shortcutPath); " ^
  "$shortcut.TargetPath = $targetPath; " ^
  "$shortcut.WorkingDirectory = (Get-Location); " ^
  "$shortcut.Description = '思考展開図エディタ (TPDD Editor) 起動'; " ^
  "$shortcut.Save(); " ^
  "Write-Host '[SUCCESS] Desktop shortcut created: ' $shortcutPath -ForegroundColor Green;"

echo.
pause
