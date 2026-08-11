# Kill all TOPUP HUB bot / supervisor python processes
$procs = Get-CimInstance Win32_Process -Filter "Name='python.exe'"
foreach ($p in $procs) {
    if ($p.CommandLine -match 'bot') {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Output ("killed " + $p.ProcessId)
    }
}
Start-Sleep -Seconds 2
$left = Get-CimInstance Win32_Process -Filter "Name='python.exe'"
$bots = $left | Where-Object { $_.CommandLine -match 'bot' }
if ($bots) {
    Write-Output "STILL RUNNING:"
    $bots | ForEach-Object { Write-Output ($_.ProcessId.ToString() + " " + $_.CommandLine) }
} else {
    Write-Output "CLEAN: no bot processes left"
}
