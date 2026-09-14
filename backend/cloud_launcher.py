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
import os
import signal
import subprocess
import sys
import threading
import time
import urllib.request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PORT = os.getenv('PORT', '8000')
PING_URL = (os.getenv('RENDER_EXTERNAL_URL') or 'https://donzo-backend-v8oz.onrender.com').rstrip('/')
PING_INTERVAL = int(os.getenv('PING_INTERVAL', '60'))  # 1 daqiqa — Render free tier 15 daqiqada o'chirmaydi
AUDIT_HOUR = int(os.getenv('AUDIT_REPORT_HOUR', '9'))
CARD_REPORT_HOUR = int(os.getenv('CARD_REPORT_HOUR', '4'))  # UTC — 09:00 Toshkent

_stop = threading.Event()


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
                    _log(name, text)
        except Exception:
            pass
    threading.Thread(target=_pump, args=(proc.stdout,), daemon=True).start()
    threading.Thread(target=_pump, args=(proc.stderr,), daemon=True).start()


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
    while not _stop.is_set():
        if is_userclient and _slot_suffix == '1':
            try:
                _session_bootstrap()
            except Exception as exc:
                _log(name, f'sessiya bootstrap xatosi: {type(exc).__name__}: {str(exc)[:120]}')
        proc = _spawn(cmd, name)
        if proc is None:
            _stop.wait(backoff)
            backoff = min(backoff * 2, 60)
            continue
        _t0 = time.time()
        _log(name, f"started (pid={proc.pid})")
        rc = proc.wait()
        if _stop.is_set():
            _log(name, f"stopped (rc={rc}) — launcher yakunlanmoqda")
            return
        lived = time.time() - _t0
        if rc == 0:
            _log(name, f"chiqdi (rc=0) — {backoff}s keyin qayta ishga tushadi")
        else:
            _log(name, f"YIQILDI (rc={rc}) — {backoff}s keyin qayta ishga tushadi")
        if rc in (4, 5) and is_userclient:
            backoff = 300
        if is_userclient:
            waited = 0
            while not _stop.is_set() and waited < backoff:
                # Backoff davomida heartbeat yozamiz — health report
                # "heartbeat eskirgan" emas, "restart kutilmoqda" ko'rsatsin.
                try:
                    import django as _hb_dj
                    _hb_dj.setup()
                    from apps.settings_app.models import Setting
                    import datetime as _hb_dt
                    Setting.set_setting('user_client_worker_heartbeat_at',
                                        _hb_dt.datetime.now(_hb_dt.timezone.utc).isoformat())
                except Exception:
                    pass
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
    threads.append(threading.Thread(target=_daily_audit, daemon=True))
    threads.append(threading.Thread(target=_health_report_loop, daemon=True))
    threads.append(threading.Thread(target=_run_migrations, daemon=True))
    threads.append(threading.Thread(
        target=_userclient_reconciler, args=(_supervised_slots,), daemon=True))
    threads.append(threading.Thread(target=_self_healing_loop, daemon=True))
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
