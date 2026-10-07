$ErrorActionPreference = "Stop"

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "  Thinking Process Development Diagram Editor (TPDD Editor) Launcher" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# 1. Node.js Check
$node = Get-Command "node" -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host "[ERROR] Node.js is not found in PATH." -ForegroundColor Red
    Write-Host "Please install Node.js (v18 or later) to run this application." -ForegroundColor Yellow
    Read-Host "Press Enter to exit..."
    exit 1
}

$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$gatewayDir = Join-Path $rootDir "gateway"
$appDir = Join-Path $rootDir "app"

# 2. Start LLM Gateway (Port 8765)
Write-Host "[1/2] Starting LLM Gateway on port 8765..." -ForegroundColor Green
Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/k", "start-gateway.bat" `
    -WorkingDirectory $gatewayDir

Start-Sleep -Seconds 2

# 3. Start Web Server (Port 3000)
Write-Host "[2/2] Starting Web Server on port 3000..." -ForegroundColor Green
Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/k", "start-app.bat" `
    -WorkingDirectory $appDir

Start-Sleep -Seconds 2

# 4. Open Default Browser
Write-Host "Opening browser..." -ForegroundColor Green
Start-Process "http://127.0.0.1:3000"

Write-Host ""
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "  Startup completed successfully!" -ForegroundColor Cyan
Write-Host "  - Web UI:  http://127.0.0.1:3000" -ForegroundColor White
Write-Host "  - Gateway: http://127.0.0.1:8765/v1" -ForegroundColor White
Write-Host "====================================================" -ForegroundColor Cyan

Start-Sleep -Seconds 2
