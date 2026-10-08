param([string]$ExpectedVersion)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$version = $package.version
$semverPattern = '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$'
if ($version -isnot [string] -or $version -cnotmatch $semverPattern) {
    throw 'package.json version must be a valid SemVer string.'
}
if ($ExpectedVersion -and $ExpectedVersion -cne $version) {
    throw ('Version mismatch: requested {0}, package.json {1}. Update package.json first.' -f $ExpectedVersion, $version)
}
return $version
