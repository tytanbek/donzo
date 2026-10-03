#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DONZO cloud launcher — Render (yoki boshqa container) uchun.

Bitta konteynerda hamma narsani ishga tushiradi va nazorat qiladi:
  1. daphne        — Django API + WebSocket (web, $PORT da)
  2. bot.py        — Telegram bot (polling)
  3. user_client.py — karta monitori (Telethon)

Qo'shimcha:
  • Render free web service uxlab qolmasligi uchun har 5 daqiqada
    RENDER_EXTERNAL_URL/health/ ga ping yuboradi.
  • SESSION_B64 env'idan user_client sessiyasini tiklaydi (agar mavjud).
  • Kunlik audit hisobotini AUDIT_REPORT_HOUR (UTC, default 9) da yuboradi.
  • Kunlik KARTA LIMIT RESET hisobotini CARD_REPORT_HOUR (UTC, default 4 =
    09:00 Toshkent) dan keyin kuniga bir marta yuboradi (staff guruhiga).
  • Har bir jarayon yiqilsa backoff bilan avtomatik qayta ishga tushadi.

Ishlatish:  python cloud_launcher.py
"""
import base64
import datetime as dt
import json
import os
import signal
import subprocess
import sys
import threading
import time
import urllib.request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ── Ensure DB migrations are applied before starting any services ──
def _ensure_migrations():
    """Run migrate --noinput with retry (Neon DB wake-up may need time)."""
    for attempt in range(1, 6):
        try:
            print(f'[MIGRATE] Attempt {attempt}/5...', flush=True)
            result = subprocess.run(
                [sys.executable, 'manage.py', 'migrate', '--noinput'],
                cwd=BASE_DIR, capture_output=True, text=True, timeout=120
            )
            if result.returncode == 0:
                print('[MIGRATE] ✅ Success', flush=True)
                return True
            else:
                print(f'[MIGRATE] ❌ Exit {result.returncode}: {result.stderr[:300]}', flush=True)
        except Exception as exc:
            print(f'[MIGRATE] ❌ Exception: {exc}', flush=True)
        if attempt < 5:
            time.sleep(15)
    print('[MIGRATE] ⚠️ All 5 attempts failed — starting anyway', flush=True)
    return False

_ensure_migrations()
PORT = os.getenv('PORT', '8000')
PING_URL = (os.getenv('RENDER_EXTERNAL_URL') or 'https://donzo-backend-v8oz.onrender.com').rstrip('/')
PING_INTERVAL = int(os.getenv('PING_INTERVAL', '60'))  # 1 daqiqa — Render free tier 15 daqiqada o'chirmaydi
AUDIT_HOUR = int(os.getenv('AUDIT_REPORT_HOUR', '9'))
CARD_REPORT_HOUR = int(os.getenv('CARD_REPORT_HOUR', '4'))  # UTC — 09:00 Toshkent

_stop = threading.Event()

# ── Env → Settings DB sync ────────────────────────────────────────────────
# These keys are owned by the ENVIRONMENT, not by the DB. The SQLite→Postgres
# restore left `web_app_url` stale and the bot reads that row on EVERY message,
# so a stale value keeps sending users to the wrong Web App. Re-applying the
# sync periodically means the DB can never drift back to an old URL.
_ENV_SYNCED_SETTINGS = {
    'web_app_url': 'WEB_APP_URL',
    'telegram_bot_token': 'TELEGRAM_BOT_TOKEN',
    'telegram_bot_username': 'TELEGRAM_BOT_USERNAME',
    'gemini_api_key': 'GEMINI_API_KEY',
    # The SQLite→Neon restore carried rows encrypted with a key this
    # deployment no longer holds (undecryptable), so these are re-seeded from
    # the environment: without api_id/api_hash/session the Telethon card
    # monitor cannot start at all.
    'telegram_api_id': 'TELEGRAM_API_ID',
    'telegram_api_hash': 'TELEGRAM_API_HASH',
}

# Seeded from the environment ONLY while the DB row is empty. The Telethon
# session belongs to the admin panel (To'lov nazorati → User Client): an
# authoritative sync here would resurrect a stale/revoked session on the next
# restart and clobber a session the operator had just re-created.
_ENV_SEED_ONLY_SETTINGS = {
    'user_client_session_b64': 'SESSION_B64',
}

# ── Service state (remote diagnostics) ────────────────────────────────────
# Every supervised process publishes pid / exit code / last output lines into
# the Settings DB, so /internal/diag/ can show WHY a service is down without
# shell access to the container.
_SVC_TAIL = {}
_SVC_TAIL_LOCK = threading.Lock()
_SVC_TAIL_LINES = 25


def _svc_tail_push(name: str, text: str):
    with _SVC_TAIL_LOCK:
        buf = _SVC_TAIL.setdefault(name, [])
        buf.append(text)
        del buf[:-_SVC_TAIL_LINES]


def _svc_tail(name: str):
    with _SVC_TAIL_LOCK:
        return list(_SVC_TAIL.get(name, []))


def _svc_state(name: str, status: str, **extra):
    """Persist a service's live state for /internal/diag/. Never raises."""
    try:
        import django
        os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
        django.setup()
        from apps.settings_app.models import Setting
        payload = {
            'status': status,
            'at': dt.datetime.now(dt.timezone.utc).isoformat(),
            'tail': _svc_tail(name)[-12:],
        }
        payload.update(extra)
        Setting.set_setting(f'svc_state_{name.lower()}', json.dumps(payload))
    except Exception as exc:
        _log(name, f'state yozilmadi: {type(exc).__name__}: {str(exc)[:100]}')


def _sync_env_settings():
    """Push env values into the Settings DB when they differ. Never raises."""
    try:
        import django
        os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
        django.setup()
        from apps.settings_app.models import Setting
        for key, env_name in _ENV_SYNCED_SETTINGS.items():
            val = (os.getenv(env_name) or '').strip()
            if not val:
                continue
            if key == 'web_app_url':
                val = val.rstrip('/')
                if not val.startswith('https://'):
                    _log('ENVSYNC', f'{env_name} https:// emas - o\'tkazib yuborildi')
                    continue
            current = str(Setting.get_setting(key, '') or '').strip().rstrip('/')
            if current != val:
                Setting.set_setting(key, val, description=f'env-synced ({env_name})')
                Setting.clear_cache()
                if key in ('telegram_bot_token', 'gemini_api_key',
                           'user_client_session_b64', 'telegram_api_hash'):
                    _log('ENVSYNC', f'{key} -> env qiymati bilan yangilandi (qiymat yashirin)')
                else:
                    _log('ENVSYNC', f'{key}: {current!r} -> {val!r}')
        for key, env_name in _ENV_SEED_ONLY_SETTINGS.items():
            val = (os.getenv(env_name) or '').strip()
            if not val:
                continue
            if str(Setting.get_setting(key, '') or '').strip():
                continue  # haqiqiy sessiya bor — hech qachon ustidan yozmaymiz
            Setting.set_setting(key, val, description=f'seed from {env_name}')
            Setting.clear_cache()
            _log('ENVSYNC', f"{key} -> env dan seed qilindi (DB bo'sh edi)")
    except Exception as exc:
        _log('ENVSYNC', f'xato: {type(exc).__name__}: {str(exc)[:150]}')


def _env_sync_loop():
    """Startup sync + periodic re-apply (env is the source of truth)."""
    _sync_env_settings()
    while not _stop.is_set():
        if _stop.wait(300):
            return
        _sync_env_settings()


def _log(tag: str, msg: str):
    ts = dt.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f'[{ts}] [{tag}] {msg}', flush=True)


def _session_bootstrap():
    """Sessiyani tiklaydi: SESSION_B64 env yoki Neon DB'dagi
    'user_client_session_b64' sozlamasidan (cloud deploy uchun)."""
    b64 = os.getenv('SESSION_B64', '')
    if not b64:
        try:
            import django
            os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
            django.setup()
            from apps.settings_app.models import Setting
            b64 = Setting.get_setting('user_client_session_b64', '') or ''
            _log('SESSION', "sessiya Neon DB'dan o'qildi")
        except Exception as exc:
            _log('SESSION', f"DB sessiya o'qilmadi: {type(exc).__name__}: {str(exc)[:120]}")
            return
    if not b64:
        _log('SESSION', "sessiya topilmadi (env ham, DB ham bo'sh) — eski fayl o'chiriladi")
        try:
            stale = os.path.join(BASE_DIR, 'sessions', 'donzo_user.session')
            if os.path.exists(stale):
                os.remove(stale)
                _log('SESSION', "eski sessiya fayli o'chirildi")
        except Exception:
            pass
        return
    try:
        data = base64.b64decode(b64)
    except Exception as exc:
        _log('SESSION', f"SESSION_B64 dekodlash xatosi: {exc}")
        return
    sess_dir = os.path.join(BASE_DIR, 'sessions')
    sess_file = os.path.join(sess_dir, 'donzo_user.session')
    os.makedirs(sess_dir, exist_ok=True)
    tmp = sess_file + '.tmp'
    with open(tmp, 'wb') as f:
        f.write(data)
    os.replace(tmp, sess_file)
    _log('SESSION', f"Sessiya tiklandi ({len(data)} bayt) → sessions/donzo_user.session")


def _relay(name: str, proc: subprocess.Popen):
    """Child stdout/stderr ni prefiks bilan terminalga uzatadi."""
    def _pump(stream):
        try:
            for line in iter(stream.readline, b''):
                text = line.decode('utf-8', errors='replace').rstrip('\n')
                if text:
                    _svc_tail_push(name, text)
                    _log(name, text)
        except Exception:
            pass
    threading.Thread(target=_pump, args=(proc.stdout,), daemon=True).start()
    threading.Thread(target=_pump, args=(proc.stderr,), daemon=True).start()


# ── Hung-process watchdog ─────────────────────────────────────────────────
# `_supervise` acts on EXIT only, so a child that deadlocks stays alive with a
# stale heartbeat: the launcher keeps reporting "running" while the service
# answers nobody (the bot spent 41 hours in that state, 2026-09-28 → 09-30).
# The watchdog reads the heartbeat each service already writes and kills the
# process, so `_supervise` restarts it. The decision rule itself lives in
# apps/security/hang_watchdog.py (pure and covered by tests).
_PROCS = {}
_PROCS_LOCK = threading.Lock()

WATCHDOG_INTERVAL = int(os.getenv('WATCHDOG_INTERVAL', '60'))
BOT_HANG_SECONDS = int(os.getenv('BOT_HANG_SECONDS', '420'))
UC_HANG_SECONDS = int(os.getenv('UC_HANG_SECONDS', '900'))


def _register_proc(name: str, proc):
    with _PROCS_LOCK:
        _PROCS[name] = proc


def _unregister_proc(name: str, proc):
    with _PROCS_LOCK:
        if _PROCS.get(name) is proc:
            _PROCS.pop(name, None)


def _all_procs() -> list:
    with _PROCS_LOCK:
        return list(_PROCS.items())


def _heartbeat_age(name: str):
    """Age (s) of the heartbeat that belongs to `name`, or None if unknown."""
    try:
        import django
        os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
        django.setup()
        from apps.security.hang_watchdog import heartbeat_source

        kind, arg = heartbeat_source(name)
        if kind == 'setting':
            from apps.settings_app.models import Setting
            from apps.ws.views import _hb_age
            return _hb_age(Setting.get_setting(arg, ''))
        if kind == 'account':
            from django.utils import timezone
            from apps.cardpay.models import UserClientAccount
            row = (UserClientAccount.objects.filter(slot=arg)
                   .only('last_heartbeat').first())
            if row is None or row.last_heartbeat is None:
                return None
            return (timezone.now() - row.last_heartbeat).total_seconds()
    except Exception:
        return None  # DB hiccup — unknown liveness must never kill a process
    return None


def _hang_limit(name: str):
    """Seconds `name`'s heartbeat may stay silent before the owner is hung."""
    try:
        from apps.security.hang_watchdog import heartbeat_source
        kind, _arg = heartbeat_source(name)
    except Exception:
        return None
    if kind is None:
        return None  # daphne has no heartbeat — an exit is already handled
    return BOT_HANG_SECONDS if name.upper() == 'BOT' else UC_HANG_SECONDS


def _clear_uc_heartbeat(name: str):
    """O'lgan slot-1 worker'ning heartbeat'ini o'chiradi.

    `user_client_worker_heartbeat_at` ni faqat slot-1 worker yozadi (slot>=2
    o'z UserClientAccount.last_heartbeat'ini yangilaydi). Jarayon o'lganda
    kalitni bo'shatamiz: aks holda /health/, health report va admin panel
    o'lik workerni "yangi heartbeat" bilan tirik ko'rsatishda davom etadi.
    Boshqa USERCLIENT jarayoni hali tirik bo'lsa tegmaymiz.
    """
    if (name.upper().replace('USERCLIENT', '') or '1') != '1':
        return
    with _PROCS_LOCK:
        alive = [n for n, p in _PROCS.items()
                 if n.upper().startswith('USERCLIENT') and p.poll() is None]
    if alive:
        return
    try:
        import django
        os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
        django.setup()
        from apps.settings_app.models import Setting
        Setting.set_setting('user_client_worker_heartbeat_at', '')
        Setting.clear_cache()
    except Exception as exc:
        _log(name, f'heartbeat tozalanmadi: {type(exc).__name__}: {str(exc)[:120]}')


def _kill_hung(name: str, proc, age, limit: int):
    _svc_tail_push(
        name,
        f'WATCHDOG: heartbeat {int(age)}s > {limit}s — jarayon qotib qolgan, '
        'qayta ishga tushiriladi',
    )
    _log(name, f"WATCHDOG: heartbeat {int(age)}s (limit {limit}s) — "
               f"jarayon o'ldirilmoqda (pid={proc.pid})")
    try:
        proc.terminate()
        try:
            proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            proc.kill()
    except Exception as exc:
        _log(name, f"WATCHDOG: o'ldirish xatosi: {type(exc).__name__}: {str(exc)[:120]}")


def _watchdog_loop():
    """Qotib qolgan jarayonlarni o'ldiradi — `_supervise` qayta ko'taradi."""
    time.sleep(90)  # servislar birinchi heartbeat'ni yozib bo'lsin
    strikes = {}
    while not _stop.is_set():
        try:
            import django
            os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
            django.setup()
            from apps.security.hang_watchdog import evaluate

            for name, proc in _all_procs():
                limit = _hang_limit(name)
                if not limit or proc.poll() is not None:
                    continue  # chiqqan jarayonni `_supervise` o'zi ko'taradi
                age = _heartbeat_age(name)
                strikes[name], kill = evaluate(age, limit, strikes.get(name, 0))
                if kill:
                    strikes[name] = 0
                    _kill_hung(name, proc, age, limit)
            # Har siklda holatni DB'ga yozamiz: /internal/diag/ dan
            # "watchdog tirikmi va nechta strike yig'ilyapti?" ko'rinadi —
            # nazoratning o'zi ham jim yiqilib qolmasin.
            _svc_state('WATCHDOG', 'watching', interval_s=WATCHDOG_INTERVAL,
                       bot_limit_s=BOT_HANG_SECONDS, uc_limit_s=UC_HANG_SECONDS,
                       strikes={k: v for k, v in strikes.items() if v})
        except Exception as exc:
            _log('WATCHDOG', f"xato: {type(exc).__name__}: {str(exc)[:120]}")
        if _stop.wait(WATCHDOG_INTERVAL):
            return


def _spawn(cmd, name, cwd=BASE_DIR):
    try:
        proc = subprocess.Popen(
            cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        _relay(name, proc)
        return proc
    except Exception as exc:
        _log(name, f"ishga tushirilmadi: {exc}")
        return None


def _supervise(name, cmd):
    """Jarayonni backoff bilan abadiy nazorat qiladi."""
    backoff = 5
    is_userclient = name.upper().startswith('USERCLIENT')
    _slot_suffix = name.upper().replace('USERCLIENT', '') or '1'
    restart_flag = os.path.join(
        BASE_DIR, 'sessions',
        '.restart_requested' if _slot_suffix == '1' else f'.restart_requested_{_slot_suffix}',
    )
    restarts = 0
    while not _stop.is_set():
        if is_userclient and _slot_suffix == '1':
            try:
                _session_bootstrap()
            except Exception as exc:
                _log(name, f'sessiya bootstrap xatosi: {type(exc).__name__}: {str(exc)[:120]}')
        proc = _spawn(cmd, name)
        if proc is None:
            _svc_state(name, 'spawn_failed', restarts=restarts, backoff_s=backoff)
            _stop.wait(backoff)
            backoff = min(backoff * 2, 60)
            continue
        _t0 = time.time()
        restarts += 1
        _register_proc(name, proc)
        _log(name, f"started (pid={proc.pid})")
        _svc_state(name, 'running', pid=proc.pid, restarts=restarts)
        rc = proc.wait()
        _unregister_proc(name, proc)
        if _stop.is_set():
            _log(name, f"stopped (rc={rc}) — launcher yakunlanmoqda")
            _svc_state(name, 'stopped', rc=rc, restarts=restarts)
            return
        lived = time.time() - _t0
        _svc_state(name, 'exited' if rc == 0 else 'crashed', rc=rc,
                   lived_s=int(lived), restarts=restarts, backoff_s=backoff)
        if is_userclient:
            # Jarayon o'ldi — heartbeat ham "o'chishi" kerak. Aks holda
            # panel/health uni oxirgi start'dan qolgan yangi heartbeat bilan
            # "ochiq" ko'rsatib turadi ("bazida heartbeat ochib qolayapti").
            _clear_uc_heartbeat(name)
        if rc == 0:
            _log(name, f"chiqdi (rc=0) — {backoff}s keyin qayta ishga tushadi")
        else:
            _log(name, f"YIQILDI (rc={rc}) — {backoff}s keyin qayta ishga tushadi")
        if rc in (4, 5) and is_userclient:
            backoff = 300
        if is_userclient:
            # Backoff davomida heartbeat YOZILMAYDI: ishlamayotgan jarayonni
            # "tirik" ko'rsatish health report va /health/ ni chalg'itardi.
            # Holatni svc_state'ga yozamiz — monitoring "restart kutilmoqda"
            # ni shu yerdan o'qiydi (apps/settings_app/service_state.py).
            _svc_state(name, 'waiting_restart', rc=rc, restarts=restarts,
                       backoff_s=backoff)
            waited = 0
            while not _stop.is_set() and waited < backoff:
                if os.path.exists(restart_flag):
                    try:
                        os.remove(restart_flag)
                    except OSError:
                        pass
                    _log(name, f"qayta kirish flagi topildi — darhol restart (kutilgan {waited}s)")
                    backoff = 0
                    break
                _stop.wait(3)
                waited += 3
            if backoff == 0:
                continue
        _stop.wait(backoff)
        backoff = 5 if lived > 300 else min(backoff * 2, 60)


def _userclient_reconciler(supervised_slots: set):
    """Pick up UserClientAccount rows added AFTER startup (no redeploy needed).

    Every 90s: any enabled slot we are not already supervising gets its own
    supervise thread.
    """
    import django as _dj
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    while not _stop.is_set():
        if _stop.wait(90):
            return
        try:
            _dj.setup()
            from apps.cardpay.models import UserClientAccount
            enabled = list(UserClientAccount.objects.filter(enabled=True).values_list('slot', flat=True))
            for slot in enabled:
                key = str(slot)
                if key in supervised_slots:
                    continue
                supervised_slots.add(key)
                name = f'USERCLIENT{slot}'
                cmd = [sys.executable, 'user_client.py', '--slot', str(slot)]
                _log('MAIN', f'yangi user client slot {slot} — supervise ishga tushirilmoqda')
                threading.Thread(target=_supervise, args=(name, cmd), daemon=True).start()
        except Exception as exc:
            _log('MAIN', f'userclient reconciler xatosi: {type(exc).__name__}: {str(exc)[:120]}')


def _pinger():
    """Free web service'ni uyquga ketishdan saqlaydi (5 daqiqada ping)."""
    if not PING_URL:
        _log('PING', "RENDER_EXTERNAL_URL yo'q — ping o'chirilgan (lokal rejim)")
        return
    url = PING_URL + '/health/'
    while not _stop.is_set():
        try:
            with urllib.request.urlopen(url, timeout=15) as r:
                _log('PING', f"{r.status} ← {url}")
        except Exception as exc:
            _log('PING', f"xato: {type(exc).__name__}: {str(exc)[:120]}")
        _stop.wait(PING_INTERVAL)


def _direct_db_url():
    """Neon pooler URL'ini direct URL'ga aylantiradi."""
    url = os.getenv('DATABASE_URL', '')
    if '-pooler' in url:
        return url.replace('-pooler', '')
    return url


def _run_migrations():
    """Migratsiyani fon thread'da bajaradi — daphne'ni bloklamaydi."""
    try:
        env = dict(os.environ)
        direct = _direct_db_url()
        if direct:
            env['DATABASE_URL'] = direct
        _log('MIGRATE', 'migratsiya boshlanmoqda (direct ulanish)...')
        subprocess.run(
            [sys.executable, 'manage.py', 'migrate', '--noinput'],
            cwd=BASE_DIR, env=env, timeout=300,
        )
        _log('MIGRATE', 'migratsiya tugadi')
    except Exception as exc:
        _log('MIGRATE', f'migratsiya xatosi: {type(exc).__name__}: {str(exc)[:120]}')


def _daily_audit():
    """Kunlik audit hisobotini AUDIT_HOUR (UTC) da yuboradi."""
    while not _stop.is_set():
        now = dt.datetime.utcnow()
        target = now.replace(hour=AUDIT_HOUR, minute=0, second=0, microsecond=0)
        if target <= now:
            target += dt.timedelta(days=1)
        secs = (target - now).total_seconds()
        _log('AUDIT', f"keyingi hisobot: {target.isoformat()}Z ({int(secs)}s dan keyin)")
        if _stop.wait(secs):
            return
        try:
            _log('AUDIT', "hisobot yuborilmoqda...")
            subprocess.run(
                [sys.executable, 'daily_audit_report.py', '--force'],
                cwd=BASE_DIR, timeout=120,
            )
            _log('AUDIT', 'hisobot yuborildi')
        except Exception as exc:
            _log('AUDIT', f"hisobot xatosi: {type(exc).__name__}: {str(exc)[:150]}")


def _health_report_loop():
    """Har 15 daqiqada tizim holati hisobotini staff guruhiga yuboradi."""
    import os as _os
    _os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    interval = int(_os.getenv('HEALTH_REPORT_INTERVAL', '900'))
    time.sleep(45)  # daphne/DB tayyor bo'lishini kutamiz
    while not _stop.is_set():
        try:
            import django
            django.setup()
            from apps.cardpay import services as cardpay_services
            ok = cardpay_services.send_health_report()
            _log('HEALTH', f"holat hisoboti: {'yuborildi' if ok else 'yuborilmadi (chat/token tekshiring)'}")
        except Exception as exc:
            _log('HEALTH', f"holat hisoboti xatosi: {type(exc).__name__}: {str(exc)[:120]}")
        try:
            if dt.datetime.utcnow().hour >= CARD_REPORT_HOUR:
                import django
                django.setup()
                from apps.cardpay import services as cardpay_services
                ok2 = cardpay_services.send_daily_card_reset_report()
                _log('CARDS', f"kunlik limit reset hisoboti: {'yuborildi' if ok2 else 'allaqachon yuborilgan / yuborilmadi'}")
        except Exception as exc:
            _log('CARDS', f"limit reset hisoboti xatosi: {type(exc).__name__}: {str(exc)[:120]}")
        if _stop.wait(interval):
            return


def _birthday_check_loop():
    """Har kuni 00:05 da birthday check — tabriklar + 10% reward."""
    import os as _os
    _os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    while not _stop.is_set():
        now = dt.datetime.utcnow()
        target = now.replace(hour=0, minute=5, second=0, microsecond=0)
        if target <= now:
            target += dt.timedelta(days=1)
        secs = (target - now).total_seconds()
        _log('BIRTHDAY', f'keyingi tekshiruv: {target.isoformat()}Z ({int(secs)}s dan keyin)')
        if _stop.wait(secs):
            return
        try:
            import django
            django.setup()
            from apps.birthday.views import check_and_send_birthday_messages
            result = check_and_send_birthday_messages()
            _log('BIRTHDAY', f'natija: {result}')
        except Exception as exc:
            _log('BIRTHDAY', f'xato: {type(exc).__name__}: {str(exc)[:120]}')


def _self_healing_loop():
    """Self-healing engine — avtomatik diagnostika + tuzatish."""
    time.sleep(60)  # daphne/DB tayyor bo'lishini kutamiz
    while not _stop.is_set():
        try:
            import django as _hdj
            os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
            _hdj.setup()
            from apps.security.self_healing import run_self_healing_cycle
            result = run_self_healing_cycle()
            if result.get('cycle_result') not in ('all_healthy', 'cooldown', None):
                _log('HEAL', f"self-healing: {result['cycle_result']} actions={len(result.get('actions', []))}")
        except Exception as exc:
            _log('HEAL', f"self-healing xatosi: {type(exc).__name__}: {str(exc)[:120]}")
        if _stop.wait(120):  # har 2 daqiqada
            return


def main():
    _log('MAIN', f"DONZO cloud launcher — port {PORT}")
    _session_bootstrap()
    try:
        import django
        django.setup()
        from apps.settings_app.models import Setting
        Setting.set_setting('cloud_launcher_started_at',
                            dt.datetime.now(dt.timezone.utc).isoformat())
        _log('MAIN', 'boshlanish vaqti yozildi (health-report grace)')
        # ── Bootstrap env vars → Settings DB (fresh DB needs these) ──
        _env_settings = {
            'telegram_bot_token': os.getenv('TELEGRAM_BOT_TOKEN', ''),
            'telegram_bot_username': os.getenv('TELEGRAM_BOT_USERNAME', 'DONZOROBOT'),
            'web_app_url': os.getenv('WEB_APP_URL', 'https://frontend-self-mu-1nb1d09n0h.vercel.app'),
            'settings_encryption_key': os.getenv('SETTINGS_ENCRYPTION_KEY', ''),
        }
        for key, val in _env_settings.items():
            if val and not Setting.get_setting(key, ''):
                Setting.set_setting(key, val)
                _log('MAIN', f'settings DB: {key} env var dan yozildi')
    except Exception as exc:
        _log('MAIN', f"boshlanish vaqti yozilmadi: {type(exc).__name__}: {str(exc)[:120]}")

    procs = [
        ('DAPHNE', [sys.executable, '-m', 'daphne', '-b', '0.0.0.0',
                    '-p', PORT, 'config.asgi:application']),
        ('BOT', [sys.executable, 'bot.py']),
        ('USERCLIENT', [sys.executable, 'user_client.py']),
    ]

    try:
        import django as _dj
        os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
        _dj.setup()
        from apps.cardpay.models import UserClientAccount
        for _acc in UserClientAccount.objects.filter(enabled=True).order_by('slot'):
            procs.append((
                f'USERCLIENT{_acc.slot}',
                [sys.executable, 'user_client.py', '--slot', str(_acc.slot)],
            ))
            _log('MAIN', f'qo\'shimcha user client slot {_acc.slot} navbatga qo\'yildi')
    except Exception as exc:
        _log('MAIN', f"qo'shimcha user client'lar o'qilmadi: {type(exc).__name__}: {str(exc)[:120]}")

    _supervised_slots = set()
    threads = []
    for n, c in procs:
        if n.upper().startswith('USERCLIENT'):
            _supervised_slots.add(n.upper().replace('USERCLIENT', '') or '1')
        threads.append(threading.Thread(target=_supervise, args=(n, c), daemon=True))
    threads.append(threading.Thread(target=_pinger, daemon=True))
    threads.append(threading.Thread(target=_env_sync_loop, daemon=True))
    threads.append(threading.Thread(target=_daily_audit, daemon=True))
    threads.append(threading.Thread(target=_health_report_loop, daemon=True))
    threads.append(threading.Thread(target=_run_migrations, daemon=True))
    threads.append(threading.Thread(
        target=_userclient_reconciler, args=(_supervised_slots,), daemon=True))
    threads.append(threading.Thread(target=_self_healing_loop, daemon=True))
    threads.append(threading.Thread(target=_watchdog_loop, daemon=True))
    threads.append(threading.Thread(target=_birthday_check_loop, daemon=True))
    for t in threads:
        t.start()

    def _shutdown(signum, frame):
        _log('MAIN', f"signal {signum} — yakunlanmoqda")
        _stop.set()

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT, _shutdown)

    try:
        while not _stop.is_set():
            _stop.wait(1)
    except KeyboardInterrupt:
        _stop.set()
    _log('MAIN', "barcha jarayonlar to'xtatilmoqda")
    time.sleep(2)
    _log('MAIN', "chiqish")


if __name__ == '__main__':
    main()
