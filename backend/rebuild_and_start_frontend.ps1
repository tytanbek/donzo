# rebuild_and_start_frontend.ps1
# ----------------------------------------------------------------------------
# Frontend rebuild + conditional start (run DETACHED from restart_tunnels.ps1).
#
# WHY this exists:
#   * restart_tunnels.ps1 previously ran `next build` synchronously inline,
#     blocking the whole script for minutes (the 600s timeout problem).
#   * Worse, if the build FAILED it still called `next start`, which served the
#     STALE .next build with dead tunnel URLs - falsely reporting success.
#
# This helper:
#   1. Runs `next build` with the freshly-synced .env.local (new tunnel URLs
#      are baked into the bundle at BUILD time).
#   2. Starts `next start -p 3002` ONLY if the build exited 0.
#   3. On build failure it KILLS any running frontend and writes FAILED to the
#      status file - the frontend is never left serving a stale build.
#   4. Writes .freebuff\frontend-build-status.txt = SUCCESS | FAILED:<code>
#      so callers (and humans) can check the outcome without parsing logs.
#
# Run detached from restart_tunnels.ps1 via Start-Process - it never blocks
# the parent script. Exit code: 0 = frontend up with fresh build, 1 = failure.
#
# NOTE: keep this file PURE ASCII - PowerShell 5.1 reads BOM-less .ps1 as ANSI,
# where a UTF-8 em-dash (0xE2 0x80 0x94) decodes as a closing double-quote and
# silently breaks string parsing.
# ----------------------------------------------------------------------------
param(
    [string]$FrontendDir = 'C:\Users\Mirjahon\Desktop\DONZO\frontend',
    [string]$LogDir      = 'C:\Users\Mirjahon\Desktop\DONZO\.freebuff'
)

$ErrorActionPreference = 'Continue'

$buildLog    = Join-Path $LogDir 'preview-build.log'
$statusFile  = Join-Path $LogDir 'frontend-build-status.txt'
$feLog       = Join-Path $LogDir 'preview-frontend.log'
$feErrLog    = Join-Path $LogDir 'preview-frontend-err.log'
$utf8NoBom   = New-Object System.Text.UTF8Encoding $false

function Write-Status([string]$value) {
    $line = "$value`n$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`n"
    [System.IO.File]::WriteAllText($statusFile, $line, $utf8NoBom)
}

function Stop-FrontendOn3002 {
    # Kill whatever is listening on :3002 (old/stale next start).
    $pids = (netstat -ano | Select-String ':3002\s' | Select-String 'LISTENING') |
        ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique
    foreach ($p in $pids) {
        if ($p -match '^\d+$') { Stop-Process -Id ([int]$p) -Force -ErrorAction SilentlyContinue }
    }
    Start-Sleep -Seconds 2
}

Write-Output '=== [frontend-build] next build (bakes current .env.local tunnel URLs) ==='
Remove-Item $buildLog -ErrorAction SilentlyContinue

Push-Location $FrontendDir
# --no-install: NEVER let npx fetch packages from the network at deploy time
# (a missing node_modules would otherwise hang the script on an interactive
# install prompt). next is always present in frontend/node_modules/.bin.
# Capture output FIRST (UTF-8, human-readable log), then the exit code -
# `*> $buildLog` would write UTF-16 which is unreadable with tail/less.
$buildOutput = & npx.cmd --no-install next build 2>&1
$buildExit = $LASTEXITCODE
$buildOutput | Out-File -FilePath $buildLog -Encoding utf8
Pop-Location

if ($buildExit -ne 0) {
    Write-Output "ERROR: next build FAILED (exit $buildExit) - see $buildLog"
    Write-Output '=== [frontend-build] Stopping any stale frontend on :3002 (never serve old build) ==='
    Stop-FrontendOn3002
    Write-Status "FAILED:$buildExit"
    exit 1
}

Write-Output '=== [frontend-build] Build OK - starting next start -p 3002 ==='
Stop-FrontendOn3002
Start-Process -FilePath 'npx.cmd' -ArgumentList 'next','start','-p','3002' `
    -WorkingDirectory $FrontendDir `
    -RedirectStandardOutput $feLog -RedirectStandardError $feErrLog -WindowStyle Hidden

# Verify the frontend actually comes up - fail loudly, never leave it dead.
$feUp = $false
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 2
    try {
        $resp = Invoke-WebRequest -Uri 'http://127.0.0.1:3002/' -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        if ($resp.StatusCode -eq 200) { $feUp = $true; break }
    } catch { }
}

if ($feUp) {
    Write-Output 'frontend is UP on :3002 (fresh build)'
    Write-Status 'SUCCESS'
    exit 0
}

Write-Output "ERROR: frontend :3002 ga chiqmadi - $feErrLog tekshiring"
Write-Status 'FAILED:not-up'
exit 1
