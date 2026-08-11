# Kill every TOPUP HUB project python process (daphne, bot.py, bot_supervisor.py)
# reliably by command-line match — then verify ports 8000 and 18712 are free.
$ErrorActionPreference = 'Continue'

$procs = Get-CimInstance Win32_Process -Filter "Name='python.exe'"
$killed = 0
foreach ($p in $procs) {
    $cl = [string]$p.CommandLine
    if ($cl -match 'ai bilan' -and ($cl -match 'daphne' -or $cl -match 'bot')) {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Output ("killed pid " + $p.ProcessId)
        $killed++
    }
}
Write-Output ("total killed: " + $killed)

Start-Sleep -Seconds 3

Write-Output "--- remaining project python processes ---"
$left = Get-CimInstance Win32_Process -Filter "Name='python.exe'"
$found = $false
foreach ($p in $left) {
    if ([string]$p.CommandLine -match 'ai bilan' -and ([string]$p.CommandLine -match 'daphne' -or [string]$p.CommandLine -match 'bot')) {
        Write-Output ("STILL RUNNING pid " + $p.ProcessId + " :: " + $p.CommandLine)
        $found = $true
    }
}
if (-not $found) { Write-Output "CLEAN - none left" }

Write-Output "--- ports ---"
$p8000 = netstat -ano | Select-String ':8000\s' | Select-String 'LISTENING'
$p18712 = netstat -ano | Select-String '18712'
if ($p8000) { Write-Output "port 8000 OCCUPIED:"; $p8000 | ForEach-Object { Write-Output $_ } }
else { Write-Output "port 8000 free" }
if ($p18712) { Write-Output "port 18712 OCCUPIED:"; $p18712 | ForEach-Object { Write-Output $_ } }
else { Write-Output "port 18712 free" }
