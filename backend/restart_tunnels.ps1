# Restart trycloudflare quick tunnels for TOPUP HUB
# Backend -> localhost:8000, Frontend -> localhost:3002

$ErrorActionPreference = 'Continue'
$root = 'C:\Users\Mirjahon\Desktop\DONZO'
$cf = Join-Path $root '.freebuff\cloudflared.exe'
$logDir = Join-Path $root '.freebuff'
# Doimiy Vercel frontend URL - hech qachon o'zgarmaydi. Bot (web_app_url)
# shu manzilni ochadi; Vercel deploy esa jonli backend tunnel'ga ishora qiladi.
$vercelUrl = 'https://frontend-self-mu-1nb1d09n0h.vercel.app'

# -- STABLE MODE: if backend/stable_urls.json is enabled, the platform uses
#    PERMANENT URLs (Cloudflare named tunnel or ngrok static domain). Skip the
#    quick-tunnel flow entirely - URLs never change on restart. Just sync the
#    stable URLs + rebuild/restart backend, frontend and bot. --
$stableJson = Join-Path $root 'backend\stable_urls.json'
if (Test-Path $stableJson) {
    $stableCfg = Get-Content $stableJson -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($stableCfg.enabled -and $stableCfg.frontend_url -and $stableCfg.backend_url) {
        Write-Output "=== STABLE MODE: permanent URLs ($($stableCfg.provider)) - quick tunnels SKIPPED ==="
        Write-Output "  frontend: $($stableCfg.frontend_url)"
        Write-Output "  backend : $($stableCfg.backend_url)"

        # Sync the stable URLs into .env.local / backend.env / DB web_app_url
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'backend\sync_stable_urls.ps1')

        # Restart backend so it reloads .env - daphne must be UP before the
        # stable URL can answer /health/.
        $restartBackend = Join-Path $root 'backend\restart_backend.ps1'
        if (Test-Path $restartBackend) {
            Write-Output '=== Restarting backend (daphne) ==='
            & powershell -NoProfile -ExecutionPolicy Bypass -File $restartBackend
        }

        # Rebuild + restart frontend DETACHED (bakes the permanent URLs)
        $feHelper = Join-Path $root 'backend\rebuild_and_start_frontend.ps1'
        Remove-Item (Join-Path $logDir 'frontend-build-status.txt') -ErrorAction SilentlyContinue
        $argList = "-NoProfile -ExecutionPolicy Bypass -File `"$feHelper`""
        Start-Process -FilePath 'powershell.exe' -ArgumentList $argList -WindowStyle Hidden | Out-Null
        Write-Output 'frontend build+start running in background (permanent URLs baked in)'

        # Restart bot: kill bot.py child - supervisor restarts it with fresh DB config
        $pyProcs = Get-CimInstance Win32_Process -Filter "Name='python.exe'"
        foreach ($p in $pyProcs) {
            if ($p.CommandLine -match 'bot\.py') {
                Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
                Write-Output ("killed bot.py " + $p.ProcessId)
            }
        }

        # ── Start + VERIFY the stable tunnel. restart_stable_tunnel.ps1 starts
        #    ngrok, waits and probes /health/ (with retries); on failure it
        #    REVERTS stable_urls.json to disabled and exits 1. We gate on that
        #    exit code: quick tunnels are killed ONLY after the stable URL is
        #    confirmed live - never leave the platform with NO public URL.
        Write-Output '=== Starting + verifying stable tunnel ==='
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'backend\restart_stable_tunnel.ps1')
        $stableExit = $LASTEXITCODE

        if ($stableExit -eq 0) {
            # Stable URL confirmed live - safe to clean up leftover quick tunnels
            Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" | ForEach-Object {
                if ($_.CommandLine -notmatch 'cloudflared-stable.yml') {
                    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
                    Write-Output ("killed leftover quick-tunnel cloudflared " + $_.ProcessId)
                }
            }
            Write-Output '=== Stable sync complete ==='
            exit 0
        }

        # ── Stable tunnel FAILED to come up: restart_stable_tunnel.ps1 already
        #    reverted stable_urls.json. Fall back to the quick-tunnel flow below.
        Write-Output '  -> stable rejim bekor qilindi, quick-tunnel rejimiga qaytiladi (pastdagi oqim)'
    } else {
        Write-Output 'stable_urls.json mavjud, lekin enabled=false - quick tunnel rejimi davom etadi'
    }
}

Write-Output '=== Killing old cloudflared processes ==='
Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" | ForEach-Object {
    Write-Output ("killing pid " + $_.ProcessId)
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 2

# Clear stale logs so URL extraction below only matches the CURRENT run's URLs
Remove-Item (Join-Path $logDir 'cloudflared-backend.log'), (Join-Path $logDir 'cloudflared-backend-err.log'), (Join-Path $logDir 'cloudflared-frontend.log'), (Join-Path $logDir 'cloudflared-frontend-err.log') -ErrorAction SilentlyContinue

# IMPORTANT: use 127.0.0.1 (IPv4) — cloudflared resolves 'localhost' to ::1 (IPv6)
# and daphne binds IPv4-only (0.0.0.0), so localhost tunnels fail with
# 'dial tcp [::1]:8000: connection refused'.
Write-Output '=== Starting backend tunnel (8000) ==='
$backendProc = Start-Process -FilePath $cf -ArgumentList 'tunnel', '--url', 'http://127.0.0.1:8000', '--no-autoupdate' -RedirectStandardOutput (Join-Path $logDir 'cloudflared-backend.log') -RedirectStandardError (Join-Path $logDir 'cloudflared-backend-err.log') -WindowStyle Hidden -PassThru
Write-Output ("backend tunnel pid: " + $backendProc.Id)

Write-Output '=== Starting frontend tunnel (3002) ==='
$frontendProc = Start-Process -FilePath $cf -ArgumentList 'tunnel', '--url', 'http://127.0.0.1:3002', '--no-autoupdate' -RedirectStandardOutput (Join-Path $logDir 'cloudflared-frontend.log') -RedirectStandardError (Join-Path $logDir 'cloudflared-frontend-err.log') -WindowStyle Hidden -PassThru
Write-Output ("frontend tunnel pid: " + $frontendProc.Id)

Write-Output '=== Waiting for tunnel URLs (max 40s) ==='
$backendUrl = ''
$frontendUrl = ''
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 2
    if (-not $backendUrl) {
        $content = Get-Content (Join-Path $logDir 'cloudflared-backend-err.log') -Raw -ErrorAction SilentlyContinue
        if ($content -match 'https://[a-z0-9-]+\.trycloudflare\.com') { $backendUrl = $Matches[0] }
    }
    if (-not $frontendUrl) {
        $content = Get-Content (Join-Path $logDir 'cloudflared-frontend-err.log') -Raw -ErrorAction SilentlyContinue
        if ($content -match 'https://[a-z0-9-]+\.trycloudflare\.com') { $frontendUrl = $Matches[0] }
    }
    if ($backendUrl -and $frontendUrl) { break }
}

Write-Output "BACKEND_URL=$backendUrl"
Write-Output "FRONTEND_URL=$frontendUrl"

# Persist URLs to a file so they survive console-output loss.
# NOTE: write WITHOUT BOM (Set-Content -Encoding UTF8 prepends \ufeff which
# breaks readers that parse with startswith('BACKEND_URL=')).
$urlsTxt = "BACKEND_URL=$backendUrl`nFRONTEND_URL=$frontendUrl`n`nBackend: $backendUrl`nFrontend: $frontendUrl`n"
[System.IO.File]::WriteAllText((Join-Path $logDir 'tunnel-urls.txt'), $urlsTxt, (New-Object System.Text.UTF8Encoding $false))
Write-Output "Saved to $logDir\tunnel-urls.txt"

if ($backendUrl -and $frontendUrl) {
    Write-Output '=== Auto-syncing URLs to .env.local / backend/.env / DB Settings ==='
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false

    # 1) frontend/.env.local - API / SITE / WS (NEXT_PUBLIC_* are read at server start)
    $frontendEnv = Join-Path $root 'frontend\.env.local'
    if (Test-Path $frontendEnv) {
        $content = Get-Content $frontendEnv -Raw -Encoding UTF8
        $backendWs = 'wss://' + ($backendUrl -replace '^https://', '') + '/ws'
        $content = $content -replace '(?m)^NEXT_PUBLIC_API_URL=.*', "NEXT_PUBLIC_API_URL=$backendUrl/api/v1"
        # SITE_URL doimiy Vercel manzilini ko'rsatadi (trycloudflare emas)
        $content = $content -replace '(?m)^NEXT_PUBLIC_SITE_URL=.*', "NEXT_PUBLIC_SITE_URL=$vercelUrl"
        $content = $content -replace '(?m)^NEXT_PUBLIC_WS_URL=.*', "NEXT_PUBLIC_WS_URL=$backendWs"
        [System.IO.File]::WriteAllText($frontendEnv, $content, $utf8NoBom)
        Write-Output "frontend/.env.local -> $backendUrl/api/v1"
    } else {
        Write-Output "WARN: $frontendEnv topilmadi"
    }

    # 2) backend/.env - WEB_APP_URL (used as a fallback / record) -> doimiy Vercel
    $backendEnv = Join-Path $root 'backend\.env'
    if (Test-Path $backendEnv) {
        $content = Get-Content $backendEnv -Raw -Encoding UTF8
        if ($content -match '(?m)^WEB_APP_URL=') {
            $content = $content -replace '(?m)^WEB_APP_URL=.*', "WEB_APP_URL=$vercelUrl"
        } else {
            $content = $content.TrimEnd("`r", "`n") + "`nWEB_APP_URL=$vercelUrl`n"
        }
        [System.IO.File]::WriteAllText($backendEnv, $content, $utf8NoBom)
        Write-Output "backend/.env WEB_APP_URL -> $vercelUrl"
    }

    # 3) DB Setting web_app_url - the bot reads this PER-MESSAGE for the Web App
    #    button. ENDI DOIMIY VERCEL URL ishlatiladi (trycloudflare emas).
    $py = Join-Path $root 'backend\venv\Scripts\python.exe'
    $djangoSync = "import os,django; os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings'); django.setup(); from apps.settings_app.models import Setting; Setting.objects.update_or_create(key='web_app_url', defaults={'value': r'$vercelUrl'}); print('DB web_app_url ->', Setting.get_setting('web_app_url'))"
    Push-Location (Join-Path $root 'backend')
    & $py -c $djangoSync
    $syncExit = $LASTEXITCODE
    Pop-Location
    if ($syncExit -ne 0) {
        Write-Output 'ERROR: DB web_app_url sinxronlash muvaffaqiyatsiz (Django xatosi) - sync bekor qilindi'
        exit 1
    }

    # 4) Restart backend (daphne) so it reloads backend/.env
    $restartBackend = Join-Path $root 'backend\restart_backend.ps1'
    if (Test-Path $restartBackend) {
        Write-Output '=== Restarting backend (daphne) ==='
        & powershell -NoProfile -ExecutionPolicy Bypass -File $restartBackend
    }

    # 5) Rebuild + restart frontend — runs DETACHED so this script never
    #    blocks on `next build` (the old inline build caused the 600s timeout).
    #    The helper ONLY starts `next start` if the build exited 0; on build
    #    failure it kills any stale frontend and writes FAILED to the status
    #    file — a stale build with dead tunnel URLs is never served.
    Write-Output '=== Frontend: launching DETACHED build+start helper ==='
    $helper = Join-Path $root 'backend\rebuild_and_start_frontend.ps1'
    if (-not (Test-Path $helper)) {
        Write-Output "ERROR: helper topilmadi: $helper - frontend qayta ishga tushirilmadi"
        exit 1
    }
    # Remove stale status so a previous run's SUCCESS cannot be misread.
    Remove-Item (Join-Path $logDir 'frontend-build-status.txt') -ErrorAction SilentlyContinue
    # Launch detached: Start-Process returns immediately; the helper runs
    # `next build` then conditionally starts :3002. Status -> frontend-build-status.txt
    # NOTE: quote the helper path with backtick-escaped quotes (PowerShell's
    # escape char is the backtick, NOT backslash - `\"` would break parsing).
    $argList = "-NoProfile -ExecutionPolicy Bypass -File `"$helper`""
    Start-Process -FilePath 'powershell.exe' -ArgumentList $argList -WindowStyle Hidden | Out-Null
    Write-Output 'frontend build+start running in background (rebuild_and_start_frontend.ps1)'
    Write-Output '  log:    preview-build.log'
    Write-Output '  status: frontend-build-status.txt  (SUCCESS | FAILED:<code>)'

    # 6) Restart bot: kill bot.py child - the supervisor restarts it with fresh DB config
    Write-Output '=== Restarting bot (supervisor restarts it) ==='
    $pyProcs = Get-CimInstance Win32_Process -Filter "Name='python.exe'"
    foreach ($p in $pyProcs) {
        if ($p.CommandLine -match 'bot\.py') {
            Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
            Write-Output ("killed bot.py " + $p.ProcessId)
        }
    }

    # 7) Vercel: backend tunnel URL o'zgargani uchun production env + deploy
    #    sinxronlanadi (doimiy frontend URL har doim jonli backend'ga ishora qiladi).
    Write-Output '=== Vercel production sync (backend URL) ==='
    $syncVercel = Join-Path $root 'backend\sync_vercel.ps1'
    if (Test-Path $syncVercel) {
        & powershell -NoProfile -ExecutionPolicy Bypass -File $syncVercel -BackendUrl $backendUrl
    } else {
        Write-Output "WARN: sync_vercel.ps1 topilmadi - Vercel sync o'tkazilmadi"
    }

    Write-Output '=== Auto-sync complete ==='
} else {
    Write-Output 'ERROR: tunnel URL(lar) topilmadi - sync o''tkazilmadi'
    exit 1
}
exit 0
