"""Vercel deploy so'nggi sozlamalarni sinxronlash:

1. DB: cors_allowed_origins  -> Vercel origin qo'shiladi
2. DB: web_app_url           -> doimiy Vercel frontend URL
3. .env: CORS_ALLOWED_ORIGINS va WEB_APP_URL qatorlari yangilanadi

Skript IDEMPOTENT — qayta ishga tushirsa ham xavfsiz.
"""
import os
import re
from pathlib import Path

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

from apps.settings_app.models import Setting

VERCEL_URL = 'https://frontend-self-mu-1nb1d09n0h.vercel.app'

# ── 1. CORS — mavjud ro'yxatni saqlab, Vercel origin qo'shish ──
current = Setting.get_setting('cors_allowed_origins', '')
origins = [o.strip() for o in current.split(',') if o.strip()]
if VERCEL_URL not in origins:
    origins.append(VERCEL_URL)
Setting.set_setting('cors_allowed_origins', ','.join(origins),
                    description="Frontend ruxsat etilgan origin'lar (CORS)")

# ── 2. web_app_url — doimiy Vercel frontend ──
Setting.set_setting('web_app_url', VERCEL_URL,
                    description="Telegram bot Web App ochadigan doimiy URL")

Setting.clear_cache()

# ── 3. .env faylini yangilash (faqat ushbu 2 kalit) ──
BASE_DIR = Path(__file__).resolve().parent
env_path = BASE_DIR / '.env'
lines = []
if env_path.exists():
    lines = env_path.read_text(encoding='utf-8').splitlines()

def set_env_line(lines, key, value):
    out = []
    found = False
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith('#'):
            out.append(line)
            continue
        if stripped.startswith(f'{key}='):
            out.append(f'{key}={value}')
            found = True
            continue
        out.append(line)
    if not found:
        if out and out[-1].strip():
            out.append('')
        out.append(f'{key}={value}')
    return out

lines = set_env_line(lines, 'CORS_ALLOWED_ORIGINS', ','.join(origins))
lines = set_env_line(lines, 'WEB_APP_URL', VERCEL_URL)
env_path.write_text('\n'.join(lines) + '\n', encoding='utf-8')

print('✅ DB: cors_allowed_origins =', ','.join(origins))
print('✅ DB: web_app_url =', VERCEL_URL)
print('✅ .env yangilandi (CORS_ALLOWED_ORIGINS, WEB_APP_URL)')
print('⚠️  Backendni qayta ishga tushiring: restart_backend.ps1')
