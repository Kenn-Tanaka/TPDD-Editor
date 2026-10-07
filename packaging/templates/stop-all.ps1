$ErrorActionPreference = "SilentlyContinue"

function Stop-ExpectedProcessOnPort {
    param(
        [int]$Port,
        [string]$ExpectedName,
        [string]$CommandLineSuffix
    )

    $connections = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $Port -State Listen
    foreach ($connection in $connections) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)"
        if (-not $process -or $process.Name -ne $ExpectedName) {
            Write-Warning "Port $Port is owned by another application; it was not stopped."
            continue
        }
        if ($CommandLineSuffix -and $process.CommandLine -notlike "*$CommandLineSuffix*") {
            Write-Warning "Port $Port is owned by another $ExpectedName process; it was not stopped."
            continue
        }
        Stop-Process -Id $process.ProcessId -Force
    }
}

Stop-ExpectedProcessOnPort -Port 8765 -ExpectedName "llm-gateway.exe" -CommandLineSuffix ""
Stop-ExpectedProcessOnPort -Port 3000 -ExpectedName "node.exe" -CommandLineSuffix "app\serve.mjs"

Write-Host "TPDD-owned processes have been stopped."
