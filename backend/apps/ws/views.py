"""
WebSocket views + health check + ops diagnostics.

`/health/` is public (uptime monitors). Everything under `/internal/diag/` is
protected by the DIAG_TOKEN env var: it is the eyes and hands of the
self-healing engine — it must never be reachable without the token.
"""
import hmac
import json
import os
import re
import time as _time
from datetime import datetime, timezone

from django.db import connection
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

DIAG_TOKEN_ENV = 'DIAG_TOKEN'
DIAG_HEADER = 'X-Diag-Token'

# Bot heartbeat freshness window (seconds). The bot refreshes its polling lock
# every ~30s; the user client writes its heartbeat every 30s too.
BOT_FRESH_SECONDS = 120
UC_FRESH_SECONDS = 180

# Secret settings — NEVER returned by value, only described (length / shape /
# whether they still decrypt with the current SETTINGS_ENCRYPTION_KEY).
_SECRET_KEYS = (
    'telegram_bot_token', 'telegram_bot_token_alt', 'health_report_bot_token',
    'telegram_api_hash', 'gemini_api_key', 'fragment_api_key',
    'user_client_session_b64', 'email_smtp_password', 'django_secret_key',
    'db_password', 'click_secret_key', 'payme_secret_key', 'uzum_secret_key',
)

# Non-secret operational settings exposed for visibility.
_DIAG_KEYS = (
    'web_app_url', 'telegram_bot_username', 'telegram_api_id', 'gemini_model',
    'security_ai_enabled', 'security_shadow_mode', 'security_fail_open',
    'staff_ai_enabled', 'staff_ai_angry_mode', 'marketing_group_enabled',
    'marketing_ad_prob',
    'marketing_rate_per_hour', 'marketing_ads_per_day',
    'marketing_daily_enabled', 'marketing_daily_time',
    'marketing_roast_enabled',
    'staff_group_chat_id', 'payment_monitor_chat_id', 'payment_report_chat_id',
    'payment_card_monitor_enabled', 'payment_card_number', 'payment_card_holder',
    'payment_suspicious_limit', 'payment_timeout_minutes',
    'payment_unique_offset_max', 'super_admin_telegram_id',
    'emergency_telegram_id', 'security_lockdown', 'maintenance_mode',
    'cloud_launcher_started_at',
)

# `/internal/diag/set/` may only write operational config — never DB/Django/
# payment-gateway credentials, never SMTP, never `debug`/`allowed_hosts`.
_WRITABLE_KEYS = frozenset({
    'web_app_url', 'telegram_bot_username', 'telegram_api_id', 'gemini_model',
    'gemini_api_key', 'security_ai_enabled', 'security_shadow_mode',
    'security_fail_open', 'staff_ai_enabled', 'staff_group_chat_id',
    'super_admin_telegram_id', 'emergency_telegram_id', 'maintenance_mode',
    'marketing_group_enabled', 'marketing_ad_prob', 'marketing_rate_per_hour',
    'marketing_ads_per_day',
    'marketing_daily_enabled', 'marketing_daily_time',
    'marketing_roast_enabled', 'marketing_roast_interval_min',
    'payment_monitor_chat_id', 'payment_report_chat_id', 'payment_card_number',
    'payment_card_holder', 'payment_card_monitor_enabled',
    'payment_suspicious_limit', 'payment_timeout_minutes',
    'payment_unique_offset_max',
    # The Telethon session belongs to the admin panel, but clearing it must be
    # possible from here too — a revoked session otherwise crash-loops the card
    # monitor (AuthKeyDuplicatedError) with no way to remove it.
    'user_client_session_b64',
    # AI tone switch (gentle/angry/strict) — same key staff_ai._get_ai_mode reads.
    'staff_ai_angry_mode',
})
_WRITABLE_PREFIXES = ('marketing_', 'payment_')


# ── Heartbeat parsing ───────────────────────────────────────────────────────

def _hb_age(raw):
    """Age of a heartbeat value in seconds, or None when absent/unparseable.

    Accepted formats (all three are written by different components):
      • '<unix_ts>'
      • '<owner>:<unix_ts>'          (bot polling lock)
      • ISO-8601 datetime            (user client)
    """
    if not raw:
        return None
    s = str(raw).strip()
    try:
        return _time.time() - float(s)
    except ValueError:
        pass
    if len(s) >= 10 and s[4] == '-':  # looks like an ISO date
        try:
            dtv = datetime.fromisoformat(s.replace('Z', '+00:00'))
            if dtv.tzinfo is None:
                dtv = dtv.replace(tzinfo=timezone.utc)
            return (datetime.now(timezone.utc) - dtv).total_seconds()
        except Exception:
            return None
    if ':' in s:
        try:
            return _time.time() - float(s.rsplit(':', 1)[-1])
        except ValueError:
            return None
    return None


def health_check(request):
    """Basic health check — DB ping + config status."""
    from apps.settings_app.models import Setting

    db_ok = False
    db_error = None
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            db_ok = True
    except Exception as exc:
        db_error = str(exc)[:200]

    bot_age = uc_age = None
    try:
        bot_age = _hb_age(Setting.get_setting('bot_polling_lock', ''))
        uc_age = _hb_age(Setting.get_setting('user_client_worker_heartbeat_at', ''))
    except Exception:
        pass
    bot_ok = bot_age is not None and bot_age < BOT_FRESH_SECONDS
    uc_ok = uc_age is not None and uc_age < UC_FRESH_SECONDS

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
        'bot_age_s': None if bot_age is None else int(bot_age),
        'user_client_age_s': None if uc_age is None else int(uc_age),
        'version': '1.0',
    })


def api_root(request):
    """Public API root — confirms the service is reachable."""
    return JsonResponse({
        'service': 'DONZO API',
        'version': 'v1',
        'status': 'running',
    })


def ws_metrics(request):
    """WebSocket metrics placeholder."""
    return JsonResponse({'metrics': 'not_implemented'})


# ── Ops diagnostics (token protected) ───────────────────────────────────────

def _diag_token():
    return (os.getenv(DIAG_TOKEN_ENV) or '').strip()


def _diag_authorized(request):
    expected = _diag_token()
    if not expected:
        return False
    given = (request.headers.get(DIAG_HEADER) or '').strip()
    if not given:
        return False
    return hmac.compare_digest(given, expected)


def _diag_denied():
    """404 (not 403) — an unauthenticated caller must not learn this exists."""
    return JsonResponse({'detail': 'Topilmadi'}, status=404)


def _describe_secret(value):
    """Describe a secret without leaking it."""
    s = str(value or '')
    if not s:
        return {'present': False}
    info = {
        'present': True,
        'len': len(s),
        'decryptable': not s.startswith('enc:'),
    }
    if s.startswith('enc:'):
        info['state'] = 'UNDECRYPTABLE (wrong SETTINGS_ENCRYPTION_KEY?)'
    elif re.match(r'^\d{6,12}:[A-Za-z0-9_-]{30,40}$', s):
        info['shape'] = 'telegram_bot_token'
    elif s.startswith('AIza'):
        info['shape'] = 'google_api_key'
    elif len(s) > 80:
        info['shape'] = 'long_blob'
    else:
        info['shape'] = 'opaque'
    return info


def _json_body(request):
    try:
        return json.loads(request.body.decode('utf-8') or '{}')
    except Exception:
        return {}


@csrf_exempt
def diag_state(request):
    """Read-only snapshot of config, heartbeats, service state and AI health."""
    if not _diag_authorized(request):
        return _diag_denied()

    from apps.settings_app.models import Setting

    def g(key, default=''):
        try:
            return Setting.get_setting(key, default)
        except Exception as exc:  # never let one bad row break diagnostics
            return f'<error {type(exc).__name__}>'

    bot_age = _hb_age(g('bot_polling_lock'))
    uc_age = _hb_age(g('user_client_worker_heartbeat_at'))

    services = {}
    try:
        for row in Setting.objects.filter(key__startswith='svc_state_'):
            try:
                services[row.key[len('svc_state_'):]] = json.loads(row.value or '{}')
            except Exception:
                services[row.key[len('svc_state_'):]] = {'raw': str(row.value)[:200]}
    except Exception as exc:
        services['error'] = f'{type(exc).__name__}: {exc}'

    counts = {}
    for label, ref in (
        ('settings', ('settings_app', 'Setting')),
        ('users', ('users', 'User')),
        ('services', ('services', 'Service')),
        ('categories', ('services', 'Category')),
        ('orders', ('orders', 'Order')),
    ):
        try:
            from django.apps import apps as dj_apps
            counts[label] = dj_apps.get_model(*ref).objects.count()
        except Exception as exc:
            counts[label] = f'error: {type(exc).__name__}'

    user_clients = []
    try:
        from apps.cardpay.models import UserClientAccount
        for acc in UserClientAccount.objects.all().order_by('slot'):
            age = None
            if acc.last_heartbeat:
                age = int((datetime.now(timezone.utc) - acc.last_heartbeat).total_seconds())
            user_clients.append({
                'slot': acc.slot, 'enabled': acc.enabled,
                'authorized': acc.authorized, 'username': acc.username,
                'heartbeat_age_s': age, 'last_error': acc.last_error,
                'restarts': acc.restarts,
            })
    except Exception as exc:
        user_clients = [{'error': f'{type(exc).__name__}: {exc}'}]

    # Marketing faolligi — guruhlarda DONZO haqiqatan yozayaptimi?
    marketing = {}
    try:
        from django.db.models import Sum
        from apps.settings_app.models import MarketingGroupStat
        rows = MarketingGroupStat.objects.all().order_by('-last_reply_at')[:20]
        now = datetime.now(timezone.utc)
        # Kunlik reklama limiti: guruh bugun nechta reklama ko'rgani (limit —
        # marketing_ads_per_day, default 2). Diagda ko'rinadi — limit ishlayaptimi
        # shu yerdan bir qarashda bilinadi.
        try:
            from apps.settings_app.models import Setting
            ads_per_day = int(Setting.get_setting('marketing_ads_per_day', '2') or '2')
        except Exception:
            ads_per_day = 2
        # Diqqat: bu modulda `timezone` — stdlib `datetime.timezone`
        # (`datetime.now(timezone.utc)` uchun), shuning uchun Django zonasini
        # alohida import qilamiz. Aks holda `timezone.localdate()` yiqiladi.
        from django.utils import timezone as _dj_timezone
        today = _dj_timezone.localdate()
        marketing['ads_per_day'] = ads_per_day
        marketing['groups'] = [
            {
                'chat_id': r.chat_id,
                'title': r.chat_title,
                'replies': r.replies_count,
                'ads': r.ads_count,
                'ads_today': (r.ads_today if r.ads_today_day == today else 0),
                'joins': r.joins_count,
                'last_reply_age_s': (int((now - r.last_reply_at).total_seconds())
                                     if r.last_reply_at else None),
            }
            for r in rows
        ]
        totals = MarketingGroupStat.objects.aggregate(
            replies=Sum('replies_count'), ads=Sum('ads_count'),
            joins=Sum('joins_count'))
        marketing['totals'] = {k: (v or 0) for k, v in totals.items()}
    except Exception as exc:
        marketing['error'] = f'{type(exc).__name__}: {exc}'

    ai = {}
    try:
        from apps.security import gemini_ai, staff_ai
        ai['staff_ai_is_enabled'] = staff_ai.is_enabled()
        ai['gemini_configured'] = gemini_ai.is_configured()
        if request.GET.get('ai'):
            ai['health'] = gemini_ai.health_check()
    except Exception as exc:
        ai['error'] = f'{type(exc).__name__}: {exc}'

    return JsonResponse({
        'env': {
            'DIAG_TOKEN': bool(_diag_token()),
            'WEB_APP_URL': os.getenv('WEB_APP_URL', ''),
            'TELEGRAM_BOT_TOKEN': bool(os.getenv('TELEGRAM_BOT_TOKEN')),
            'GEMINI_API_KEY': bool(os.getenv('GEMINI_API_KEY')),
            'SESSION_B64': bool(os.getenv('SESSION_B64')),
            'TELEGRAM_API_ID': bool(os.getenv('TELEGRAM_API_ID')),
            'TELEGRAM_API_HASH': bool(os.getenv('TELEGRAM_API_HASH')),
            'RENDER_GIT_COMMIT': os.getenv('RENDER_GIT_COMMIT', ''),
        },
        'db': {k: g(k) for k in _DIAG_KEYS},
        'secrets': {k: _describe_secret(g(k)) for k in _SECRET_KEYS},
        'heartbeats': {
            'bot_age_s': None if bot_age is None else int(bot_age),
            'bot_fresh': bot_age is not None and bot_age < BOT_FRESH_SECONDS,
            'user_client_age_s': None if uc_age is None else int(uc_age),
            'user_client_fresh': uc_age is not None and uc_age < UC_FRESH_SECONDS,
        },
        'services': services,
        'marketing': marketing,
        'ai': ai,
        'counts': counts,
        'user_clients': user_clients,
    })


@csrf_exempt
def diag_sync_urls(request):
    """Force the DB Web App URL / bot username to the env values.

    The bot reads `web_app_url` from the DB on every message, so a stale row
    keeps sending users to the wrong Web App. Env is the source of truth.
    """
    if not _diag_authorized(request):
        return _diag_denied()

    from apps.settings_app.models import Setting

    applied, skipped = {}, {}
    for key, env_name in (('web_app_url', 'WEB_APP_URL'),
                          ('telegram_bot_username', 'TELEGRAM_BOT_USERNAME')):
        val = (os.getenv(env_name) or '').strip().rstrip('/')
        if not val:
            skipped[key] = f'{env_name} env var yo\'q'
            continue
        if key == 'web_app_url' and not val.startswith('https://'):
            skipped[key] = 'WEB_APP_URL https:// bilan boshlanmadi'
            continue
        before = Setting.get_setting(key, '')
        if str(before or '').rstrip('/') != val:
            Setting.set_setting(key, val, description='env-synced (diag)')
            applied[key] = {'from': str(before or ''), 'to': val}
        else:
            skipped[key] = 'allaqachon to\'g\'ri'
    Setting.clear_cache()
    return JsonResponse({'applied': applied, 'skipped': skipped,
                         'web_app_url': Setting.get_setting('web_app_url', '')})


@csrf_exempt
def diag_set(request):
    """Write a small allowlist of operational settings (JSON body)."""
    if not _diag_authorized(request):
        return _diag_denied()

    from apps.settings_app.models import Setting

    body = _json_body(request)
    if not isinstance(body, dict):
        return JsonResponse({'error': 'JSON object kutilgan'}, status=400)

    applied, rejected = {}, {}
    for key, value in body.items():
        if key not in _WRITABLE_KEYS and not str(key).startswith(_WRITABLE_PREFIXES):
            rejected[key] = 'ruxsat etilmagan kalit'
            continue
        Setting.set_setting(key, '' if value is None else str(value),
                            description='diag update')
        applied[key] = 'yozildi'
    Setting.clear_cache()
    return JsonResponse({'applied': applied, 'rejected': rejected})


@csrf_exempt
def diag_fix_sequences(request):
    """Re-align every id sequence with its table's MAX(id).

    The SQLite→Neon restore inserted rows with EXPLICIT ids, which leaves each
    PostgreSQL sequence at its old value. The next INSERT then reuses an id that
    already exists and dies with
    `duplicate key value violates unique constraint "<table>_pkey"` — that is
    why creating a user, an order, a session or a settings row returned a 500.
    """
    if not _diag_authorized(request):
        return _diag_denied()

    from django.db import connection

    try:
        tables = sorted(connection.introspection.table_names())
    except Exception as exc:
        return JsonResponse(
            {'error': f'introspection: {type(exc).__name__}: {exc}'}, status=500)

    report, fixed, skipped = {}, 0, 0
    for tbl in tables:
        try:
            with connection.cursor() as cur:
                cur.execute("SELECT pg_get_serial_sequence(%s, 'id')", [f'"{tbl}"'])
                row = cur.fetchone()
                seq = row[0] if row else None
                if not seq:
                    skipped += 1
                    continue
                cur.execute(f'SELECT COALESCE(MAX("id"), 0) FROM "{tbl}"')
                mx = int(cur.fetchone()[0] or 0)
                cur.execute(f'SELECT last_value FROM {seq}')
                last = int(cur.fetchone()[0])
                # setval(..., mx, true) → next id = mx + 1
                if mx > 0:
                    cur.execute('SELECT setval(%s, %s, true)', [seq, mx])
                else:
                    cur.execute('SELECT setval(%s, 1, false)', [seq])
            report[tbl] = {'max_id': mx, 'seq_last': last,
                           'drift': mx - last, 'fixed': True}
            fixed += 1
        except Exception as exc:
            # One odd table must never abort the whole repair.
            report[tbl] = {'error': f'{type(exc).__name__}: {str(exc)[:120]}'}
    return JsonResponse({'tables': len(tables), 'fixed': fixed,
                         'skipped_no_sequence': skipped, 'report': report})


@csrf_exempt
def diag_group_access(request):
    """Marketing guruhlarda DONZO yoza oladimi / hamma xabarni ko'radimi.

    Admin huquqi SHART EMAS: bot oddiy a'zo bo'lib ham yozadi. Tekshiruv
    "Send Messages" huquqi va privacy mode (can_read_all_group_messages) ni
    aniqlaydi va har bir guruh uchun tayyor tavsiya qaytaradi.
    """
    if not _diag_authorized(request):
        return _diag_denied()

    from apps.settings_app.group_access import check_all_groups
    try:
        # warn=<bo'sh emas> → muammoli guruhlar uchun adminni ham ogohlantiradi
        reports = check_all_groups(warn=bool(request.GET.get('warn')))
    except Exception as exc:
        return JsonResponse({'error': f'{type(exc).__name__}: {exc}'}, status=500)

    return JsonResponse({
        'ok': sum(1 for r in reports if r.get('ok')),
        'problem': sum(1 for r in reports if not r.get('ok')),
        'cannot_read_all': sum(1 for r in reports
                               if r.get('can_read_all') is False and not r.get('is_admin')),
        'groups': reports,
    })


@csrf_exempt
def diag_migrate(request):
    """Run pending Django migrations (was public — now token protected)."""
    if not _diag_authorized(request):
        return _diag_denied()

    import subprocess
    import sys
    from pathlib import Path
    base = Path(__file__).resolve().parent.parent.parent
    try:
        result = subprocess.run(
            [sys.executable, 'manage.py', 'migrate', '--noinput'],
            cwd=str(base), capture_output=True, text=True, timeout=180
        )
        return JsonResponse({
            'status': 'ok' if result.returncode == 0 else 'error',
            'stdout': (result.stdout or '')[-1500:],
            'stderr': (result.stderr or '')[-1500:],
        })
    except Exception as exc:
        return JsonResponse({'error': str(exc)[:300]}, status=500)
