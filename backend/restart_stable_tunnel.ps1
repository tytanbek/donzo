# restart_stable_tunnel.ps1
# ----------------------------------------------------------------------------
# Start/restart the PERMANENT tunnel(s) from backend/stable_urls.json.
#
# If the config says provider=cloudflare, it starts:
#     cloudflared tunnel --config backend\cloudflared-stable.yml run <tunnel>
#   (the named tunnel maps app.yourdomain -> :3002 and api.yourdomain -> :8000)
#
# If provider=ngrok, it starts the BACKEND tunnel ONLY (frontend Vercel'da):
#     ngrok http --url=<backend-domain> 8000
#
# If stable_urls.json is disabled/empty, it prints a message and exits 0 so
# restart_tunnels.ps1 can fall back to quick tunnels.
#
# NOTE: keep this file PURE ASCII (PowerShell 5.1 + UTF-8 em-dash = broken parse).
# ----------------------------------------------------------------------------
$ErrorActionPreference = 'Continue'
$root   = 'C:\Users\Mirjahon\Desktop\DONZO'
$json   = Join-Path $root 'backend\stable_urls.json'
$logDir = Join-Path $root '.freebuff'

if (-not (Test-Path $json)) {
    Write-Output 'stable_urls.json topilmadi - stable rejim O''CHIRILGAN'
    exit 0
}
$cfg = Get-Content $json -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $cfg.enabled) {
    Write-Output 'stable_urls.json: enabled=false - stable rejim O''CHIRILGAN'
    exit 0
}

if ($cfg.provider -eq 'cloudflare') {
    $cfgPath = Join-Path $root 'backend\cloudflared-stable.yml'
    if (-not (Test-Path $cfgPath)) {
        Write-Output "ERROR: $cfgPath topilmadi - avval setup_stable_tunnel.ps1 -Provider cloudflare ishga tushiring"
        exit 1
    }
    # Extract tunnel name from the config's tunnel line (the UUID)
    $tunnelId = (Get-Content $cfgPath | Select-String '^tunnel:' | ForEach-Object { ($_ -split ':')[1].Trim() }) | Select-Object -First 1

    # Kill any existing stable cloudflared run
    Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" | ForEach-Object {
        if ($_.CommandLine -match 'cloudflared-stable.yml') {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
    }
    Start-Sleep -Seconds 2

    Write-Output "=== Starting Cloudflare named tunnel ($tunnelId) ==="
    $cfBin = Join-Path $logDir 'cloudflared.exe'
    Start-Process -FilePath $cfBin `
        -ArgumentList 'tunnel','--config',"`"$cfgPath`"",'run',$tunnelId `
        -RedirectStandardOutput (Join-Path $logDir 'cloudflared-stable.log') `
        -RedirectStandardError (Join-Path $logDir 'cloudflared-stable-err.log') `
        -WindowStyle Hidden
    Write-Output 'cloudflared tunnel ishga tushirildi (log: cloudflared-stable.log)'
    exit 0
}

if ($cfg.provider -eq 'ngrok') {
    # NOTE: frontend Vercel'da (doimiy) - faqat BACKEND tunneli kerak (port 8000).
    # ngrok free hisob 1 ta static domain beradi - aynan backend uchun ishlatiladi.
    $ngrok = Join-Path $logDir 'ngrok.exe'
    if (-not (Test-Path $ngrok)) {
        $ngrokCmd = Get-Command ngrok -ErrorAction SilentlyContinue
        if ($ngrokCmd) { $ngrok = $ngrokCmd.Source }
    }
    if (-not $ngrok -or -not (Test-Path $ngrok)) {
        Write-Output 'ERROR: ngrok topilmadi - install qiling yoki .freebuff\ngrok.exe qo''ying'
        exit 1
    }
    $beHost = $cfg.backend_url -replace '^https://',''
    $beUrl  = "https://$beHost"
    Write-Output '=== Starting ngrok backend tunnel (8000) ==='
    # Kill old ngrok first (tunnel restarts cleanly with the SAME static domain)
    Get-CimInstance Win32_Process -Filter "Name='ngrok.exe'" | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2

    # Start WITH output redirect so connection errors are visible in the log.
    Start-Process -FilePath $ngrok `
        -ArgumentList 'http',"--url=$beHost",'8000' `
        -RedirectStandardOutput (Join-Path $logDir 'ngrok-backend.log') `
        -RedirectStandardError (Join-Path $logDir 'ngrok-backend-err.log') `
        -WindowStyle Hidden | Out-Null
    Write-Output "  ngrok http --url=$beHost 8000"

    # ── VERIFY: wait ~10s, then check the process is alive AND the static
    #    domain actually answers (with retries - ngrok cold routing can make
    #    the first request slow). A bad authtoken / unassigned domain makes
    #    ngrok die silently with ERR_NGROK_xxx - never leave stable mode
    #    enabled (and quick tunnels killed) with a dead backend.
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Start-Sleep -Seconds 10
    $ngrokAlive = Get-CimInstance Win32_Process -Filter "Name='ngrok.exe'" | Select-Object -First 1
    $ok = $false
    if ($ngrokAlive) {
        for ($t = 0; $t -lt 3 -and -not $ok; $t++) {
            try {
                $r = Invoke-WebRequest -Uri "$beUrl/health/" -UseBasicParsing -TimeoutSec 15
                if ($r.StatusCode -eq 200) { $ok = $true }
            } catch { $ok = $false }
            if (-not $ok) { Start-Sleep -Seconds 4 }
        }
    }
    if (-not $ok) {
        Write-Output 'ERROR: ngrok tunnel ishga tushmadi (authtoken/domain muammosi?) - stable rejim BEKOR qilinmoqda'
        Write-Output '  Log (oxirgi 8 qator):'
        Get-Content (Join-Path $logDir 'ngrok-backend-err.log') -Tail 8 -ErrorAction SilentlyContinue | ForEach-Object { Write-Output ('    ' + $_) }
        # Revert stable mode so the next boot falls back to quick tunnels
        $cfgOff = @{ enabled = $false; provider = ''; frontend_url = ''; backend_url = ''; backend_ws_url = ''; updated_at = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') }
        [System.IO.File]::WriteAllText($json, ($cfgOff | ConvertTo-Json), (New-Object System.Text.UTF8Encoding $false))
        Write-Output '  stable_urls.json -> DISABLED (quick-tunnel fallback keyingi boot da)'
        exit 1
    }
    Write-Output "  OK: $beUrl/health/ -> 200"
    exit 0
}

Write-Output "ERROR: noma'lum provider: $($cfg.provider)"
exit 1
