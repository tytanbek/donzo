# Kill any daphne python processes on port 8000 by PORT (the only reliable way),
# then start daphne fresh. Killing by CommandLine match alone leaves stale
# processes holding the port with old settings (e.g. DisallowedHost on tunnels).
$ErrorActionPreference = 'Continue'

# 1) Kill daphne processes by command line (fast path)
$procs = Get-CimInstance Win32_Process -Filter "Name='python.exe'"
foreach ($p in $procs) {
    if ($p.CommandLine -match 'daphne') {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Output ("killed daphne " + $p.ProcessId)
    }
}
Start-Sleep -Seconds 2

# 2) Kill whatever still holds port 8000 (stale process that escaped step 1)
for ($i = 0; $i -lt 5; $i++) {
    $portPids = netstat -ano | Select-String ":8000\s" | Select-String "LISTENING"
    $pids = $portPids | ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique
    if (-not $pids) { break }
    foreach ($pid_ in $pids) {
        if ($pid_ -match '^\d+$' -and $pid_ -ne '0') {
            Stop-Process -Id ([int]$pid_) -Force -ErrorAction SilentlyContinue
            Write-Output ("killed port-8000 holder " + $pid_)
        }
    }
    Start-Sleep -Seconds 2
}

# 3) Verify the port is actually free
$still = netstat -ano | Select-String ":8000\s" | Select-String "LISTENING"
if ($still) {
    Write-Output "WARNING: port 8000 still occupied after cleanup"
} else {
    Write-Output "port 8000 free"
}

# 4) Start daphne fresh
$python = "C:\Users\Mirjahon\Desktop\DONZO\backend\venv\Scripts\python.exe"
$workdir = "C:\Users\Mirjahon\Desktop\DONZO\backend"
Start-Process -FilePath $python -ArgumentList "-m", "daphne", "-b", "0.0.0.0", "-p", "8000", "config.asgi:application" -WorkingDirectory $workdir -WindowStyle Hidden
Write-Output "daphne restarted"
