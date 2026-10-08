<#
.SYNOPSIS
    Thinking Process Development Diagram Editor (TPDD Editor) Complete Build Kit
.DESCRIPTION
    Builds the web frontend and LLM Gateway, packaging everything into a release zip.
    Temporarily provisions portable MinGW-w64 if not installed.
#>

[CmdletBinding()]
param(
    [string]$Version,
    [switch]$ForceTempMingw
)

$ErrorActionPreference = "Stop"
$Version = & (Join-Path $PSScriptRoot 'get-project-version.ps1') -ExpectedVersion $Version

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "  Thinking Process Development Diagram Editor (TPDD Editor) Build Kit" -ForegroundColor Cyan
Write-Host "  Version: $Version" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$releaseDir = Join-Path $projectRoot "release"
$gatewaySrcDir = Join-Path $projectRoot "tools\llm-gateway"
$launcherSource = Join-Path $projectRoot "tools\launcher\src\main.cpp"
$launcherExe = Join-Path $env:TEMP ("TPDD-Launcher-" + [System.Guid]::NewGuid().ToString("N") + ".exe")
$defaults = Get-Content -Raw (Join-Path $projectRoot "config\defaults.json") | ConvertFrom-Json
$stagingDir = Join-Path $env:TEMP ("tpdd-staging-" + [System.Guid]::NewGuid().ToString().Substring(0, 8))
$tempMingwDir = Join-Path $env:TEMP "tpdd-mingw-temp"
$isTempMingw = $false

# 1. Node.js Check
Write-Host "`n[1/6] Checking Node.js environment..." -ForegroundColor Yellow
$nodeCmd = Get-Command "node" -ErrorAction SilentlyContinue
$npmCmd = Get-Command "npm" -ErrorAction SilentlyContinue

if (-not $nodeCmd -or -not $npmCmd) {
    Write-Host "[ERROR] Node.js or npm is not found." -ForegroundColor Red
    Write-Host "Please install Node.js (v18 or later) from https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

$nodeVer = (node -v).Trim()
Write-Host "  Node.js: $nodeVer (OK)" -ForegroundColor Green

# Ensure node_modules dependencies
Push-Location $projectRoot
if (-not (Test-Path "node_modules")) {
    Write-Host "  node_modules not found. Installing dependencies via npm install..." -ForegroundColor Cyan
    cmd /c "npm install"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] npm install failed." -ForegroundColor Red
        Pop-Location
        exit 1
    }
}
Pop-Location

# 2. C++ Compiler (MinGW-w64) Check
Write-Host "`n[2/6] Checking C++ compiler (MinGW-w64)..." -ForegroundColor Yellow
$gxxCmd = Get-Command "g++" -ErrorAction SilentlyContinue
if (-not $gxxCmd) {
    $gxxCmd = Get-Command "c++" -ErrorAction SilentlyContinue
}

$needMinGw = $ForceTempMingw -or (-not $gxxCmd)

if ($needMinGw) {
    Write-Host "  MinGW not detected in PATH. Checking local toolchains..." -ForegroundColor Cyan
    
    if (Test-Path "C:\Strawberry\c\bin\c++.exe") {
        Write-Host "  Found local toolchain at C:\Strawberry\c\bin." -ForegroundColor Green
        $env:PATH = "C:\Strawberry\c\bin;" + $env:PATH
        $gxxCmd = Get-Command "c++" -ErrorAction SilentlyContinue
    } else {
        if (-not (Test-Path $tempMingwDir)) {
            New-Item -ItemType Directory -Path $tempMingwDir -Force | Out-Null
        }
        $zipPath = Join-Path $tempMingwDir "mingw.zip"
        $mingwUrl = "https://github.com/brechtsanders/winlibs_mingw/releases/download/13.2.0mcf-11.0.1-msvcrt-r1/winlibs-x86_64-mcf-seh-gcc-13.2.0-mingw-w64msvcrt-11.0.1-r1.zip"
        
        Write-Host "  Downloading portable MinGW-w64 toolchain..." -ForegroundColor Cyan
        Invoke-WebRequest -Uri $mingwUrl -OutFile $zipPath -UseBasicParsing
        
        Write-Host "  Extracting temporary toolchain..." -ForegroundColor Cyan
        Expand-Archive -Path $zipPath -DestinationPath $tempMingwDir -Force
        
        $mingwBin = Join-Path $tempMingwDir "mingw64\bin"
        $env:PATH = "$mingwBin;" + $env:PATH
        $gxxCmd = Get-Command "g++" -ErrorAction SilentlyContinue
        $isTempMingw = $true
    }
}

if (-not $gxxCmd) {
    Write-Host "[ERROR] C++ compiler setup failed." -ForegroundColor Red
    exit 1
}

$gxxVer = (& $gxxCmd.Source --version | Select-Object -First 1)
Write-Host "  C++ Compiler: $gxxVer (OK)" -ForegroundColor Green

try {
    # Compile the one-click launcher with a static MinGW runtime.
    Write-Host "`n[3/7] Compiling TPDD one-click launcher..." -ForegroundColor Yellow
    & $gxxCmd.Source `
        -std=c++20 -O2 -DNDEBUG -Wall -Wextra -municode `
        "-DTPDD_DEFAULT_GATEWAY_PORT=$($defaults.gatewayPort)" `
        "-DTPDD_DEFAULT_EDITOR_PORT=$($defaults.editorPort)" `
        "-DTPDD_DEFAULT_LAUNCHER_TIMEOUT_MS=$($defaults.launcherStartupTimeoutMs)" `
        -static -static-libgcc -static-libstdc++ `
        $launcherSource -o $launcherExe `
        -lws2_32 -lshell32 -luser32

    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $launcherExe)) {
        Write-Host "[ERROR] Failed to compile TPDD-Launcher.exe." -ForegroundColor Red
        exit 1
    }
    Write-Host "  TPDD-Launcher.exe compiled successfully." -ForegroundColor Green

    # 3. Compile LLM Gateway (Self-Contained in tools/llm-gateway/deps)
    Write-Host "`n[4/7] Compiling LLM Gateway (C++20)..." -ForegroundColor Yellow
    Push-Location $gatewaySrcDir
    
    $compileSources = @(
        "src/config.cpp",
        "src/credential_resolver.cpp",
        "src/gateway.cpp",
        "src/logger.cpp",
        "src/model_filter.cpp",
        "src/model_router.cpp",
        "src/provider.cpp",
        "src/proxy.cpp",
        "src/secret.cpp",
        "src/credential/credential_windows.cpp",
        "src/main.cpp"
    )
    
    $outExe = "llm-gateway.exe"
    
    $compileArgs = @(
        "-O3", "-DNDEBUG", "-std=c++20", "-Wall", "-Wextra",
        "-DCPPHTTPLIB_OPENSSL_SUPPORT", "-DCPPHTTPLIB_ZLIB_SUPPORT",
        "-Iinclude",
        "-Ideps/include"
    ) + $compileSources + @(
        "-o", $outExe,
        "-Ldeps/lib",
        "-lssl", "-lcrypto", "-lz",
        "-lAdvapi32", "-lCrypt32", "-lBcrypt", "-lWs2_32",
        "-static", "-static-libgcc", "-static-libstdc++"
    )
    
    Write-Host "  Compiling with static linkage from self-contained deps..." -ForegroundColor Cyan
    & $gxxCmd.Source $compileArgs
    
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $outExe)) {
        Write-Host "[ERROR] Failed to compile LLM Gateway." -ForegroundColor Red
        Pop-Location
        exit 1
    }
    
    $exeSize = (Get-Item $outExe).Length
    Write-Host "  llm-gateway.exe compiled successfully ($([Math]::Round($exeSize / 1MB, 2)) MB)" -ForegroundColor Green
    Pop-Location

    # 4. Build Frontend
    Write-Host "`n[5/7] Building Web Frontend (React/TypeScript/Vite)..." -ForegroundColor Yellow
    Push-Location $projectRoot
    
    Write-Host "  Running 'npm run build'..." -ForegroundColor Cyan
    cmd /c "npm run build"
    
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path "dist\index.html")) {
        Write-Host "[ERROR] Failed to build Web Frontend." -ForegroundColor Red
        Pop-Location
        exit 1
    }
    Write-Host "  Web Frontend built successfully (dist/ created)" -ForegroundColor Green
    Pop-Location

    # 5. Assemble Staging Package
    Write-Host "`n[6/7] Assembling release package..." -ForegroundColor Yellow
    
    if (Test-Path $stagingDir) {
        Remove-Item -Recurse -Force $stagingDir
    }
    New-Item -ItemType Directory -Path "$stagingDir\app\dist" -Force | Out-Null
    New-Item -ItemType Directory -Path "$stagingDir\gateway\config" -Force | Out-Null
    New-Item -ItemType Directory -Path "$stagingDir\samples" -Force | Out-Null
    New-Item -ItemType Directory -Path "$stagingDir\docs" -Force | Out-Null
    
    # 1. App
    Copy-Item -Recurse -Force "$projectRoot\dist\*" "$stagingDir\app\dist\"
    Copy-Item -Force "$scriptDir\templates\serve.mjs" "$stagingDir\app\serve.mjs"
    Copy-Item -Force "$scriptDir\templates\start-app.bat" "$stagingDir\app\start-app.bat"
    
    # 2. Gateway
    Copy-Item -Force "$gatewaySrcDir\llm-gateway.exe" "$stagingDir\gateway\llm-gateway.exe"
    $gatewayConfig = Join-Path $gatewaySrcDir "config\gateway.json"
    if (-not (Test-Path $gatewayConfig)) {
        $gatewayConfig = Join-Path $gatewaySrcDir "config\gateway.example.json"
    }
    Copy-Item -Force $gatewayConfig "$stagingDir\gateway\config\gateway.json"
    Copy-Item -Force "$scriptDir\templates\start-gateway.bat" "$stagingDir\gateway\start-gateway.bat"
    
    # 3. Samples & Docs
    Copy-Item -Force "$scriptDir\templates\sample-project.tpdd.json" "$stagingDir\samples\"
    Copy-Item -Force "$scriptDir\templates\sample-project.thought.json" "$stagingDir\samples\"
    Copy-Item -Force "$projectRoot\docs\QUICKSTART.md" "$stagingDir\docs\"
    Copy-Item -Force "$projectRoot\docs\REFERENCE_MANUAL.md" "$stagingDir\docs\"
    Copy-Item -Force "$projectRoot\docs\SPECIFICATION.md" "$stagingDir\docs\"
    Copy-Item -Force "$projectRoot\docs\CONFIGURATION.md" "$stagingDir\docs\"
    Copy-Item -Force "$projectRoot\AGENTS.md" "$stagingDir\docs\"
    
    Copy-Item -Force "$scriptDir\templates\start-all.bat" "$stagingDir\"
    Copy-Item -Force "$scriptDir\templates\start-all.ps1" "$stagingDir\"
    Copy-Item -Force "$scriptDir\templates\start-all-cmd.bat" "$stagingDir\"
    Copy-Item -Force "$scriptDir\templates\stop-all.bat" "$stagingDir\"
    Copy-Item -Force "$scriptDir\templates\stop-all.ps1" "$stagingDir\"
    Copy-Item -Force $launcherExe "$stagingDir\TPDD-Launcher.exe"
    Copy-Item -Force "$scriptDir\templates\install-shortcut.bat" "$stagingDir\"
    Copy-Item -Force "$scriptDir\templates\package-README.md" "$stagingDir\README.md"
    
    Write-Host "  Staging directory assembled." -ForegroundColor Green

    # 6. Compress into Release Zip
    Write-Host "`n[7/7] Generating Release ZIP Archive..." -ForegroundColor Yellow
    
    if (-not (Test-Path $releaseDir)) {
        New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
    }
    
    $expandedDir = Join-Path $releaseDir "TPDD_v$Version"
    if (Test-Path $expandedDir) {
        Remove-Item -Recurse -Force $expandedDir
    }
    New-Item -ItemType Directory -Path $expandedDir -Force | Out-Null
    Copy-Item -Recurse -Force "$stagingDir\*" $expandedDir

    $zipFileName = "TPDD_v$Version.zip"
    $targetZipPath = Join-Path $releaseDir $zipFileName
    
    if (Test-Path $targetZipPath) {
        Remove-Item -Force $targetZipPath
    }
    
    Write-Host "  Compressing: $targetZipPath" -ForegroundColor Cyan
    Compress-Archive -Path "$stagingDir\*" -DestinationPath $targetZipPath -CompressionLevel Optimal
    
    $zipSize = (Get-Item $targetZipPath).Length
    Write-Host "  ZIP created successfully: $zipFileName ($([Math]::Round($zipSize / 1MB, 2)) MB)" -ForegroundColor Green

} finally {
    Write-Host "`nCleaning up temporary staging area..." -ForegroundColor Gray
    if (Test-Path $stagingDir) {
        Remove-Item -Recurse -Force $stagingDir -ErrorAction SilentlyContinue
    }
    if ($isTempMingw -and (Test-Path $tempMingwDir)) {
        Write-Host "  Cleaning up temporary MinGW..." -ForegroundColor Gray
        Remove-Item -Recurse -Force $tempMingwDir -ErrorAction SilentlyContinue
    }
    if (Test-Path $launcherExe) {
        Remove-Item -Force $launcherExe -ErrorAction SilentlyContinue
    }
}

Write-Host "`n====================================================" -ForegroundColor Green
Write-Host "  Build and Packaging Completed Successfully!" -ForegroundColor Green
Write-Host "  Output ZIP: $targetZipPath" -ForegroundColor White
Write-Host "====================================================" -ForegroundColor Green
