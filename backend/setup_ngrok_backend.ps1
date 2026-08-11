# setup_ngrok_backend.ps1 - DONZO backend uchun DOIMIY URL (ngrok free domain)
# ----------------------------------------------------------------------------
# Frontend allaqachon Vercel'da (doimiy). Bu skript BACKEND (port 8000) uchun
# ngrok ning BEPUL static domainini sozlaydi (free hisob 1 ta doimiy subdomain
# beradi - aynan bizga kerak bo'lgan 1 ta URL):
#   1. ngrok authtoken saqlanadi
#   2. backend tunnel ishga tushadi va doimiy URL aniqlanadi
#   3. stable_urls.json yoziladi (enabled=true, provider=ngrok)
#   4. URL lar sinxronlanadi (.env.local, backend/.env, DB web_app_url)
#   5. Vercel env + production qayta deploy qilinadi (doimiy frontend endi
#      doimiy backendga ishora qiladi)
#   6. Backend restart (yangi ALLOWED_HOSTS/CORS kuchga kirishi uchun)
#
# Bitta manual qadam: https://dashboard.ngrok.com da bepul hisob ochib,
# authtoken olish (30 soniya). Keyin:
#   powershell -File backend\setup_ngrok_backend.ps1 -NgrokAuthtoken <TOKEN>
#
# Ishlashga tayyor holatda: start_all.ps1 / restart_tunnels.ps1 STABLE MODE
# orqali ngrok tunnelni avtomatik qayta ishga tushiradi (kompyuter restart'ida).
# NOTE: keep this file PURE ASCII (PowerShell 5.1).
# ----------------------------------------------------------------------------
param(
    [Parameter(Mandatory=$true)][string]$NgrokAuthtoken,
    [string]$NgrokDomain = ''   # ixtiyoriy: dashboard'dan tanlangan static domain
)

$ErrorActionPreference = 'Continue'
$root     = 'C:\Users\Mirjahon\Desktop\DONZO'
$logDir   = Join-Path $root '.freebuff'
$json     = Join-Path $root 'backend\stable_urls.json'
$vercelUrl = 'https://frontend-self-mu-1nb1d09n0h.vercel.app'
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$ngrok    = Join-Path $logDir 'ngrok.exe'

if (-not (Test-Path $ngrok)) {
    Write-Output "ERROR: $ngrok topilmadi - .freebuff papkasiga ngrok.exe qo'ying"
    exit 1
}

# ── 1. authtoken ──
& $ngrok config add-authtoken $NgrokAuthtoken 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Output 'ERROR: authtoken saqlash muvaffaqiyatsiz - token to''g''riligini tekshiring'
    exit 1
}
Write-Output 'authtoken saqlandi'

# ── 2. Doimiy backend URL aniqlash ──
$beUrl = ''
$tunnelArgs = @('http','8000')
if ($NgrokDomain) {
    $staticDomain = $NgrokDomain.TrimStart('https://').Trim()
    $beUrl = 'https://' + $staticDomain
    $tunnelArgs = @('http','8000','--url=' + $staticDomain)
    Write-Output "Domain berilgan: $beUrl"
} else {
    # ── static domain topish yoki yaratish (DOIMIY URL) ──
    $staticDomain = ''
    try {
        $out = (& $ngrok api domains list 2>&1 | Out-String)
        $parsed = $out | ConvertFrom-Json
        foreach ($d in $parsed.domains) {
            if ($d.domain -like '*.ngrok-free.app') { $staticDomain = $d.domain; break }
        }
    } catch { }
    if (-not $staticDomain) {
        try {
            $created = (& $ngrok api domains create --name='donzo-backend.ngrok-free.app' 2>&1 | Out-String)
            $co = $created | ConvertFrom-Json
            if ($co.domain) { $staticDomain = $co.domain }
        } catch { }
    }
    if ($staticDomain) {
        $beUrl = 'https://' + $staticDomain
        $tunnelArgs = @('http','8000','--url=' + $staticDomain)
        Write-Output "Static domain topildi/yaratildi: $beUrl"
    } else {
        Write-Output 'WARN: static domain topilmadi - ephemeral URL ishlatiladi (DOIMIY EMAS!)'
    }
}
# ── tunnel ishga tushirish ──
$errLog = Join-Path $logDir 'ngrok-backend-err.log'
$outLog = Join-Path $logDir 'ngrok-backend.log'
Remove-Item $errLog, $outLog -ErrorAction SilentlyContinue
Start-Process -FilePath $ngrok -ArgumentList $tunnelArgs `
    -RedirectStandardOutput $outLog -RedirectStandardError $errLog -WindowStyle Hidden | Out-Null
if ($beUrl) { Write-Output 'Tunnel ishga tushdi (4040 API dan URL tasdiqlanadi)...' }
for ($i = 0; $i -lt 25; $i++) {
    Start-Sleep -Seconds 2
    try {
        $api = Invoke-RestMethod -Uri 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 5 -ErrorAction Stop
        if ($api.tunnels -and @($api.tunnels).Count -gt 0) {
            $beUrl = $api.tunnels[0].public_url
            break
        }
    } catch { }
}
if (-not $beUrl) {
    Write-Output 'ERROR: ngrok URL topilmadi (4040 API javob bermadi). ngrok log:'
    Get-Content $errLog -Tail 6 -ErrorAction SilentlyContinue
    exit 1
}
$beUrl = $beUrl.TrimEnd('/')
$wsUrl = 'wss://' + ($beUrl -replace '^https://','') + '/ws'
Write-Output "Backend DOIMIY URL: $beUrl"
Write-Output "WS: $wsUrl"

# ── 3. stable_urls.json ──
$cfg = @{
    enabled = $true; provider = 'ngrok'
    frontend_url = $vercelUrl; backend_url = $beUrl
    backend_ws_url = $wsUrl
    updated_at = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
}
[System.IO.File]::WriteAllText($json, ($cfg | ConvertTo-Json), $utf8NoBom)
Write-Output 'stable_urls.json yozildi (ngrok-backend)'

# ── 4. URL sinxron (.env.local / backend.env / DB web_app_url) ──
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'backend\sync_stable_urls.ps1')
if ($LASTEXITCODE -ne 0) { Write-Output 'WARN: sync_stable_urls xatolik bilan tugadi'; exit 1 }

# ── 5. Vercel env + redeploy ──
$syncVercel = Join-Path $root 'backend\sync_vercel.ps1'
if (Test-Path $syncVercel) {
    Write-Output 'Vercel production sinxronlanmoqda (backend URL)...'
    & powershell -NoProfile -ExecutionPolicy Bypass -File $syncVercel -BackendUrl $beUrl
} else {
    Write-Output 'WARN: sync_vercel.ps1 topilmadi'
}

# ── 6. Backend restart (yangi ALLOWED_HOSTS/CORS) ──
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'backend\restart_backend.ps1')

Write-Output ''
Write-Output '=== TUGADI! Endi URL lar hech qachon o''zgarmaydi ==='
Write-Output "  Backend (API+WS): $beUrl"
Write-Output "  Frontend (Vercel): $vercelUrl"
Write-Output '  trycloudflare quick tunnel rejimi o''chirildi (stable mode)'
