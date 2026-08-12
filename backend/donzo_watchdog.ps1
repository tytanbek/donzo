# donzo_watchdog.ps1 - DONZO 24/7 watchdog (local stack)
# ----------------------------------------------------------------------------
# Keeps the entire local platform alive while the PC is on:
#   1. backend      (daphne on :8000)
#   2. frontend     (next dev on :3002)
#   3. bot          (bot_supervisor.py, lock port :18712)
#   4. user client  (user_client_supervisor.py, lock port :18713)
#   5. tunnel       (cloudflared -> http://127.0.0.1:8000) + URL sync on change
#
# Runs forever in a hidden window. Single instance via TCP lock port 18714.
# Started at Windows logon by the "DONZO Watchdog" Scheduled Task.
# Log: .freebuff\watchdog.log
#
# NOTE: keep this file PURE ASCII - PowerShell 5.1 reads BOM-less .ps1 as ANSI,
# where a UTF-8 em-dash (0xE2 0x80 0x94) decodes as a closing double-quote and
# silently breaks string parsing.
# ----------------------------------------------------------------------------
$ErrorActionPreference = 'Continue'

$root        = 'C:\Users\Mirjahon\Desktop\DONZO'
$backendDir  = Join-Path $root 'backend'
$freebuff    = Join-Path $root '.freebuff'
$python      = Join-Path $backendDir 'venv\Scripts\python.exe'
$cloudflared = Join-Path $backendDir 'cloudflared.exe'
$nodeDir     = 'C:\Users\Mirjahon\AppData\Local\Programs\nodejs\node-v24.19.0-win-x64'
$frontendDir = Join-Path $root 'frontend'
$frontendEnv = Join-Path $frontendDir '.env.local'

$logFile     = Join-Path $freebuff 'watchdog.log'
$tunnelLog   = Join-Path $freebuff 'cloudflared-backend.log'
$tunnelErr   = Join-Path $freebuff 'cloudflared-backend-err.log'
$urlsFile    = Join-Path $freebuff 'tunnel-urls.txt'
$feLog       = Join-Path $freebuff 'frontend-dev.log'
$feErrLog    = Join-Path $freebuff 'frontend-dev-err.log'
$daphneLog   = Join-Path $freebuff 'daphne.log'
$daphneErr   = Join-Path $freebuff 'daphne-err.log'

$env:PATH = "$nodeDir;$env:PATH"
$CHECK_INTERVAL = 20
$WATCHDOG_LOCK_PORT = 18717
$stableJson = Join-Path $backendDir 'stable_urls.json'
$ngrok      = Join-Path $freebuff 'ngrok.exe'
$ngrokLog   = Join-Path $freebuff 'ngrok-backend.log'
$ngrokErr   = Join-Path $freebuff 'ngrok-backend-err.log'

function Log([string]$msg) {
    $line = '[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] ' + $msg
    Add-Content -Path $logFile -Value $line -Encoding UTF8
    Write-Output $line
}

function Test-Port([int]$port) {
    $found = netstat -ano | Select-String (':' + $port + '\s') | Select-String 'LISTENING'
    return [bool]$found
}

# Backend haqiqatan javob berayaptimi? Port band bo'lishi yetarli emas —
# tiqilib qolgan (wedged) daphne portni ushlab turib, hech narsaga javob
# bermasligi mumkin. 2xx/3xx javob = tirik; ulanish xatosi/timeout = o'lik.
function Test-BackendAlive {
    # Invoke-WebRequest -MaximumRedirection 0 301'da InvalidOperationException
    # tashlaydi va Exception.Response NULL bo'ladi — sog'lom backend "o'lik"
    # deb hisoblanib, restart bo'roni boshlanardi. HttpWebRequest esa 3xx
    # javobni exception'siz qaytaradi — 2xx/3xx = tirik.
    try {
        $req = [System.Net.HttpWebRequest]::Create('http://127.0.0.1:8000/health/')
        $req.Timeout = 6000
        $req.AllowAutoRedirect = $false
        $resp = $req.GetResponse()
        $code = [int]$resp.StatusCode
        $resp.Close()
        return ($code -ge 200 -and $code -lt 400)
    } catch {
        return $false
    }
}

# Port ochiq, lekin HTTP o'lik bo'lsa — daphne'ni majburan qayta ishga tushirish.
function Repair-Backend {
    Start-Daphne
    if ((Test-Port 8000) -and -not (Test-BackendAlive)) {
        Log 'BACKEND WEDGED: port 8000 ochiq, lekin HTTP javob bermayapti — daphne qayta ishga tushirilmoqda'
        Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -match 'daphne' } |
            ForEach-Object { & taskkill /F /T /PID $_.ProcessId 2>&1 | Out-Null }
        Start-Sleep -Seconds 6
        Start-Daphne
        Log 'BACKEND RESTARTED after wedged-state repair'
    }
}

function Get-TunnelUrl {
    $content = Get-Content $tunnelErr -Raw -ErrorAction SilentlyContinue
    if ($content -match 'https://[a-z0-9-]+\.trycloudflare\.com') { return $Matches[0] }
    return ''
}

# stable_urls.json o'qiladi: enabled=true va backend_url bor bo'lsa - STABLE rejim
function Get-StableConfig {
    if (-not (Test-Path $stableJson)) { return $null }
    try {
        $cfg = Get-Content $stableJson -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($cfg.enabled -and $cfg.backend_url -match '^https://') { return $cfg }
    } catch { }
    return $null
}

# Daphne jarayoni bormi? Port tekshiruvi yolg'on bo'lishi mumkin (bind
# kechikadi, zombie socket netstat'da ko'rinmaydi) — jarayon tekshiruvi
# aniq va dublikat chiqishini oldini oladi.
function Test-DaphneRunning {
    $procs = Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match 'daphne' }
    return [bool]$procs
}

# ── PostgreSQL (portable, .freebuff/pg) ──
$pgCtl    = Join-Path $freebuff 'pg\pgsql\bin\pg_ctl.exe'
$pgData   = Join-Path $freebuff 'pg\pgdata'
$pgLog    = Join-Path $freebuff 'pg\pg.log'

function Test-PostgresRunning {
    try {
        $procs = Get-CimInstance Win32_Process -Filter "Name='postgres.exe'" -ErrorAction SilentlyContinue
        return [bool]$procs
    } catch { return $false }
}

function Start-Postgres {
    if (Test-PostgresRunning) { return }
    if (-not (Test-Path $pgCtl) -or -not (Test-Path $pgData)) {
        Log 'WARN: PostgreSQL topilmadi (.freebuff/pg) - skip'
        return
    }
    Log 'START PostgreSQL (:5432)'
    Start-Process -FilePath $pgCtl -ArgumentList '-D',"`"$pgData`"",'-l',"`"$pgLog`"",'-o','"-p 5432"','start' `
        -WorkingDirectory (Join-Path $freebuff 'pg') -WindowStyle Hidden | Out-Null
    # DB ishga tushishini kutamiz (maks ~20s)
    for ($i = 0; $i -lt 10 -and -not (Test-PostgresRunning); $i++) { Start-Sleep -Seconds 2 }
    Log 'PostgreSQL tayyor' 
}

function Start-Daphne {
    if ((Test-Port 8000) -or (Test-DaphneRunning)) { return }
    Log 'START daphne (:8000)'
    Start-Process -FilePath $python -ArgumentList '-m','daphne','-b','127.0.0.1','-p','8000','config.asgi:application' `
        -WorkingDirectory $backendDir -WindowStyle Hidden `
        -RedirectStandardOutput $daphneLog -RedirectStandardError $daphneErr | Out-Null
}

function Start-Frontend {
    if (Test-Port 3002) { return }
    Log 'START frontend (next dev :3002)'
    Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev' `
        -WorkingDirectory $frontendDir -WindowStyle Hidden `
        -RedirectStandardOutput $feLog -RedirectStandardError $feErrLog | Out-Null
}

# Supervisor'lar o'z named-mutex'lari bilan yagona instansiyani kafolatlaydi.
# Bu yerda port o'rniga JARAYON tekshiriladi — zombie port tufayli
# supervisor o'tkazib yuborilmaydi (start qilinsa, mutex dublikatni chiqaradi).
function Start-BotSupervisor {
    $running = Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match 'bot_supervisor' }
    if ($running) { return }
    Log 'START bot supervisor (:18712)'
    Start-Process -FilePath $python -ArgumentList '-u','bot_supervisor.py' `
        -WorkingDirectory $backendDir -WindowStyle Hidden | Out-Null
}

function Start-UserClientSupervisor {
    $running = Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match 'user_client_supervisor' }
    if ($running) { return }
    Log 'START user client supervisor (:18713)'
    Start-Process -FilePath $python -ArgumentList '-u','user_client_supervisor.py' `
        -WorkingDirectory $backendDir -WindowStyle Hidden | Out-Null
}

function Start-Tunnel {
    $stable = Get-StableConfig
    if ($stable) {
        # ---- STABLE MODE: ngrok static domain (DOIMIY URL) ----
        # Qolgan trycloudflare quick tunnel'lar o'ldiriladi
        Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction SilentlyContinue | ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
            Log ('KILL leftover quick-tunnel cloudflared pid ' + $_.ProcessId)
        }
        $running = Get-CimInstance Win32_Process -Filter "Name='ngrok.exe'" -ErrorAction SilentlyContinue
        if ($running) { return }
        if (-not (Test-Path $ngrok)) {
            Log 'WARN: ngrok.exe topilmadi - stable tunnel start qilinmadi'
            return
        }
        $beHost = $stable.backend_url -replace '^https://',''
        Log ('START ngrok stable tunnel (-> :8000, ' + $stable.backend_url + ')')
        Remove-Item $ngrokLog,$ngrokErr -ErrorAction SilentlyContinue
        Start-Process -FilePath $ngrok -ArgumentList 'http',("--url=" + $beHost),'8000' `
            -WindowStyle Hidden -RedirectStandardOutput $ngrokLog -RedirectStandardError $ngrokErr | Out-Null
        # Verify: static domain /health/ javob berishi kerak (maks ~30s)
        $ok = $false
        for ($t = 0; $t -lt 6 -and -not $ok; $t++) {
            Start-Sleep -Seconds 5
            $alive = Get-CimInstance Win32_Process -Filter "Name='ngrok.exe'" -ErrorAction SilentlyContinue
            if (-not $alive) { break }
            try {
                $r = Invoke-WebRequest -Uri ($stable.backend_url + '/health/') -UseBasicParsing -TimeoutSec 8
                if ($r.StatusCode -eq 200) { $ok = $true }
            } catch { }
        }
        if (-not $ok) {
            $errText = ((Get-Content $ngrokErr -Raw -ErrorAction SilentlyContinue) -replace "`r|`n",' ')
            Log ('STABLE TUNNEL FAILED - revert qilinmoqda. ngrok err: ' + $errText)
            $cfgOff = @{ enabled = $false; provider = ''; frontend_url = ''; backend_url = ''; backend_ws_url = ''; updated_at = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') }
            [System.IO.File]::WriteAllText($stableJson, ($cfgOff | ConvertTo-Json), (New-Object System.Text.UTF8Encoding $false))
            Get-CimInstance Win32_Process -Filter "Name='ngrok.exe'" -ErrorAction SilentlyContinue | ForEach-Object {
                Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
            }
            Log 'stable_urls.json -> DISABLED (keyingi loop quick tunnelga qaytadi)'
        } else {
            Log ('STABLE TUNNEL OK: ' + $stable.backend_url + '/health/ -> 200')
        }
        return
    }
    # ---- QUICK MODE: trycloudflare (URL har restartda o'zgaradi) ----
    $running = Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction SilentlyContinue
    if ($running) { return }
    Log 'START cloudflared tunnel (-> :8000)'
    Remove-Item $tunnelLog,$tunnelErr -ErrorAction SilentlyContinue
    Start-Process -FilePath $cloudflared -ArgumentList 'tunnel','--url','http://127.0.0.1:8000','--no-autoupdate' `
        -WindowStyle Hidden -RedirectStandardOutput $tunnelLog -RedirectStandardError $tunnelErr | Out-Null
}

function Sync-TunnelUrl {
    $stable = Get-StableConfig
    $url = ''
    if ($stable) {
        $url = $stable.backend_url.TrimEnd('/')   # DOIMIY URL - bir marta sinxronlanadi
    } else {
        $url = Get-TunnelUrl
        if (-not $url) { return }
    }
    $prev = ''
    if (Test-Path $urlsFile) {
        Get-Content $urlsFile | ForEach-Object {
            if ($_ -match '^BACKEND_URL=(.+)$') { $prev = $Matches[1].Trim() }
        }
    }
    if ($prev -eq $url) { return }   # unchanged - nothing to do

    Log ("TUNNEL URL changed: " + $url)

    # 1) Update the local frontend env (dev server reads it at startup)
    if (Test-Path $frontendEnv) {
        $content = Get-Content $frontendEnv -Raw -Encoding UTF8
        $ws = 'wss://' + ($url -replace '^https://','') + '/ws'
        $content = $content -replace '(?m)^NEXT_PUBLIC_API_URL=.*', "NEXT_PUBLIC_API_URL=$url/api/v1"
        if ($content -match '(?m)^NEXT_PUBLIC_WS_URL=') {
            $content = $content -replace '(?m)^NEXT_PUBLIC_WS_URL=.*', "NEXT_PUBLIC_WS_URL=$ws"
        } else {
            # Satr yo'q edi — oxiriga qo'shamiz (aks holda WS fallback'ga tushib qolardi)
            $content += "`nNEXT_PUBLIC_WS_URL=$ws`n"
        }
        $utf8NoBom = New-Object System.Text.UTF8Encoding $false
        [System.IO.File]::WriteAllText($frontendEnv, $content, $utf8NoBom)
        Log 'SYNC frontend/.env.local -> new tunnel URL'
    }

    # 2) Record the URL so we can detect the NEXT change
    $urlsTxt = "BACKEND_URL=$url`nFRONTEND_URL=$url`n"
    [System.IO.File]::WriteAllText($urlsFile, $urlsTxt, (New-Object System.Text.UTF8Encoding $false))

    # 3) Restart the local frontend so it picks up the new API URL
    $pids = (netstat -ano | Select-String ':3002\s' | Select-String 'LISTENING') |
        ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique
    foreach ($p in $pids) {
        if ($p -match '^\d+$') { Stop-Process -Id ([int]$p) -Force -ErrorAction SilentlyContinue }
    }
    Log 'RESTART frontend (new API URL)'

    # 4) Re-sync Vercel production so the PUBLIC frontend also points at the
    #    new tunnel URL (env update + production deploy). Runs once per URL
    #    change; failures are logged, never retried in a hot loop.
    Sync-Vercel $url
}

function Sync-Vercel([string]$backendUrl) {
    $npx = Join-Path $nodeDir 'npx.cmd'
    if (-not (Test-Path $npx)) {
        Log 'SKIP Vercel sync: npx topilmadi'
        return
    }
    $ws = 'wss://' + ($backendUrl -replace '^https://','') + '/ws'
    Push-Location $frontendDir
    try {
        Log 'VERCEL: env API_URL yangilanmoqda...'
        & $npx --no-install vercel env rm NEXT_PUBLIC_API_URL production -y 2>&1 | Out-Null
        "$backendUrl/api/v1" | & $npx --no-install vercel env add NEXT_PUBLIC_API_URL production 2>&1 | Out-Null
        Log 'VERCEL: env WS_URL yangilanmoqda...'
        & $npx --no-install vercel env rm NEXT_PUBLIC_WS_URL production -y 2>&1 | Out-Null
        "$ws" | & $npx --no-install vercel env add NEXT_PUBLIC_WS_URL production 2>&1 | Out-Null
        Log 'VERCEL: production deploy...'
        # --yes: vercel lokal topilmasa on-demand yuklab olinadi
        # (--no-install almashildi - node_modules tozalansa deploy ishlamay qolardi)
        $out = & $npx --yes vercel deploy --prod 2>&1 | Out-String
        if ($LASTEXITCODE -eq 0) { Log 'VERCEL: deploy OK' } else { Log ('VERCEL: deploy FAILED - ' + $out.Trim()) }
    } catch {
        Log ('VERCEL: xato - ' + $_.Exception.Message)
    } finally {
        Pop-Location
    }
}

# ---- single-instance lock (named mutex) ----
# TCP-listener lock'da muammo bor edi: jarayon o'lsa ham socket "zombie"
# bo'lib port band qolardi va yangi watchdog ishga tusha olmasdi. Named
# mutex esa jarayon o'lgan zahoti avtomatik bo'shaydi.
$watchdogMutex = New-Object System.Threading.Mutex($false, 'Global\DONZO_Watchdog_Lock')
if (-not $watchdogMutex.WaitOne(0)) {
    Log 'Another watchdog already running - exiting.'
    exit 0
}

Log '=== DONZO watchdog started ==='
while ($true) {
    try {
        Start-Postgres
        Start-Tunnel
        Start-Daphne
        # HTTP-javob tekshiruvi: port ochiq, lekin javob bermasa (2 marta
        # ketma-ket) daphne'ni qayta ishga tushir — 'javob bermayapti'
        # hisobotlari shu bilan yo'qoladi.
        if (Test-Port 8000) {
            if (Test-BackendAlive) { $backendDead = 0 }
            else {
                $backendDead++
                if ($backendDead -ge 2) { Repair-Backend; $backendDead = 0 }
            }
        } else { $backendDead = 0 }
        # CLOUD MODE: .freebuff\cloud_mode fayli mavjud bo'lsa bot va
        # user_client CLOUD'da (Render) ishlaydi — lokalda boshlamaymiz.
        # Aks holda ikkala tomonda getUpdates/polling konflikti bo'ladi.
        $cloudMode = Test-Path (Join-Path $freebuff 'cloud_mode')
        if (-not $cloudMode) {
            Start-BotSupervisor
            Start-UserClientSupervisor
        }
        Start-Frontend
        Sync-TunnelUrl
    } catch {
        Log ('WATCHDOG ERROR: ' + $_.Exception.Message)
    }
    Start-Sleep -Seconds $CHECK_INTERVAL
}
