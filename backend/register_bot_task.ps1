# register_bot_task.ps1 - DONZO Bot autostart (Windows Scheduled Task)
# ----------------------------------------------------------------------------
# Registers a Scheduled Task that:
#   • starts bot_supervisor.py at every Windows logon (hidden)
#   • auto-restarts the supervisor if it exits unexpectedly (RestartOnFailure)
#
# The supervisor is the watchdog: it keeps bot.py (Telegram polling) alive 24/7
# and restarts it after any crash. A single supervisor also prevents duplicate
# polling processes (getUpdates 409 conflicts).
#
# Run manually (admin NOT required for CurrentUser task):
#   powershell -ExecutionPolicy Bypass -File register_bot_task.ps1
#
# To remove:  schtasks /Delete /TN "DONZO Bot" /F
# ----------------------------------------------------------------------------
$ErrorActionPreference = 'Continue'

$taskName = 'DONZO Bot'
$root     = 'C:\Users\Mirjahon\Desktop\DONZO'
$python   = Join-Path $root 'backend\venv\Scripts\python.exe'
$workdir  = Join-Path $root 'backend'
$log      = Join-Path (Join-Path $root '.freebuff') 'bot-task.log'

function Log([string]$msg) {
    $line = '[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] ' + $msg
    Add-Content -Path $log -Value $line -Encoding UTF8
    Write-Output $line
}

# --- 1) Validate prerequisites ---
if (-not (Test-Path $python)) {
    Log "XATO: python topilmadi: $python"
    exit 1
}
if (-not (Test-Path (Join-Path $workdir 'bot_supervisor.py'))) {
    Log 'XATO: bot_supervisor.py topilmadi'
    exit 1
}

# --- 2) Delete an existing task (idempotent re-register) ---
Log "Eski vazifa o'chirilmoqda (agar mavjud bo'lsa)..."
schtasks /Delete /TN $taskName /F 2>$null | Out-Null

# --- 3) Register the task: logon trigger + restart on failure ---
Log 'Vazifa royxatdan otkazilmoqda...'
$xmlPath = Join-Path $env:TEMP 'donzo-bot-task.xml'

@"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>DONZO Telegram bot (polling). Starts at logon; supervisor restarts bot.py on crash.</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>$env:USERNAME</UserId>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>$env:USERNAME</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <Enabled>true</Enabled>
    <Hidden>true</Hidden>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>999</Count>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>"$python"</Command>
      <Arguments>-u bot_supervisor.py</Arguments>
      <WorkingDirectory>$workdir</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"@ | Out-File -FilePath $xmlPath -Encoding Unicode

schtasks /Create /TN $taskName /XML $xmlPath /F 2>&1 | ForEach-Object { Log $_ }
Remove-Item $xmlPath -Force -ErrorAction SilentlyContinue

# --- 4) Verify ---
$task = schtasks /Query /TN $taskName /FO LIST /V 2>$null
if ($task -match $taskName) {
    Log "OK: '$taskName' vazifasi royxatdan o'tdi. Kompyuter yonganda bot avtomatik ishga tushadi."
} else {
    Log 'XATO: vazifa royxatdan otmadi (schtasks chiqishini tekshiring).'
}

# --- 5) Start it right now (no reboot needed) ---
Log 'Vazifa hozir ishga tushirilmoqda...'
schtasks /Run /TN $taskName 2>&1 | ForEach-Object { Log $_ }
Log 'Tayyor.'
