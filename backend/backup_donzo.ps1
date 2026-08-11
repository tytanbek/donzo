# backup_donzo.ps1 - DONZO daily backup (db.sqlite3 + .env + bot/user stats)
# ----------------------------------------------------------------------------
# Copies the SQLite database and the .env secrets file into .freebuff/backups/.
# Keeps the last 14 snapshots, deletes older ones.
#
# .env is CRITICAL: it holds SETTINGS_ENCRYPTION_KEY / DJANGO_SECRET_KEY and
# the bot token fallback. Losing it means the encrypted settings in the DB
# (bot token, Fragment key, cardpay credentials, payment secrets) can never
# be decrypted again. Back it up!
#
# Registered as a daily Scheduled Task ("DONZO Backup") by:
#   powershell -ExecutionPolicy Bypass -File register_backup_task.ps1
# ----------------------------------------------------------------------------
$ErrorActionPreference = 'Continue'

$root    = 'C:\Users\Mirjahon\Desktop\DONZO'
$db      = Join-Path $root 'backend\db.sqlite3'
$envFile = Join-Path $root 'backend\.env'
$backup  = Join-Path (Join-Path $root '.freebuff') 'backups'
$log     = Join-Path (Join-Path $root '.freebuff') 'backup.log'
$keep    = 14

function Log([string]$msg) {
    $line = '[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] ' + $msg
    Add-Content -Path $log -Value $line -Encoding UTF8
    Write-Output $line
}

New-Item -ItemType Directory -Force -Path $backup | Out-Null

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$ok = 0

if (Test-Path $db) {
    Copy-Item $db (Join-Path $backup "db-$stamp.sqlite3") -Force
    Log "DB zaxira qilindi: db-$stamp.sqlite3 ($([math]::Round((Get-Item $db).Length/1KB)) KB)"
    $ok++
} else {
    Log "XATO: db.sqlite3 topilmadi: $db"
}

if (Test-Path $envFile) {
    Copy-Item $envFile (Join-Path $backup "env-$stamp.txt") -Force
    Log ".env zaxira qilindi: env-$stamp.txt"
    $ok++
} else {
    Log "XATO: .env topilmadi: $envFile"
}

# Keep the newest $keep snapshots (by date-stamped filename), remove the rest.
$all = Get-ChildItem $backup -File | Sort-Object Name -Descending
$toDelete = $all | Select-Object -Skip ($keep * 2)
foreach ($f in $toDelete) {
    Remove-Item $f.FullName -Force
    Log "Eski zaxira o'chirildi: $($f.Name)"
}

Log "Tayyor: $ok/2 fayl zaxiralandi. Jami zaxiralar: $((Get-ChildItem $backup -File).Count)"
