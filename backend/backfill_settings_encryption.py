# -*- coding: utf-8 -*-
"""
One-off backfill: upgrade legacy PLAINTEXT secret settings (telegram_bot_token,
db_password, payment keys, SMTP password, django_secret_key) to Fernet-encrypted
at-rest values.

Run from the backend directory:
    venv/Scripts/python.exe backfill_settings_encryption.py

Idempotent — already-encrypted rows are skipped. Outputs how many rows were
upgraded. Never logs secret values.
"""
import os
import sys

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import django
django.setup()

from apps.settings_app.models import Setting, SECRET_SETTING_KEYS  # noqa: E402

if __name__ == '__main__':
    upgraded = Setting.backfill_encryption()
    # Report only which keys were upgraded, never their values.
    print(f"Encryption backfill done: {upgraded} secret setting(s) upgraded.")
    print("Keys covered:", ', '.join(sorted(SECRET_SETTING_KEYS)))
