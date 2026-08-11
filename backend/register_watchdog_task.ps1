# register_watchdog_task.ps1 - DONZO Watchdog autostart (Windows Scheduled Task)
# ----------------------------------------------------------------------------
# Registers a Scheduled Task that:
#   * starts donzo_watchdog.ps1 at every Windows logon (hidden)
#   * auto-restarts the watchdog if it exits unexpectedly (RestartOnFailure)
#
# The watchdog is a single forever-loop that keeps the WHOLE local stack alive
# while the PC is on: backend (daphne :8000), frontend (next dev :3002),
# Telegram bot supervisor (:18712), user client supervisor (:18713) and the
# cloudflared tunnel (-> :8000) with URL re-sync when the tunnel restarts.
# Each piece is port-guarded, so double-starts are impossible.
#
# Run manually (admin NOT required for CurrentUser task):
#   powershell -ExecutionPolicy Bypass -File register_watchdog_task.ps1
#
# To remove:  schtasks /Delete /TN "DONZO Watchdog" /F
# ----------------------------------------------------------------------------
$ErrorActionPreference = 'Continue'

$taskName  = 'DONZO Watchdog'
$root      = 'C:\Users\Mirjahon\Desktop\DONZO'
$watchdog  = Join-Path $root 'backend\donzo_watchdog.ps1'
$workdir   = Join-Path $root 'backend'
$log       = Join-Path (Join-Path $root '.freebuff') 'watchdog-task.log'

function Log([string]$msg) {
    $line = '[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] ' + $msg
    Add-Content -Path $log -Value $line -Encoding UTF8
    Write-Output $line
}

# --- 1) Validate prerequisites ---
if (-not (Test-Path $watchdog)) {
    Log "XATO: watchdog topilmadi: $watchdog"
    exit 1
}

# --- 2) Delete an existing task (idempotent re-register) ---
Log "Eski vazifa ochirilmoqda (agar mavjud bolsa)..."
schtasks /Delete /TN $taskName /F 2>$null | Out-Null

# --- 3) Register the task: logon trigger + restart on failure ---
Log 'Vazifa royxatdan otkazilmoqda...'
$xmlPath = Join-Path $env:TEMP 'donzo-watchdog-task.xml'

@"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>DONZO 24/7 watchdog: keeps backend, frontend, bot, user client and tunnel alive while the PC is on.</Description>
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
      <Command>powershell.exe</Command>
      <Arguments>-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$watchdog"</Arguments>
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
    Log "OK: '$taskName' vazifasi royxatdan otdi. Kompyuter yonganda hammasi avtomatik ishga tushadi."
} else {
    Log 'XATO: vazifa royxatdan otmadi (schtasks chiqishini tekshiring).'
}

# --- 5) Start it right now (no reboot needed) ---
Log 'Vazifa hozir ishga tushirilmoqda...'
schtasks /Run /TN $taskName 2>&1 | ForEach-Object { Log $_ }
Log 'Tayyor.'
