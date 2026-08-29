# -*- coding: utf-8 -*-
"""Neon DB'dagi user_client_session_b64 sessiyasini haqiqiy Telethon bilan tekshiradi."""
import asyncio
import base64
import os
import sys
import tempfile

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

def main():
    import django
    django.setup()
    from apps.settings_app.models import Setting
    b64 = Setting.get_setting('user_client_session_b64', '') or ''
    print(f"Neon sessiya mavjud: {bool(b64)}, uzunligi: {len(b64)}")
    if not b64:
        return
    data = base64.b64decode(b64)
    print(f"Bayt: {len(data)}")
    # SQLite sifatida tekshiramiz
    import sqlite3
    fd, path = tempfile.mkstemp(suffix='.session')
    os.close(fd)
    try:
        with open(path, 'wb') as f:
            f.write(data)
        con = sqlite3.connect(path)
        try:
            rows = con.execute('SELECT * FROM sessions').fetchall()
            print(f"Session jadvalida {len(rows)} qator:")
            for r in rows:
                auth = r[3] if len(r) > 3 else b''
                print(f"  dc_id={r[0]} server={r[1]}:{r[2]} auth_key_len={len(auth) if auth else 0}")
            ents = con.execute('SELECT count(*) FROM entities').fetchone()[0]
            print(f"Entities: {ents}")
            vers = con.execute('SELECT * FROM version').fetchall() if con.execute("SELECT name FROM sqlite_master WHERE name='version'").fetchone() else []
            print(f"Version: {vers}")
        finally:
            con.close()
    finally:
        try:
            os.remove(path)
        except Exception:
            pass
    # Haqiqiy Telethon ulanishi
    api_id = (Setting.get_setting('telegram_api_id', '') or '').strip()
    api_hash = (Setting.get_setting('telegram_api_hash', '') or '').strip()
    print(f"API ID set: {bool(api_id)}, API HASH set: {bool(api_hash)}")
    if not api_id or not api_hash:
        print("API ID/HASH yo'q — Telethon tekshiruvi o'tkazib yuboriladi")
        return
    from telethon import TelegramClient
    fd2, sfile = tempfile.mkstemp(suffix='.session')
    os.close(fd2)
    try:
        with open(sfile, 'wb') as f:
            f.write(data)
        client = TelegramClient(sfile, int(api_id), api_hash)

        async def check():
            try:
                await client.connect()
                print("connect: OK")
                auth = await client.is_user_authorized()
                print(f"is_user_authorized: {auth}")
                if auth:
                    me = await client.get_me()
                    print(f"get_me: {me.username} / {me.first_name} / id={me.id}")
            except Exception as exc:
                print(f"XATO: {type(exc).__name__}: {str(exc)[:200]}")
            finally:
                await client.disconnect()

        asyncio.run(check())
    finally:
        try:
            os.remove(sfile)
        except Exception:
            pass

if __name__ == '__main__':
    main()
