from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response

from apps.users.permissions import IsAdmin
from .metrics import metrics


@api_view(['GET'])
@permission_classes([AllowAny])
def api_root(request):
    """
    GET /

    Friendly root endpoint. Visiting the backend host (especially through a
    public tunnel) should return a clean JSON index instead of Django's raw
    404 page. Never leaks secrets — just names and links.
    """
    from django.conf import settings

    # Behind a public tunnel (cloudflared) the scheme arrives in the
    # X-Forwarded-Proto header, but SECURE_PROXY_SSL_HEADER is only set when
    # DEBUG=False — so honour the header manually here, otherwise the JSON
    # links would advertise http:// for an https:// tunnel. Some proxies send
    # comma-separated values ("https,http") — take the first, trimmed.
    scheme = request.META.get('HTTP_X_FORWARDED_PROTO', request.scheme).split(',')[0].strip() or request.scheme
    base = f'{scheme}://{request.get_host()}'

    links = {
        'health': f'{base}/health/',
        'api': f'{base}/api/v1/',
    }
    if settings.DEBUG:
        links['swagger'] = f'{base}/swagger/'
        links['redoc'] = f'{base}/redoc/'

    return Response({
        'name': 'DONZO API',
        'version': '1.0',
        'message': "DONZO - o'yinlar va raqamli xizmatlarga top-up platformasi API'si",
        'links': links,
    })


@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    """
    GET /health/

    Public health-check for uptime monitors (bot, frontend, external
    probes). Returns database status, backend time, and whether the
    minimum required configuration (Telegram bot token + web app URL) is
    present. NEVER exposes secrets — only booleans.
    """
    from django.db import connection
    from django.utils import timezone

    # IMPORTANT: when the DB is down, ensure_connection() raises AND any
    # subsequent DB read would raise too — so config lookups MUST stay inside
    # the same try/except, otherwise we'd return 500 instead of the intended 503.
    db_ok = True
    bot_token = False
    web_app_url = False
    try:
        connection.ensure_connection()
        from apps.settings_app.models import Setting
        bot_token = bool(Setting.get_setting('telegram_bot_token', ''))
        web_app_url = bool(Setting.get_setting('web_app_url', ''))
    except Exception as exc:
        db_ok = False
        db_error = str(exc)[:200]  # debug — temp, remove after fix

    payload = {
        'status': 'ok' if db_ok else 'error',
        'database': 'ok' if db_ok else 'error',
        'db_error': db_error if not db_ok else None,  # debug — temp
        'time': timezone.now().isoformat(),
        'config': {
            'telegram_bot_configured': bot_token,
            'web_app_configured': web_app_url,
            'ready': db_ok and bot_token and web_app_url,
        },
        'version': '1.0',
    }
    status_code = 200 if db_ok else 503
    return Response(payload, status=status_code)



@api_view(['GET'])
@permission_classes([AllowAny])
def full_status(request):
    """
    GET /health/full/

    Public diagnostic — shows bot and user client heartbeat status
    from the database (no secrets exposed).
    """
    import time as _time
    result = {'services': {}}
    try:
        from django.db import connection
        connection.ensure_connection()
        result['database'] = 'ok'
    except Exception:
        result['database'] = 'error'
        return Response(result, status=503)

    try:
        from apps.settings_app.models import Setting
        # Bot polling lock — fresh = bot running
        lock = Setting.get_setting('bot_polling_lock', '')
        if lock and ':' in str(lock):
            owner, ts = str(lock).split(':', 1)
            age = int(_time.time() - float(ts))
            result['services']['bot'] = {
                'status': 'ok' if age < 120 else 'down',
                'detail': f'lock {age}s ago (owner: {owner[:20]}...)'
            }
        else:
            result['services']['bot'] = {'status': 'down', 'detail': 'no lock'}
        # User client heartbeat
        uc_hb = Setting.get_setting('user_client_worker_heartbeat_at', '')
        if uc_hb:
            from django.utils import timezone
            from datetime import datetime as _dt
            dt = _dt.fromisoformat(uc_hb.replace('Z', '+00:00'))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            age = int((timezone.now() - dt).total_seconds())
            result['services']['user_client'] = {
                'status': 'ok' if age < 180 else 'down',
                'detail': f'heartbeat {age}s ago'
            }
        else:
            result['services']['user_client'] = {'status': 'down', 'detail': 'no heartbeat'}
        # Cloud launcher started
        cl_started = Setting.get_setting('cloud_launcher_started_at', '')
        result['services']['cloud_launcher'] = {'status': 'ok', 'detail': f'started: {cl_started}'}
    except Exception as exc:
        result['error'] = str(exc)[:200]

    return Response(result, status=200 if result.get('database') == 'ok' else 503)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsAdmin])
def ws_metrics(request):
    """
    Return real-time WebSocket metrics:
    - active_connections: number of currently connected WS clients
    - events_per_minute: events in the last 60 seconds
    - total_events: all-time event count since server start
    - latest_event_type: type of the most recent event
    - latest_event_timestamp: unix timestamp of the most recent event
    """
    snapshot = metrics.get_snapshot()

    # Format the latest timestamp for human readability
    latest_ts = snapshot.get('latest_event_timestamp')
    if latest_ts:
        from datetime import datetime
        snapshot['latest_event_time'] = datetime.fromtimestamp(
            latest_ts
        ).strftime('%H:%M:%S')
    else:
        snapshot['latest_event_time'] = '—'

    return Response(snapshot)
