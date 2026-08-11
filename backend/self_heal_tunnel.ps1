# self_heal_tunnel.ps1 - DONZO tunnel self-healing watchdog
# ----------------------------------------------------------------------------
# Monitors the BACKEND trycloudflare tunnel. When it dies (connection refused,
# 000, or HTTP 5xx - e.g. the Cloudflare edge link dropped or maintenance mode
# is on), this script:
#
#   1. kills ONLY the backend cloudflared (the FRONTEND tunnel is preserved -
#      the bot's Web App button (web_app_url) points at the frontend URL, so
#      changing it would break the bot link users already have);
#   2. starts a fresh backend tunnel and extracts its NEW URL from the log;
#   3. syncs the new backend URL into:
#        - frontend/.env.local  (NEXT_PUBLIC_API_URL + NEXT_PUBLIC_WS_URL)
#        - DB Setting web_app_url is NOT touched (that is the frontend URL)
#   4. rebuilds + restarts the frontend DETACHED (the API URL is baked into
#      the Next.js bundle at build time);
#   5. logs every event to .freebuff\self-heal.log.
#
# If the FRONTEND tunnel is also dead, it falls back to the full pipeline
# (restart_tunnels.ps1) because without a live frontend URL the bot link is
# dead anyway and both tunnels need new URLs.
#
# Run as a watchdog loop:
#   powershell -NoProfile -ExecutionPolicy Bypass -File backend\self_heal_tunnel.ps1
# It never exits on its own (Ctrl+C / taskkill to stop). Add to start_all.ps1
# so it survives reboots.
#
# NOTE: keep this file PURE ASCII - PowerShell 5.1 reads BOM-less .ps1 as ANSI,
# where a UTF-8 em-dash (0xE2 0x80 0x94) decodes as a closing double-quote and
# silently breaks string parsing.
# ----------------------------------------------------------------------------
param(
    [int]$IntervalSeconds = 45,   # how often to re-check the tunnels
    [int]$TimeoutSeconds  = 12,   # per health-check HTTP timeout
    [int]$MaxConsecutiveFails = 3 # failures before actually healing (debounce)
)

$ErrorActionPreference = 'Continue'
$root   = 'C:\Users\Mirjahon\Desktop\DONZO'
$logDir = Join-Path $root '.freebuff'
$log    = Join-Path $logDir 'self-heal.log'
$urlsFile = Join-Path $logDir 'tunnel-urls.txt'
$cfBin  = Join-Path $logDir 'cloudflared.exe'
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
# PS 5.1 on older Windows defaults to TLS 1.0 - pin 1.2 for the HTTPS probes.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Log([string]$msg) {
    $line = '[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] ' + $msg
    Add-Content -Path $log -Value $line -Encoding UTF8
    Write-Output $line
}

# Simple HTTP status probe. Returns 0 (unreachable), or the HTTP status code.
function Get-HttpStatus([string]$url) {
    try {
        $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec $TimeoutSeconds -ErrorAction Stop
        return [int]$resp.StatusCode
    } catch {
        if ($_.Exception.Response) {
            try { return [int]$_.Exception.Response.StatusCode } catch { return 0 }
        }
        return 0
    }
}

# Read BACKEND_URL / FRONTEND_URL from .freebuff\tunnel-urls.txt (written by
# restart_tunnels.ps1). Returns [hashtable]@{backend=''; frontend=''}.
function Get-TunnelUrls {
    $urls = @{ backend = ''; frontend = '' }
    if (-not (Test-Path $urlsFile)) { return $urls }
    Get-Content $urlsFile | ForEach-Object {
        if ($_ -match '^BACKEND_URL=(.+)$') { $urls.backend = $Matches[1].Trim() }
        if ($_ -match '^FRONTEND_URL=(.+)$') { $urls.frontend = $Matches[1].Trim() }
    }
    return $urls
}

# Kill the backend cloudflared process ONLY (the one tunneling 127.0.0.1:8000).
function Stop-BackendTunnel {
    $procs = Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'"
    foreach ($p in $procs) {
        $cl = [string]$p.CommandLine
        if ($cl -match '127\.0\.0\.1:8000') {
            Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
            Log ("killed backend tunnel pid " + $p.ProcessId)
        }
    }
    Start-Sleep -Seconds 2
}

# Extract a fresh trycloudflare URL from a cloudflared err log.
function Get-TunnelUrlFromLog([string]$logPath) {
    if (-not (Test-Path $logPath)) { return '' }
    $content = Get-Content $logPath -Raw -ErrorAction SilentlyContinue
    if ($content -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
        return $Matches[0]
    }
    return ''
}

# Start a fresh backend tunnel and wait for its URL (max 40s).
function Start-BackendTunnel {
    $errLog = Join-Path $logDir 'cloudflared-backend-err.log'
    Remove-Item (Join-Path $logDir 'cloudflared-backend.log'), $errLog -ErrorAction SilentlyContinue
    Start-Process -FilePath $cfBin -ArgumentList 'tunnel','--url','http://127.0.0.1:8000','--no-autoupdate' `
        -RedirectStandardOutput (Join-Path $logDir 'cloudflared-backend.log') `
        -RedirectStandardError $errLog -WindowStyle Hidden | Out-Null
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Seconds 2
        $url = Get-TunnelUrlFromLog $errLog
        if ($url) { return $url }
    }
    return ''
}

# Rewrite frontend/.env.local with the new backend URL (API + WS only).
function Sync-FrontendEnv([string]$backendUrl) {
    $feEnv = Join-Path $root 'frontend\.env.local'
    if (-not (Test-Path $feEnv)) { Log "WARN: $feEnv topilmadi"; return }
    $content = Get-Content $feEnv -Raw -Encoding UTF8
    $wsUrl = 'wss://' + ($backendUrl -replace '^https://','') + '/ws'
    $content = $content -replace '(?m)^NEXT_PUBLIC_API_URL=.*', "NEXT_PUBLIC_API_URL=$backendUrl/api/v1"
    $content = $content -replace '(?m)^NEXT_PUBLIC_WS_URL=.*', "NEXT_PUBLIC_WS_URL=$wsUrl"
    [System.IO.File]::WriteAllText($feEnv, $content, $utf8NoBom)
    Log "frontend/.env.local -> $backendUrl/api/v1"
}

# Persist the new URLs to .freebuff\tunnel-urls.txt (keep FRONTEND_URL as-is).
function Update-UrlsFile([string]$backendUrl, [string]$frontendUrl) {
    $txt = "BACKEND_URL=$backendUrl`nFRONTEND_URL=$frontendUrl`n`nBackend: $backendUrl`nFrontend: $frontendUrl`n"
    [System.IO.File]::WriteAllText($urlsFile, $txt, $utf8NoBom)
    Log "tunnel-urls.txt updated (backend=$backendUrl)"
}

# Rebuild + restart frontend detached (bakes the new API URL).
function Rebuild-Frontend {
    $helper = Join-Path $root 'backend\rebuild_and_start_frontend.ps1'
    if (-not (Test-Path $helper)) { Log "ERROR: $helper topilmadi"; return }
    Remove-Item (Join-Path $logDir 'frontend-build-status.txt') -ErrorAction SilentlyContinue
    $argList = "-NoProfile -ExecutionPolicy Bypass -File `"$helper`""
    Start-Process -FilePath 'powershell.exe' -ArgumentList $argList -WindowStyle Hidden | Out-Null
    Log 'frontend rebuild+restart launched (detached)'
}

Log '=== self-heal watchdog started ==='

# STABLE mode (permanent domain): monitor the PERMANENT backend URL instead of
# quick tunnels. If it dies, restart_stable_tunnel.ps1 restarts ngrok/cloudflared
# (it VERIFIES the tunnel really connects; on failure it reverts stable_urls.json
# to disabled, so the watchdog automatically switches to quick-tunnel healing).
$stableJson = Join-Path $root 'backend\stable_urls.json'
$stableBackend = ''
if (Test-Path $stableJson) {
    $stableCfg = Get-Content $stableJson -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($stableCfg.enabled -and $stableCfg.backend_url) {
        $stableBackend = $stableCfg.backend_url.TrimEnd('/')
        Log "STABLE MODE ($($stableCfg.provider)) - monitoring $stableBackend"
    }
}

$beFails = 0
$feFails = 0

while ($true) {
    try {
        # ── STABLE mode: monitor the permanent backend URL ──
        if ($stableBackend) {
            $beStatus = Get-HttpStatus ($stableBackend + '/health/')
            if ($beStatus -eq 200) {
                $beFails = 0
            } else {
                $beFails++
                Log ("stable backend check #${beFails}: status=$beStatus ($stableBackend)")
            }
            if ($beFails -ge $MaxConsecutiveFails) {
                Log '=== STABLE BACKEND DOWN - restarting stable tunnel ==='
                $restartStable = Join-Path $root 'backend\restart_stable_tunnel.ps1'
                if (Test-Path $restartStable) {
                    & powershell -NoProfile -ExecutionPolicy Bypass -File $restartStable | ForEach-Object { Log $_ }
                } else {
                    Log "ERROR: $restartStable topilmadi"
                }
                # restart_stable_tunnel.ps1 stable rejimni bekor qilgan bo'lsa
                # (ngrok ishlamaydi) - watchdog oddiy quick-tunnel healing ga o'tadi.
                $stableCfg2 = Get-Content $stableJson -Raw -Encoding UTF8 | ConvertFrom-Json
                if (-not $stableCfg2.enabled) {
                    Log 'stable mode reverted - quick-tunnel healing davom etadi'
                    $stableBackend = ''
                }
                $beFails = 0
            }
            Start-Sleep -Seconds $IntervalSeconds
            continue
        }

        $urls = Get-TunnelUrls
        $beUrl = $urls.backend
        $feUrl = $urls.frontend

        if (-not $beUrl) {
            Log 'WARN: BACKEND_URL tunnel-urls.txt da yo''q - to''liq restart kerak'
            $beFails = [int]$MaxConsecutiveFails
        } else {
            $beStatus = Get-HttpStatus ($beUrl.TrimEnd('/') + '/health/')
            if ($beStatus -eq 200) {
                if ($beFails -gt 0) { Log ("backend OK again (status 200) after $beFails fails") }
                $beFails = 0
            } else {
                $beFails++
                Log ("backend check #${beFails}: status=$beStatus (URL $beUrl)")
            }
        }

        # Frontend tunnel: only track - full pipeline fallback if IT is dead.
        if ($feUrl) {
            $feStatus = Get-HttpStatus $feUrl
            if ($feStatus -eq 200) { $feFails = 0 }
            else {
                $feFails++
                Log ("frontend check #${feFails}: status=$feStatus")
            }
        }

        # ── HEAL: backend tunnel is down ──
        if ($beFails -ge $MaxConsecutiveFails -and $beUrl) {
            Log '=== BACKEND TUNNEL DOWN - healing (backend only) ==='
            Stop-BackendTunnel
            $newBe = Start-BackendTunnel
            if ($newBe) {
                Log "new backend tunnel: $newBe"
                Sync-FrontendEnv $newBe
                if ($feUrl) { Update-UrlsFile $newBe $feUrl }
                Rebuild-Frontend
                # Vercel production'ni ham yangi backend URL bilan sinxronlash
                # (doimiy frontend URL har doim jonli backend'ga ishora qilsin).
                $syncVercel = Join-Path $root 'backend\sync_vercel.ps1'
                if (Test-Path $syncVercel) {
                    Log 'Vercel production sync (new backend URL)'
                    & powershell -NoProfile -ExecutionPolicy Bypass -File $syncVercel -BackendUrl $newBe
                } else {
                    Log 'WARN: sync_vercel.ps1 topilmadi - Vercel sync o''tkazilmadi'
                }
                # Give the new tunnel a moment to warm up before the next probe.
                Start-Sleep -Seconds 20
            } else {
                Log 'ERROR: yangi backend tunnel URL olinmadi - to''liq restart kerak'
                $feFails = [int]$MaxConsecutiveFails  # force full pipeline below
            }
            $beFails = 0
        }

        # ── FULL fallback: frontend tunnel also dead (or backend unrecoverable) ──
        if ($feFails -ge $MaxConsecutiveFails) {
            Log '=== FRONTEND TUNNEL DOWN (or backend unrecoverable) - full restart_tunnels.ps1 ==='
            $pipeline = Join-Path $root 'backend\restart_tunnels.ps1'
            if (Test-Path $pipeline) {
                & powershell -NoProfile -ExecutionPolicy Bypass -File $pipeline | ForEach-Object { Log $_ }
                Log ("restart_tunnels.ps1 exit: " + $LASTEXITCODE)
            } else {
                Log "ERROR: $pipeline topilmadi"
            }
            $feFails = 0
            $beFails = 0
            Start-Sleep -Seconds 30
        }
    } catch {
        Log ("watchdog error: " + $_.Exception.Message)
    }

    Start-Sleep -Seconds $IntervalSeconds
}
