"""
WebSocket views + health check.
"""
from django.db import connection
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt


def health_check(request):
    """Basic health check — DB ping + config status."""
    import time as _time
    from apps.settings_app.models import Setting

    db_ok = False
    db_error = None
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            db_ok = True
    except Exception as exc:
        db_error = str(exc)[:200]

    import time as _time_mod
    try:
        bot_hb = Setting.get_setting('bot_polling_lock', '')
        bot_ok = bool(bot_hb)
        if bot_hb:
            raw = str(bot_hb)
            # Format: '<owner>:<unix_ts>' or '<unix_ts>' or ISO datetime
            ts_raw = raw.split(':', 1)[1] if ':' in raw else raw
            try:
                lt = float(ts_raw)
                bot_ok = (_time_mod.time() - lt) < 120
            except ValueError:
                from datetime import datetime, timezone
                hb_time = datetime.fromisoformat(raw.replace('Z', '+00:00'))
                bot_ok = (datetime.now(timezone.utc) - hb_time).total_seconds() < 120
        uc_hb = Setting.get_setting('user_client_worker_heartbeat_at', '')
        uc_ok = bool(uc_hb)
        if uc_hb:
            raw_uc = str(uc_hb)
            ts_uc = raw_uc.split(':', 1)[1] if ':' in raw_uc else raw_uc
            try:
                lt_uc = float(ts_uc)
                uc_ok = (_time_mod.time() - lt_uc) < 180
            except ValueError:
                from datetime import datetime, timezone
                uc_time = datetime.fromisoformat(raw_uc.replace('Z', '+00:00'))
                uc_ok = (datetime.now(timezone.utc) - uc_time).total_seconds() < 180
    except Exception:
        bot_ok = False
        uc_ok = False

    return JsonResponse({
        'status': 'ok' if db_ok else 'error',
        'database': 'ok' if db_ok else 'error',
        'db_error': db_error,
        'config': {
            'telegram_bot_configured': bool(Setting.get_setting('telegram_bot_token', '')),
            'web_app_configured': bool(Setting.get_setting('web_app_url', '')),
            'ready': db_ok,
        },
        'bot': 'ok' if bot_ok else 'stale',
        'user_client': 'ok' if uc_ok else 'stale',
        'version': '1.0',
    })


def api_root(request):
    """Public API root — confirms the service is reachable."""
    return JsonResponse({
        'service': 'DONZO API',
        'version': 'v1',
        'status': 'running',
    })


def run_migrations(request):
    """Run pending Django migrations (temporary — for fresh Neon DB)."""
    import subprocess
    import sys
    from pathlib import Path
    base = Path(__file__).resolve().parent.parent.parent
    try:
        result = subprocess.run(
            [sys.executable, 'manage.py', 'migrate', '--noinput'],
            cwd=str(base), capture_output=True, text=True, timeout=120
        )
        return JsonResponse({
            'status': 'ok' if result.returncode == 0 else 'error',
            'stdout': result.stdout[-1000:] if result.stdout else '',
            'stderr': result.stderr[-1000:] if result.stderr else '',
        })
    except Exception as exc:
        return JsonResponse({'error': str(exc)[:300]}, status=500)



