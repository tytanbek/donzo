# Clean restart: kill all bot/supervisor processes, then start exactly ONE supervisor
$ErrorActionPreference = 'SilentlyContinue'
Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
    Where-Object { ([string]$_.CommandLine) -match 'bot_supervisor|bot\.py' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

Start-Sleep -Seconds 3
$remaining = (Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
    Where-Object { ([string]$_.CommandLine) -match 'bot' }).Count
Write-Output "after_kill_count=$remaining"

$workdir = 'C:\Users\Mirjahon\Desktop\DONZO\backend'
$py = Join-Path $workdir 'venv\Scripts\python.exe'
Start-Process -FilePath $py -ArgumentList 'bot_supervisor.py' -WorkingDirectory $workdir -WindowStyle Hidden
Write-Output "started_one_supervisor"

Start-Sleep -Seconds 15
Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
    Where-Object { ([string]$_.CommandLine) -match 'bot' } |
    ForEach-Object { Write-Output ("pid=" + $_.ProcessId + " | " + ([string]$_.CommandLine).Substring(0, [Math]::Min(80, ([string]$_.CommandLine).Length))) }
