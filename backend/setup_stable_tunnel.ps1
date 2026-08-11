# setup_stable_tunnel.ps1
# ----------------------------------------------------------------------------
# Provision a PERMANENT public URL for DONZO so the web-app link NEVER changes
# (kills the trycloudflare quick-tunnel "new URL every restart" problem).
#
# Two providers are supported:
#
#   A) ngrok static domain (FREE, needs an ngrok account + authtoken):
#        Frontend endi Vercel'da (doimiy) - faqat BACKEND uchun BIRTA static
#        domain kerak. ngrok FREE plan 1 ta static domain beradi - aynan
#        backend uchun yetarli. Frontend Vercel URL'da qoladi.
#
#   B) Cloudflare named tunnel (FREE, but you MUST own a domain):
#        cloudflared tunnel create -> route DNS -> run. URL is permanent
#        as long as your domain DNS points to Cloudflare. One tunnel can map
#        TWO hostnames (app.yourdomain.uz and api.yourdomain.uz) to the two
#        local ports. This is the RECOMMENDED option.
#
# Usage examples:
#   .\setup_stable_tunnel.ps1 -Provider cloudflare -Domain donzo.uz
#   .\setup_stable_tunnel.ps1 -Provider ngrok -NgrokDomainBackend topup-hub-backend.ngrok-free.app -NgrokAuthtoken <TOKEN>
#        (frontend Vercel'da qoladi; -NgrokDomainFrontend ixtiyoriy)
#   .\setup_stable_tunnel.ps1 -Disable          # back to quick tunnels
#
# After a successful setup it writes backend/stable_urls.json (enabled=true)
# and runs sync_stable_urls.ps1 so .env.local, backend/.env and the DB
# web_app_url all point at the permanent URL. From then on restart_tunnels.ps1
# skips the quick-tunnel flow entirely.
#
# NOTE: keep this file PURE ASCII (PowerShell 5.1 + UTF-8 em-dash = broken parse).
# ----------------------------------------------------------------------------
param(
    [ValidateSet('cloudflare','ngrok','')]
    [string]$Provider = '',
    [string]$Domain = '',                 # Cloudflare: your real domain (e.g. donzo.uz)
    [string]$FrontendHost = 'app',        # Cloudflare: subdomain for the mini-app
    [string]$BackendHost  = 'api',        # Cloudflare: subdomain for the API/WS
    [string]$NgrokDomainFrontend = '',    # ngrok: frontend subdomain (IHTIYORIY - bo'sh bo'lsa Vercel ishlatiladi)
    [string]$NgrokDomainBackend  = '',    # ngrok: permanent backend subdomain (SHART)
    [string]$NgrokAuthtoken = '',         # ngrok: account authtoken
    [switch]$Disable
)

$ErrorActionPreference = 'Continue'
$root   = 'C:\Users\Mirjahon\Desktop\DONZO'
$json   = Join-Path $root 'backend\stable_urls.json'
$logDir = Join-Path $root '.freebuff'
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$cfBin  = Join-Path $logDir 'cloudflared.exe'
# Doimiy Vercel frontend URL - hech qachon o'zgarmaydi (ngrok backend-only rejimda ishlatiladi)
$VercelUrl = 'https://frontend-self-mu-1nb1d09n0h.vercel.app'

# ── Disable: revert to quick tunnels ──
if ($Disable) {
    $cfg = @{ enabled = $false; provider = ''; frontend_url = ''; backend_url = ''; backend_ws_url = ''; updated_at = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') }
    [System.IO.File]::WriteAllText($json, ($cfg | ConvertTo-Json), $utf8NoBom)
    Write-Output 'stable_urls.json: DISABLED - restart_tunnels.ps1 quick-tunnel rejimiga qaytadi.'
    exit 0
}

if (-not $Provider) {
    Write-Output 'ERROR: -Provider cloudflare|ngrok ko''rsatilishi shart (yoki -Disable)'
    exit 1
}

# ── Provider: CLOUDFLARE named tunnel (recommended, needs own domain) ──
if ($Provider -eq 'cloudflare') {
    if (-not $Domain) { Write-Output 'ERROR: -Domain donzo.uz ko''rsatilishi shart (Cloudflare hisobingizda bo''lishi kerak)'; exit 1 }
    $feHost = "$FrontendHost.$Domain"
    $beHost = "$BackendHost.$Domain"
    $feUrl  = "https://$feHost"
    $beUrl  = "https://$beHost"

    Write-Output "=== Cloudflare named tunnel: $feHost + $beHost ==="
    if (-not (Test-Path $cfBin)) {
        Write-Output "ERROR: $cfBin topilmadi. cloudflared.exe .freebuff papkasida bo'lishi kerak."
        exit 1
    }

    # 1) Authenticate (opens browser - user picks their Cloudflare account/domain)
    Write-Output 'Qadam 1/4: cloudflared login (brauzerda Cloudflare hisobingizni tanlang)...'
    & $cfBin login
    if ($LASTEXITCODE -ne 0) { Write-Output 'ERROR: cloudflared login muvaffaqiyatsiz'; exit 1 }

    # 2) Create (or reuse) the named tunnel
    $tunnelName = "donzo-$Domain".Replace('.','-')
    & $cfBin tunnel create $tunnelName 2>&1 | Out-Null   # errors if exists - fine
    # Robust ID extraction: `cloudflared tunnel create` writes a credentials
    # file at ~/.cloudflared/<tunnel-id>.json whose basename IS the tunnel ID.
    # (Note: `cloudflared tunnel list --name` is NOT a valid flag - do not use it.)
    $tunnelId = (Get-ChildItem "$env:USERPROFILE\.cloudflared\*.json" `
        | Sort-Object LastWriteTime -Descending | Select-Object -First 1).BaseName
    if (-not $tunnelId -or $tunnelId -notmatch '^[a-f0-9-]{36}$') {
        Write-Output 'ERROR: tunnel ID aniqlanmadi. ~/.cloudflared papkasida *.json tekshiring.'
        exit 1
    }
    Write-Output "  tunnel: $tunnelName ($tunnelId)"

    # 3) Route DNS for both hostnames - MUST succeed or the permanent URL 404s.
    & $cfBin tunnel route dns $tunnelName $feHost 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Output "ERROR: DNS route $feHost muvaffaqiyatsiz. Domain Cloudflare DNS'da ekanini tekshiring (nameservers)."
        exit 1
    }
    & $cfBin tunnel route dns $tunnelName $beHost 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Output "ERROR: DNS route $beHost muvaffaqiyatsiz. Domain Cloudflare DNS'da ekanini tekshiring (nameservers)."
        exit 1
    }

    # 4) Write config.yml mapping both hostnames to the local ports
    $cfgYml = @"
tunnel: $tunnelId
credentials-file: $env:USERPROFILE\.cloudflared\$tunnelId.json

ingress:
  - hostname: $feHost
    service: http://127.0.0.1:3002
  - hostname: $beHost
    service: http://127.0.0.1:8000
  - service: http_status:404
"@
    $cfgPath = Join-Path $root 'backend\cloudflared-stable.yml'
    [System.IO.File]::WriteAllText($cfgPath, $cfgYml, $utf8NoBom)
    Write-Output "  config: $cfgPath"

    # Persist + sync
    $cfg = @{
        enabled = $true; provider = 'cloudflare'
        frontend_url = $feUrl; backend_url = $beUrl
        backend_ws_url = "wss://$beHost/ws"
        updated_at = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
    }
    [System.IO.File]::WriteAllText($json, ($cfg | ConvertTo-Json), $utf8NoBom)
    Write-Output 'stable_urls.json yozildi (cloudflare) - sync_stable_urls.ps1 ishga tushirilmoqda...'
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'backend\sync_stable_urls.ps1')

    Write-Output ''
    Write-Output '=== ENDI tunnelni ishga tushiring: ==='
    Write-Output "  cloudflared tunnel --config $cfgPath run $tunnelName"
    Write-Output "  (yoki: powershell -File backend\restart_stable_tunnel.ps1)"
    exit 0
}

# ── Provider: NGROK static domain ──
# Frontend endi Vercel'da (doimiy) - faqat BACKEND static domaini kerak (ngrok
# FREE plan 1 ta static domain beradi - aynan backend uchun). -NgrokDomainFrontend
# berilmasa frontend Vercel URL'da qoladi.
if ($Provider -eq 'ngrok') {
    if (-not $NgrokDomainBackend -or -not $NgrokAuthtoken) {
        Write-Output 'ERROR: -NgrokDomainBackend va -NgrokAuthtoken shart.'
        Write-Output '  Frontend Vercel''da (doimiy) - faqat backend static domaini kerak.'
        Write-Output '  Masalan: .\setup_stable_tunnel.ps1 -Provider ngrok -NgrokDomainBackend topup-hub-backend.ngrok-free.app -NgrokAuthtoken <TOKEN>'
        exit 1
    }
    Write-Output '=== ngrok static domain (backend-only; frontend Vercel da) ==='
    $ngrokBin = Join-Path $root '.freebuff\ngrok.exe'
    if (-not (Test-Path $ngrokBin)) {
        $ngrokCmd = Get-Command ngrok -ErrorAction SilentlyContinue
        if ($ngrokCmd) { $ngrokBin = $ngrokCmd.Source }
    }
    if (-not $ngrokBin -or -not (Test-Path $ngrokBin)) {
        Write-Output "ERROR: ngrok topilmadi. Install: https://ngrok.com/download (yoki .freebuff\ngrok.exe qo'ying)"
        exit 1
    }
    # Save authtoken (needed for static domains). Fail FAST if the token
    # cannot even be stored - never write stable state with a broken token.
    & $ngrokBin config add-authtoken $NgrokAuthtoken 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Output 'ERROR: ngrok authtoken saqlanmadi (noto''g''ri format?) - stable rejim YOZILMADI.'
        exit 1
    }

    # Frontend DOIMIY Vercel URL'da qoladi (hech qachon o'zgarmaydi).
    # -NgrokDomainFrontend endi e'tiborga olinmaydi: restart_stable_tunnel.ps1
    # faqat BACKEND tunnelini ochadi - frontend domaini o'lik manzil bo'lardi.
    $feUrl = $VercelUrl

    $cfg = @{
        enabled = $true; provider = 'ngrok'
        frontend_url = $feUrl
        backend_url  = "https://$NgrokDomainBackend"
        backend_ws_url = "wss://$NgrokDomainBackend/ws"
        updated_at = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
    }
    [System.IO.File]::WriteAllText($json, ($cfg | ConvertTo-Json), $utf8NoBom)
    Write-Output 'stable_urls.json yozildi (ngrok) - sync_stable_urls.ps1 ishga tushirilmoqda...'
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'backend\sync_stable_urls.ps1')

    # MUHIM: Vercel production env (NEXT_PUBLIC_API_URL/WS_URL) ham yangi
    # backend URL ga sinxronlanadi va redeploy qilinadi - aks holda stable
    # rejim eski quick tunnelni o'ldirganda Vercel o'lik URL'ga ishora qiladi.
    Write-Output '=== Vercel production sync (yangi backend URL) ==='
    $syncVercel = Join-Path $root 'backend\sync_vercel.ps1'
    if (Test-Path $syncVercel) {
        & powershell -NoProfile -ExecutionPolicy Bypass -File $syncVercel -BackendUrl "https://$NgrokDomainBackend"
    } else {
        Write-Output "WARN: sync_vercel.ps1 topilmadi - Vercel'ni qo'lda sinxronlang (sync_vercel.ps1 -BackendUrl https://$NgrokDomainBackend)"
    }

    Write-Output ''
    Write-Output '=== ENDI backend tunnel''ni ishga tushiring: ==='
    Write-Output '  powershell -File backend\restart_stable_tunnel.ps1   (ngrok''ni ishga tushiradi + /health/ tekshiradi)'
    Write-Output '  MUHIM: agar tunnel ishga tushmasa (authtoken/domain xato) - restart_stable_tunnel.ps1 stable rejimni'
    Write-Output '  o\'zi bekor qiladi. So\'ng tezda: powershell -File backend\restart_tunnels.ps1  (quick-tunnel + Vercel tiklanadi)'
    exit 0
}

exit 1
