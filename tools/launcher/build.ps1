[CmdletBinding()]
param(
    [string]$OutputPath
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $OutputPath) {
    $OutputPath = Join-Path $projectRoot "release\TPDD-Launcher.exe"
}
$defaults = Get-Content -Raw (Join-Path $projectRoot "config\defaults.json") | ConvertFrom-Json
$sourcePath = Join-Path $PSScriptRoot "src\main.cpp"
$outputDirectory = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
$compiler = Get-Command "g++" -ErrorAction SilentlyContinue

if (-not $compiler) {
    throw "g++ (MinGW-w64) was not found in PATH."
}

& $compiler.Source `
    -std=c++20 `
    -O2 `
    -DNDEBUG `
    -Wall `
    -Wextra `
    "-DTPDD_DEFAULT_GATEWAY_PORT=$($defaults.gatewayPort)" `
    "-DTPDD_DEFAULT_EDITOR_PORT=$($defaults.editorPort)" `
    "-DTPDD_DEFAULT_LAUNCHER_TIMEOUT_MS=$($defaults.launcherStartupTimeoutMs)" `
    -municode `
    -static `
    -static-libgcc `
    -static-libstdc++ `
    $sourcePath `
    -o $OutputPath `
    -lws2_32 `
    -lshell32 `
    -luser32

if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $OutputPath)) {
    throw "Failed to build TPDD-Launcher.exe."
}

Write-Host "Created: $OutputPath"
