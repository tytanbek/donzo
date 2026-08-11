# sync_stable_urls.ps1
# ----------------------------------------------------------------------------
# Sync the PERMANENT URLs from backend/stable_urls.json into everything that
# consumes them:
#   1. frontend/.env.local   -> NEXT_PUBLIC_API_URL / SITE_URL / WS_URL
#   2. backend/.env          -> WEB_APP_URL
#   3. DB Setting web_app_url (the bot reads this PER-MESSAGE for the Web App
#      button - changing it here makes the bot's button point at the new URL
#      without a bot restart).
#
# With stable_urls.json present, restart_tunnels.ps1 SKIPS the quick-tunnel
# flow entirely - the URLs below never change, no matter how often the machine
# restarts. Run this after editing stable_urls.json, or let restart_tunnels.ps1
# call it for you.
#
# NOTE: keep this file PURE ASCII (PowerShell 5.1 reads BOM-less .ps1 as ANSI;
# a UTF-8 em-dash decodes as a quote char and breaks string parsing).
# ----------------------------------------------------------------------------
$ErrorActionPreference = 'Continue'
$root   = 'C:\Users\Mirjahon\Desktop\DONZO'
$json   = Join-Path $root 'backend\stable_urls.json'
$utf8NoBom = New-Object System.Text.UTF8Encoding $false

if (-not (Test-Path $json)) {
    Write-Output 'ERROR: stable_urls.json topilmadi - sync bekor qilindi'
    exit 1
}

$cfg = Get-Content $json -Raw -Encoding UTF8 | ConvertFrom-Json

if (-not $cfg.enabled -or -not $cfg.frontend_url -or -not $cfg.backend_url) {
    Write-Output 'stable_urls.json: enabled=false yoki URL lar bo''sh - stable rejim O''CHIRILGAN'
    exit 0
}

# Sanity: frontend must be HTTPS (Telegram requires https:// for WebAppInfo)
if (-not $cfg.frontend_url.StartsWith('https://')) {
    Write-Output "ERROR: frontend_url HTTPS emas: $($cfg.frontend_url)"
    exit 1
}

$feUrl = $cfg.frontend_url.TrimEnd('/')
$beUrl = $cfg.backend_url.TrimEnd('/')
$wsUrl = if ($cfg.backend_ws_url) { $cfg.backend_ws_url } else { 'wss://' + ($beUrl -replace '^https://','') + '/ws' }

Write-Output "=== Sync stable URLs ==="
Write-Output "  frontend: $feUrl"
Write-Output "  backend : $beUrl"
Write-Output "  ws      : $wsUrl"

# 1) frontend/.env.local
$frontendEnv = Join-Path $root 'frontend\.env.local'
if (Test-Path $frontendEnv) {
    $content = Get-Content $frontendEnv -Raw -Encoding UTF8
    $content = $content -replace '(?m)^NEXT_PUBLIC_API_URL=.*', "NEXT_PUBLIC_API_URL=$beUrl/api/v1"
    $content = $content -replace '(?m)^NEXT_PUBLIC_SITE_URL=.*', "NEXT_PUBLIC_SITE_URL=$feUrl"
    $content = $content -replace '(?m)^NEXT_PUBLIC_WS_URL=.*', "NEXT_PUBLIC_WS_URL=$wsUrl"
    [System.IO.File]::WriteAllText($frontendEnv, $content, $utf8NoBom)
    Write-Output "  frontend/.env.local -> $beUrl/api/v1"
} else {
    Write-Output "  WARN: $frontendEnv topilmadi"
}

# 2) backend/.env - WEB_APP_URL
$backendEnv = Join-Path $root 'backend\.env'
if (Test-Path $backendEnv) {
    $content = Get-Content $backendEnv -Raw -Encoding UTF8
    if ($content -match '(?m)^WEB_APP_URL=') {
        $content = $content -replace '(?m)^WEB_APP_URL=.*', "WEB_APP_URL=$feUrl/"
    } else {
        $content = $content.TrimEnd("`r", "`n") + "`nWEB_APP_URL=$feUrl/`n"
    }
    [System.IO.File]::WriteAllText($backendEnv, $content, $utf8NoBom)
    Write-Output "  backend/.env WEB_APP_URL -> $feUrl/"
}

# 3) DB Setting web_app_url (bot reads per-message)
$py = Join-Path $root 'backend\venv\Scripts\python.exe'
$djangoSync = "import os,django; os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings'); django.setup(); from apps.settings_app.models import Setting; Setting.objects.update_or_create(key='web_app_url', defaults={'value': r'$feUrl'}); print('  DB web_app_url ->', Setting.get_setting('web_app_url'))"
Push-Location (Join-Path $root 'backend')
& $py -c $djangoSync
$syncExit = $LASTEXITCODE
Pop-Location
if ($syncExit -ne 0) {
    Write-Output 'ERROR: DB web_app_url sinxronlash muvaffaqiyatsiz (Django xatosi)'
    exit 1
}

Write-Output '=== Sync complete - frontend rebuild + restart kerak (NEXT_PUBLIC_* build ichiga bake qilinadi) ==='
exit 0
