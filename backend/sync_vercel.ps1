# sync_vercel.ps1 - DONZO frontendni Vercel'ga sinxronlash (self-healing)
# ----------------------------------------------------------------------------
# Vercel'dagi doimiy frontend (https://frontend-self-mu-1nb1d09n0h.vercel.app)
# NEXT_PUBLIC_API_URL / NEXT_PUBLIC_WS_URL ni BUILD vaqtida yopishtiradi.
# Backend trycloudflare tunnel URL'i har restartda o'zgaradi, shuning uchun:
#   1. Joriy BACKEND_URL o'qiladi (param yoki .freebuff\tunnel-urls.txt);
#   2. Vercel production env'lar yangilanadi (NEXT_PUBLIC_API_URL, WS_URL);
#   3. Vercel production qayta deploy qilinadi -> doimiy URL har doim jonli
#      backendga ishora qiladi.
#
# restart_tunnels.ps1 va self_heal_tunnel.ps1 buni tunnel o'zgarganda chaqiradi.
# Log: .freebuff\vercel-sync.log
# ----------------------------------------------------------------------------
param(
    [string]$BackendUrl = ''
)

$ErrorActionPreference = 'Continue'
$root = 'C:\Users\Mirjahon\Desktop\DONZO'
# node/npm PATH'ga qo'shiladi (npx to'g'ridan-to'g'ri chaqirilishi uchun)
$nodeDir = 'C:\Users\Mirjahon\AppData\Local\Programs\nodejs\node-v24.19.0-win-x64'
if (Test-Path (Join-Path $nodeDir 'npx.cmd')) { $env:PATH = "$nodeDir;$env:PATH" }
$frontendDir = Join-Path $root 'frontend'
$logDir = Join-Path $root '.freebuff'
$log = Join-Path $logDir 'vercel-sync.log'

function Log([string]$msg) {
    $line = '[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] ' + $msg
    Add-Content -Path $log -Value $line -Encoding UTF8
    Write-Output $line
}

# ── 1. Backend URL'ni aniqlash ──
if (-not $BackendUrl) {
    $urlsFile = Join-Path $logDir 'tunnel-urls.txt'
    if (Test-Path $urlsFile) {
        Get-Content $urlsFile | ForEach-Object {
            if ($_ -match '^BACKEND_URL=(.+)$') { $BackendUrl = $Matches[1].Trim() }
        }
    }
}
if (-not $BackendUrl) { Log 'ERROR: BACKEND_URL aniqlanmadi - Vercel sync o''tkazilmadi'; exit 1 }
if ($BackendUrl -notmatch '^https://') { Log "ERROR: BACKEND_URL noto'g'ri: $BackendUrl"; exit 1 }

$apiUrl = $BackendUrl.TrimEnd('/') + '/api/v1'
$wsUrl  = 'wss://' + ($BackendUrl -replace '^https://', '') + '/ws'
Log "Sync boshlandi: backend=$BackendUrl"

# ── 2. Env'larni yangilash (eski qiymatni olib tashlab, yangisini qo'shish) ──
Push-Location $frontendDir
try {
    & npx --yes vercel env rm NEXT_PUBLIC_API_URL production --yes 2>$null | Out-Null
    & npx --yes vercel env rm NEXT_PUBLIC_WS_URL production --yes 2>$null | Out-Null
    $apiUrl | & npx --yes vercel env add NEXT_PUBLIC_API_URL production --yes 2>$null | Out-Null
    $wsUrl  | & npx --yes vercel env add NEXT_PUBLIC_WS_URL production --yes 2>$null | Out-Null
    Log "env yangilandi: NEXT_PUBLIC_API_URL=$apiUrl"
    Log "env yangilandi: NEXT_PUBLIC_WS_URL=$wsUrl"
} catch {
    Log ("env yangilashda xatolik: " + $_.Exception.Message)
    Pop-Location
    exit 1
}

# ── 3. Production deploy (doimiy URL'ga alias) ──
try {
    $deployOut = & npx --yes vercel deploy --prod --yes --scope tytanbeks-projects 2>&1
    $text = ($deployOut | Out-String)
    if ($text -match 'https://[a-z0-9-]+\.vercel\.app') {
        Log ("deploy: " + $Matches[0])
    } else {
        Log ("deploy javobida URL topilmadi (output: " + $text.Substring(0, [Math]::Min(300, $text.Length)) + ')')
    }
    Log 'Vercel sync yakunlandi (production qayta deploy qilindi)'
} catch {
    Log ("deploy xatolik: " + $_.Exception.Message)
    exit 1
} finally {
    Pop-Location
}
exit 0
