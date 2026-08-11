# Restart the Telegram bot: kill bot.py + bot_supervisor.py (keep daphne),
# then launch exactly one fresh supervisor via the spaces-safe launcher.
$ErrorActionPreference = 'Continue'

# 1) Kill bot.py and bot_supervisor.py (NOT daphne)
$procs = Get-CimInstance Win32_Process -Filter "Name='python.exe'"
$killed = 0
foreach ($p in $procs) {
    $cl = [string]$p.CommandLine
    if ($cl -match 'ai bilan' -and $cl -match 'bot') {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Output ("killed " + $p.ProcessId)
        $killed++
    }
}
Write-Output ("killed total: " + $killed)
Start-Sleep -Seconds 4

# 2) Verify the lock port is free (no supervisor still holding it)
$lock = netstat -ano | Select-String '18712'
if ($lock) {
    Write-Output "WARNING: lock port 18712 still held:"
    $lock | ForEach-Object { Write-Output $_ }
} else {
    Write-Output "lock port 18712 free"
}

# 3) Start ONE fresh supervisor (cmd wrapper handles spaces in path)
$launcher = "C:\Users\Mirjahon\Desktop\DONZO\backend\start_bot_supervisor.cmd"
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "`"$launcher`"" -WindowStyle Hidden
Write-Output "supervisor launching..."
