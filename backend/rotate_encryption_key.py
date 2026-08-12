# -*- coding: utf-8 -*-
"""
SETTINGS_ENCRYPTION_KEY rotatsiyasi.

Xavfsizlik: eski 'django-insecure-...' kaliti ma'lum bo'lishi mumkin (eski
backup fayllarida ochiq saqlangan). Yangi tasodifiy kalit generatsiya qilib,
DB'dagi BARCHA shifrlangan qiymatlarni eski kalit bilan ochib, yangi kalit
bilan qayta shifrlaymiz.

Ishlatish:
  1. Yangi kalit generatsiya qilish:  python -c "import secrets; print(secrets.token_urlsafe(50))"
  2. NEW_KEY=<yangi kalit> venv/Scripts/python.exe rotate_encryption_key.py
  3. Yangi kalitni .env va Render env'ga yozish (script qisman bajaradi)

DIQQAT: kalit noto'g'ri o'zgartirilsa, barcha shifrlangan qiymatlar
o'qib bo'lmaydigan bo'ladi. Script avval BACKUP yaratadi (plaintext),
keyin qayta shifrlaydi.
"""
import base64
import hashlib
import os
import sys

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import django
django.setup()

from cryptography.fernet import Fernet, InvalidToken  # noqa: E402
from apps.settings_app.models import Setting  # noqa: E402

OLD_KEY = os.getenv('OLD_ENCRYPTION_KEY') or os.getenv('SETTINGS_ENCRYPTION_KEY') or ''
NEW_KEY = os.getenv('NEW_ENCRYPTION_KEY', '')
if not NEW_KEY:
    print("XATO: NEW_ENCRYPTION_KEY env berilmagan.")
    sys.exit(1)
if not OLD_KEY:
    print("XATO: OLD_ENCRYPTION_KEY (yoki SETTINGS_ENCRYPTION_KEY) berilmagan.")
    sys.exit(1)


def _fernet(key: str):
    raw = key.encode('utf-8')
    k = base64.urlsafe_b64encode(hashlib.sha256(raw).digest())
    return Fernet(k)


old_f = _fernet(OLD_KEY)
new_f = _fernet(NEW_KEY)

rows = Setting.objects.filter(is_encrypted=True).exclude(value__isnull=True)
backup_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                           '.freebuff-rotate-backup.txt')
with open(backup_path, 'w', encoding='utf-8') as bf:
    for row in rows:
        val = row.value
        if not str(val).startswith('enc:'):
            continue
        try:
            plain = old_f.decrypt(str(val)[4:].encode('ascii')).decode('utf-8')
        except (InvalidToken, Exception):
            print(f"  [SKIP] {row.key} — eski kalit bilan ochilmadi (boshqa kalit?)")
            continue
        bf.write(f"{row.key}\t{plain}\n")
        new_val = 'enc:' + new_f.encrypt(plain.encode('utf-8')).decode('ascii')
        row.value = new_val
        row.save(update_fields=['value'])
        print(f"  [OK] {row.key} qayta shifrlandi")

print(f"\nBackup: {backup_path} ({rows.count()} qator)")
print("Keyingi qadam: NEW_ENCRYPTION_KEY ni .env va Render env'ga yozing, "
      "keyin backup faylni o'chiring.")
