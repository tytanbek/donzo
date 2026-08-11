# Start exactly ONE TopupHub bot supervisor (detached, hidden)
$python = "C:\Users\Mirjahon\Desktop\DONZO\backend\venv\Scripts\python.exe"
$workdir = "C:\Users\Mirjahon\Desktop\DONZO\backend"
Start-Process -FilePath $python -ArgumentList "-u", "bot_supervisor.py" -WorkingDirectory $workdir -WindowStyle Hidden
Write-Output "supervisor launched"
