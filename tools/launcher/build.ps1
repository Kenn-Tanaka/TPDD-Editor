[CmdletBinding()]
param(
    [string]$OutputPath
)

$ErrorActionPreference = "Stop"
if (-not $OutputPath) {
    $projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
    $OutputPath = Join-Path $projectRoot "release\TPDD-Launcher.exe"
}
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
