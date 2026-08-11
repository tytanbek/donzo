# register_backup_task.ps1 - DONZO daily backup (Windows Scheduled Task)
# ----------------------------------------------------------------------------
# Registers a daily 03:00 task that runs backup_donzo.ps1 (db + .env snapshot,
# keeps last 14). Idempotent — re-running re-registers cleanly.
#
#   powershell -ExecutionPolicy Bypass -File register_backup_task.ps1
#   schtasks /Delete /TN "DONZO Backup" /F   (o'chirish)
# ----------------------------------------------------------------------------
$ErrorActionPreference = 'Continue'

$taskName = 'DONZO Backup'
$root     = 'C:\Users\Mirjahon\Desktop\DONZO'
$script   = Join-Path $root 'backend\backup_donzo.ps1'
$log      = Join-Path (Join-Path $root '.freebuff') 'backup-task.log'

function Log([string]$msg) {
    $line = '[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] ' + $msg
    Add-Content -Path $log -Value $line -Encoding UTF8
    Write-Output $line
}

if (-not (Test-Path $script)) {
    Log "XATO: backup_donzo.ps1 topilmadi: $script"
    exit 1
}

Log "Eski vazifa o'chirilmoqda..."
schtasks /Delete /TN $taskName /F 2>$null | Out-Null

$xmlPath = Join-Path $env:TEMP 'donzo-backup-task.xml'
@"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>DONZO daily backup: db.sqlite3 + .env into .freebuff/backups (keeps 14).</Description>
  </RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>2026-01-01T03:00:00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay>
        <DaysInterval>1</DaysInterval>
      </ScheduleByDay>
    </CalendarTrigger>
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
    <StartWhenAvailable>true</StartWhenAvailable>
    <Enabled>true</Enabled>
    <Hidden>true</Hidden>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>999</Count>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>powershell.exe</Command>
      <Arguments>-NoProfile -ExecutionPolicy Bypass -File "$script"</Arguments>
      <WorkingDirectory>$(Join-Path $root 'backend')</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"@ | Out-File -FilePath $xmlPath -Encoding Unicode

schtasks /Create /TN $taskName /XML $xmlPath /F 2>&1 | ForEach-Object { Log $_ }
Remove-Item $xmlPath -Force -ErrorAction SilentlyContinue

if (schtasks /Query /TN $taskName 2>$null) {
    Log "OK: '$taskName' royxatdan o'tdi (har kuni 03:00)."
} else {
    Log 'XATO: vazifa royxatdan otmadi.'
}

# Run once now so a backup exists immediately.
Log 'Birinchi zaxira hozir bajarilmoqda...'
powershell -NoProfile -ExecutionPolicy Bypass -File $script
Log 'Tayyor.'
