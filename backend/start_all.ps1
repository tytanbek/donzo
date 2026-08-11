# start_all.ps1 - DONZO full-stack autostart
# ----------------------------------------------------------------------------
# Brings up the ENTIRE platform at Windows logon:
#   1. waits for network (cloudflared needs internet)
#   2. ensures the Telegram bot supervisor is running (idempotent)
#   3. runs restart_tunnels.ps1 - the full pipeline:
#        tunnels -> URL sync (.env.local / backend/.env / DB web_app_url)
#        -> backend restart (daphne) -> frontend rebuild+start (DETACHED)
#        -> bot restart (supervisor respawns it)
#
# Safe to run manually while everything is up (pipeline is self-healing:
# it kills and restarts each piece cleanly). Logs to
#   .freebuff\autostart.log
# ----------------------------------------------------------------------------
# NOTE: keep this file PURE ASCII - PowerShell 5.1 reads BOM-less .ps1 as ANSI,
# where a UTF-8 em-dash (0xE2 0x80 0x94) decodes as a closing double-quote and
# silently breaks string parsing.
# ----------------------------------------------------------------------------
$ErrorActionPreference = 'Continue'
$root   = 'C:\Users\Mirjahon\Desktop\DONZO'
$logDir = Join-Path $root '.freebuff'
$log    = Join-Path $logDir 'autostart.log'
$utf8NoBom = New-Object System.Text.UTF8Encoding $false

function Log([string]$msg) {
    $line = '[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] ' + $msg
    Add-Content -Path $log -Value $line -Encoding UTF8
    Write-Output $line
}

Log '=== DONZO autostart begin ==='

# --- 1) Wait for network (max ~60s) ---
$online = $false
for ($i = 0; $i -lt 20; $i++) {
    if (Test-Connection -ComputerName 8.8.8.8 -Count 1 -Quiet -ErrorAction SilentlyContinue) {
        $online = $true
        break
    }
    Start-Sleep -Seconds 3
}
Log ("network online: " + $online)

# --- 2) Bot supervisor - start EXACTLY one (kill stale duplicates first) ---
$python = Join-Path $root 'backend\venv\Scripts\python.exe'
$backendDir = Join-Path $root 'backend'

# Kill any supervisor that may already be running so we never get two
# supervisors polling getUpdates (409 Conflict). Also kill any orphan bot.py
# children - the fresh supervisor will spawn its own.
$pyProcs = Get-CimInstance Win32_Process -Filter "Name='python.exe'"
foreach ($p in $pyProcs) {
    $cl = [string]$p.CommandLine
    if ($cl -match 'bot_supervisor\.py' -or $cl -match 'bot\.py') {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
        Log ("killed stale process pid " + $p.ProcessId + " (" + $cl + ")")
    }
}
Start-Sleep -Seconds 2

Log 'starting bot supervisor (hidden)'
Start-Process -FilePath $python -ArgumentList '-u','bot_supervisor.py' -WorkingDirectory $backendDir -WindowStyle Hidden | Out-Null

# --- 3) Full pipeline: tunnels + sync + backend + frontend + bot ---
$pipeline = Join-Path $root 'backend\restart_tunnels.ps1'
if (Test-Path $pipeline) {
    Log 'running restart_tunnels.ps1 (tunnels + sync + backend + frontend rebuild)'
    & powershell -NoProfile -ExecutionPolicy Bypass -File $pipeline | ForEach-Object { Log $_ }
    Log ("restart_tunnels.ps1 exit code: " + $LASTEXITCODE)
} else {
    Log "ERROR: $pipeline topilmadi"
}

# --- 4) Self-healing tunnel watchdog (backend tunnel dies -> auto heal) ---
$selfHeal = Join-Path $root 'backend\self_heal_tunnel.ps1'
if (Test-Path $selfHeal) {
    # Only start if not already running (idempotent - one watchdog only).
    $already = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { [string]$_.CommandLine -match 'self_heal_tunnel\.ps1' }
    if ($already) {
        Log 'self-heal watchdog already running - skipping'
    } else {
        Log 'starting self-heal tunnel watchdog (hidden)'
        Start-Process -FilePath 'powershell.exe' `
            -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$selfHeal`"" `
            -WindowStyle Hidden | Out-Null
    }
} else {
    Log "WARN: $selfHeal topilmadi"
}

# --- 5) User Client (card payment verifier) - Windows Scheduled Task ---
# Register the task ONCE (idempotent: re-register is safe), then make sure it
# is running now. The task starts at every logon and restarts on failure;
# user_client_supervisor.py is the watchdog that keeps user_client.py alive.
$ucRegister = Join-Path $root 'backend\register_user_client_task.ps1'
if (Test-Path $ucRegister) {
    Log 'registering user client scheduled task'
    & powershell -NoProfile -ExecutionPolicy Bypass -File $ucRegister | ForEach-Object { Log $_ }
    Log ("register_user_client_task.ps1 exit code: " + $LASTEXITCODE)
} else {
    Log "WARN: $ucRegister topilmadi - user client autostart skipplanadi"
}

Log '=== DONZO autostart end ==='
