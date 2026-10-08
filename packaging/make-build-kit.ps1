<#
.SYNOPSIS
    ビルドキット自体の配布用ZIP (release/TPDD_BuildKit_v1.1.0.zip) を生成するスクリプト
#>

param(
    [string]$Version
)

$ErrorActionPreference = "Stop"
$Version = & (Join-Path $PSScriptRoot 'get-project-version.ps1') -ExpectedVersion $Version

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$releaseDir = Join-Path $projectRoot "release"
$kitZipName = "TPDD_BuildKit_v$Version.zip"
$kitZipPath = Join-Path $releaseDir $kitZipName
$stagingDir = Join-Path $env:TEMP ("tpdd-kit-staging-" + [System.Guid]::NewGuid().ToString().Substring(0, 8))

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "  TPDD ビルドキット 配布用ZIP生成" -ForegroundColor Cyan
Write-Host "  出力先: $kitZipPath" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

if (-not (Test-Path $releaseDir)) {
    New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
}

if (Test-Path $stagingDir) {
    Remove-Item -Recurse -Force $stagingDir
}
New-Item -ItemType Directory -Path $stagingDir -Force | Out-Null

try {
    Write-Host "ステージング領域にソースおよびツールをコピー中..." -ForegroundColor Yellow

    # 1. Packaging and launcher sources
    Copy-Item -Recurse -Force "$projectRoot\packaging" "$stagingDir\packaging"
    New-Item -ItemType Directory -Path "$stagingDir\tools" -Force | Out-Null
    Copy-Item -Recurse -Force "$projectRoot\tools\launcher" "$stagingDir\tools\launcher"

    # 2. src
    Copy-Item -Recurse -Force "$projectRoot\src" "$stagingDir\src"

    # 3. tools/llm-gateway (buildフォルダを除外し、src, include, config, deps をコピー)
    $gwStaging = "$stagingDir\tools\llm-gateway"
    New-Item -ItemType Directory -Path $gwStaging -Force | Out-Null
    Copy-Item -Recurse -Force "$projectRoot\tools\llm-gateway\src" "$gwStaging\src"
    Copy-Item -Recurse -Force "$projectRoot\tools\llm-gateway\include" "$gwStaging\include"
    Copy-Item -Recurse -Force "$projectRoot\tools\llm-gateway\config" "$gwStaging\config"
    Copy-Item -Recurse -Force "$projectRoot\tools\llm-gateway\deps" "$gwStaging\deps"
    Copy-Item -Force "$projectRoot\tools\llm-gateway\CMakeLists.txt" "$gwStaging\CMakeLists.txt"

    # 4. docs
    Copy-Item -Recurse -Force "$projectRoot\docs" "$stagingDir\docs"

    # 5. scripts
    Copy-Item -Recurse -Force "$projectRoot\scripts" "$stagingDir\scripts"

    # 7. Root configs
    $rootFiles = @(
        "package.json",
        "package-lock.json",
        "tsconfig.json",
        "vite.config.ts",
        "tailwind.config.js",
        "postcss.config.js",
        "index.html",
        "README.md",
        "AGENTS.md"
    )
    foreach ($f in $rootFiles) {
        $p = Join-Path $projectRoot $f
        if (Test-Path $p) {
            Copy-Item -Force $p "$stagingDir\$f"
        }
    }

    # 8. ルートに直感的な build.bat へのショートカット／ラッパーバッチを配置
    $rootBuildBat = @'
@echo off
cd /d "%~dp0packaging"
call build-release.bat
'@
    [System.IO.File]::WriteAllText("$stagingDir\build.bat", $rootBuildBat, [System.Text.Encoding]::ASCII)

    # ZIP圧縮
    if (Test-Path $kitZipPath) {
        Remove-Item -Force $kitZipPath
    }

    Write-Host "ZIPアーカイブを圧縮しています ($kitZipName)..." -ForegroundColor Cyan
    Compress-Archive -Path "$stagingDir\*" -DestinationPath $kitZipPath -CompressionLevel Optimal

    $zipSize = (Get-Item $kitZipPath).Length
    Write-Host "`n[SUCCESS] ビルドキット配布用ZIPが生成されました！" -ForegroundColor Green
    Write-Host "  ファイル: $kitZipPath ($([Math]::Round($zipSize / 1MB, 2)) MB)" -ForegroundColor White

} finally {
    if (Test-Path $stagingDir) {
        Remove-Item -Recurse -Force $stagingDir -ErrorAction SilentlyContinue
    }
}
