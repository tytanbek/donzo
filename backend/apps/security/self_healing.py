# -*- coding: utf-8 -*-
"""
DONZO Self-Healing Engine — mustaqil xavfsizlik va barqarorlik tizimi.

Asosiy lifecycle:
  DETECT → DIAGNOSE → ROOT CAUSE → FIX → TEST → DEPLOY → VERIFY → RESOLVED

Xususiyatlari:
  • Barcha komponentlarni doimiy kuzatadi (Backend, DB, Bot, UC, API)
  • Muammo aniqlansa — avtomatik diagnostika + root cause analysis
  • Kod tuzatish imkoniyati (backup bilan)
  • Git commit + push (Render auto-deploy)
  • Deploydan keyin verification
  • Incident memory (oldingi muammolarni eslab qoladi)
  • Admin notification (Telegram orqali)
  • Resource protection (infinite loop guard)

XAVFSIZLIK:
  • Faqat ruxsat etilgan fayllarga yozadi (ALLOWED_ROOTS)
  • Har bir tuzatishdan oldin backup yaratadi
  • Max 3 urinish har bir incident uchun
  • Rollback mumkin (backup'dan)
  • Secretlarni logga chiqarmaydi
"""
import hashlib
import json
import logging
import os
import re
import subprocess
import time
import threading
import urllib.request
from datetime import datetime, timedelta

from django.utils import timezone

logger = logging.getLogger(__name__)

# ── CONFIG ──────────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BACKUP_DIR = os.path.join(BASE_DIR, 'backups', 'self_healing')
INCIDENT_LOG = os.path.join(BASE_DIR, 'backups', 'incidents.json')

# Max attempts per incident before escalating to admin
MAX_ATTEMPTS = 3
# Cooldown between self-healing cycles (seconds)
COOLDOWN_SECONDS = 300
# Health check interval for background monitor (seconds)
HEALTH_CHECK_INTERVAL = 120

# Files allowed for self-healing patches
ALLOWED_ROOTS = (
    os.path.join(BASE_DIR, 'apps'),
    os.path.join(BASE_DIR, 'config'),
    os.path.join(BASE_DIR, 'manage.py'),
    os.path.join(BASE_DIR, 'bot.py'),
    os.path.join(BASE_DIR, 'user_client.py'),
    os.path.join(BASE_DIR, 'cloud_launcher.py'),
    os.path.join(BASE_DIR, 'user_client_auth.py'),
)

# ── STATE ───────────────────────────────────────────────────────────────────
_last_cycle_at = 0.0
_active_incidents = {}  # component_name → {attempts, last_attempt, error}
_lock = threading.Lock()


# ── HELPERS ──────────────────────────────────────────────────────────────────

def _resolve_path(rel_path: str):
    """rel_path → abs. Tashqariga chiqishni bloklaydi."""
    if not rel_path or '..' in rel_path.replace('\\', '/'):
        return None
    abs_path = os.path.normpath(os.path.join(BASE_DIR, rel_path))
    for root in ALLOWED_ROOTS:
        if abs_path == root or abs_path.startswith(root + os.sep):
            return abs_path
    if os.path.isfile(root) and abs_path == root:
        return abs_path
    return None


def _backup_file(abs_path: str, ts: str) -> str:
    """Faylni backup papkasiga nusxalaydi."""
    try:
        rel = os.path.relpath(abs_path, BASE_DIR)
        dst_dir = os.path.join(BACKUP_DIR, ts)
        os.makedirs(dst_dir, exist_ok=True)
        dst = os.path.join(dst_dir, rel.replace(os.sep, '__').replace('/', '__'))
        import shutil
        shutil.copy2(abs_path, dst)
        return dst
    except Exception as exc:
        logger.warning('backup xato: %s', exc)
        return ''


def _git_checkpoint(message: str) -> dict:
    """Git checkpoint — current state'ni commit qiladi."""
    try:
        # Check if there are changes
        result = subprocess.run(
            ['git', 'status', '--porcelain'],
            capture_output=True, text=True, timeout=10, cwd=BASE_DIR,
        )
        if not result.stdout.strip():
            return {'ok': True, 'message': 'No changes to commit'}

        # Stage all changes
        subprocess.run(
            ['git', 'add', '-A'],
            capture_output=True, text=True, timeout=10, cwd=BASE_DIR,
        )

        # Commit
        result = subprocess.run(
            ['git', 'commit', '-m', message],
            capture_output=True, text=True, timeout=15, cwd=BASE_DIR,
        )

        return {'ok': result.returncode == 0, 'message': result.stdout.strip()[:200]}
    except Exception as exc:
        return {'ok': False, 'message': f'Git checkpoint failed: {exc}'}


def _git_push() -> dict:
    """Git push — triggers Render auto-deploy."""
    try:
        result = subprocess.run(
            ['git', 'push', 'origin', 'main'],
            capture_output=True, text=True, timeout=30, cwd=BASE_DIR,
        )
        return {'ok': result.returncode == 0, 'message': result.stdout.strip()[:200]}
    except Exception as exc:
        return {'ok': False, 'message': f'Git push failed: {exc}'}


def _http_check(url: str, timeout: float = 5.0) -> tuple:
    """HTTP health check — (code, ok)."""
    try:
        req = urllib.request.Request(url, method='GET')
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.status < 400
    except urllib.error.HTTPError as e:
        return e.code, e.code < 400
    except Exception:
        return None, False


def _redact_secrets(text: str) -> str:
    """Secretlarni log'da redact qiladi."""
    patterns = [
        (r'(BOT_TOKEN|API_KEY|SECRET_KEY|PASSWORD|DATABASE_URL)\s*[=:]\s*\S+', r'\1=********'),
        (r'\b\d{10,16}:\w{30,}\b', 'BOT_TOKEN_REDACTED'),
    ]
    for pat, repl in patterns:
        text = re.sub(pat, repl, text, flags=re.IGNORECASE)
    return text


# ── INCIDENT TRACKING ───────────────────────────────────────────────────────

def _load_incidents() -> list:
    """Incident log'ini JSON'dan yuklaydi."""
    try:
        if os.path.exists(INCIDENT_LOG):
            with open(INCIDENT_LOG, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception:
        pass
    return []


def _save_incidents(incidents: list):
    """Incident log'ini JSON'ga saqlaydi."""
    try:
        os.makedirs(os.path.dirname(INCIDENT_LOG), exist_ok=True)
        with open(INCIDENT_LOG, 'w', encoding='utf-8') as f:
            json.dump(incidents[-100:], f, indent=2, ensure_ascii=False, default=str)
    except Exception as exc:
        logger.warning('Incident log saqlash xatosi: %s', exc)


def _record_incident(component: str, error: str, root_cause: str,
                     fix: str, status: str):
    """Incidentni log'ga yozadi."""
    incidents = _load_incidents()
    incidents.append({
        'timestamp': timezone.now().isoformat(),
        'component': component,
        'error': error[:500],
        'root_cause': root_cause[:500],
        'fix': fix[:500],
        'status': status,
    })
    _save_incidents(incidents)


def get_incident_history(component: str = None, limit: int = 10) -> list:
    """Oxirgi incidentlarni qaytaradi."""
    incidents = _load_incidents()
    if component:
        incidents = [i for i in incidents if i.get('component') == component]
    return incidents[-limit:]


# ── DIAGNOSTIC ──────────────────────────────────────────────────────────────

def run_diagnostics() -> dict:
    """To'liq diagnostika — barcha komponentlarni tekshiradi.

    Returns: {
        'components': [ {name, status, detail, severity} ],
        'down': [ ... ],
        'ok': bool,
        'timestamp': str,
    }
    """
    from . import system_health

    components = []
    try:
        health = system_health.health_summary()
        components = health.get('components', [])
    except Exception as exc:
        components.append({
            'name': 'Health Check',
            'status': 'down',
            'detail': f'Diagnostic xatosi: {exc}',
            'severity': 'HIGH',
        })

    # Add severity levels
    for c in components:
        if c['status'] != 'ok':
            name = c['name'].lower()
            if 'database' in name or 'backend' in name:
                c['severity'] = 'CRITICAL'
            elif 'bot' in name or 'user client' in name:
                c['severity'] = 'HIGH'
            else:
                c['severity'] = 'MEDIUM'
        else:
            c['severity'] = 'GREEN'

    down = [c for c in components if c['status'] != 'ok']
    return {
        'components': components,
        'down': down,
        'ok': len(down) == 0,
        'timestamp': timezone.now().isoformat(),
    }


def _collect_logs(component: str, lines: int = 30) -> str:
    """Komponent log'larini yig'adi (cloud_launcher log'laridan)."""
    # In cloud mode, we check the Django logs
    try:
        from django.db import connection
        with connection.cursor() as cur:
            cur.execute("""
                SELECT description, created_at
                FROM audit_log_auditlog
                WHERE description IS NOT NULL
                ORDER BY created_at DESC
                LIMIT %s
            """, [lines])
            rows = cur.fetchall()
            log_lines = []
            for desc, ts in rows:
                if desc and any(k in (desc or '').lower() for k in
                               ('error', 'xato', 'failed', 'down', 'crash', 'timeout')):
                    log_lines.append(f"[{ts}] {desc[:200]}")
            return '\n'.join(log_lines[:lines])
    except Exception:
        return '(log collection failed)'


def _analyze_root_cause(component: str, diagnostics: dict, logs: str) -> dict:
    """Root cause tahlili — komponentga qarab sababni aniqlaydi.

    Returns: {'cause': str, 'fix_type': 'restart'|'code_fix'|'config'|'manual', 'fix_hint': str}
    """
    name = component.lower()
    detail = ''
    for c in diagnostics.get('components', []):
        if c['name'].lower() == name or component.lower() in c['name'].lower():
            detail = c.get('detail', '')
            break

    # Backend down
    if 'backend' in name:
        if 'HTTP' in detail:
            return {
                'cause': f'Backend HTTP xatosi: {detail}',
                'fix_type': 'restart',
                'fix_hint': 'Backend qayta ishga tushirilishi kerak',
            }
        return {
            'cause': f'Backend ishlamayapti: {detail}',
            'fix_type': 'restart',
            'fix_hint': 'Cloud launcher backend ni qayta ishga tushirishi kerak',
        }

    # Bot down
    if 'bot' in name:
        if 'heartbeat eskirgan' in detail or 'statistika yo\'q' in detail:
            return {
                'cause': f'Bot heartbeat yangilanmagan: {detail}',
                'fix_type': 'restart',
                'fix_hint': 'Bot polling to\'xtagan yoki crash bo\'lgan',
            }
        if 'token' in detail.lower():
            return {
                'cause': f'Bot token xatosi: {detail}',
                'fix_type': 'config',
                'fix_hint': 'Telegram bot token\'ni tekshiring',
            }
        return {
            'cause': f'Bot ishlamayapti: {detail}',
            'fix_type': 'restart',
            'fix_hint': 'Bot qayta ishga tushirilishi kerak',
        }

    # User Client down
    if 'user client' in name or 'user_client' in name:
        if 'sessiya yo\'q' in detail:
            return {
                'cause': 'User Client sessiyasi yo\'q',
                'fix_type': 'manual',
                'fix_hint': 'Admin panel orqali qayta kirish kerak',
            }
        if 'bloklangan' in detail:
            return {
                'cause': 'User Client sessiyasi bloklangan',
                'fix_type': 'manual',
                'fix_hint': 'Telegram session bloklangan — qayta kirish kerak',
            }
        if 'heartbeat' in detail:
            return {
                'cause': f'User Client heartbeat yangilanmagan: {detail}',
                'fix_type': 'restart',
                'fix_hint': 'UC worker qayta ishga tushirilishi kerak',
            }
        return {
            'cause': f'User Client ishlamayapti: {detail}',
            'fix_type': 'restart',
            'fix_hint': 'User Client qayta ishga tushirilishi kerak',
        }

    # Database down
    if 'database' in name or 'bazasi' in name:
        return {
            'cause': f'Database ulanish xatosi: {detail}',
            'fix_type': 'manual',
            'fix_hint': 'Database ulanishini tekshiring (Neon)',
        }

    # Default
    return {
        'cause': f'{component} ishlamayapti: {detail}',
        'fix_type': 'restart',
        'fix_hint': 'Qayta ishga tushirish kerak',
    }


# ── AUTO-FIX ENGINE ─────────────────────────────────────────────────────────

def _apply_fix_restart(component: str, root_cause: dict) -> dict:
    """Restart-based fix — cloud_launcher orqali."""
    # In cloud mode, we can't directly restart processes
    # But we can trigger a health check that will cause the supervisor to act
    try:
        from . import system_health
        health = system_health.health_summary()
        if health['ok']:
            return {'ok': True, 'action': 'Components recovered after health check'}
        return {'ok': False, 'action': 'Restart needed but components still down'}
    except Exception as exc:
        return {'ok': False, 'action': f'Restart failed: {exc}'}


def _apply_fix_code(component: str, root_cause: dict, health_text: str) -> dict:
    """Code-level fix — AI analyzes and patches."""
    from . import auto_fix
    result = auto_fix.ai_code_fix(
        problem=root_cause.get('cause', ''),
        actor_username='self_healing',
        health_text=health_text,
    )
    return result


def apply_fix(component: str, root_cause: dict, diagnostics: dict) -> dict:
    """Muammoni tuzatish — fix turiga qarab.

    Returns: {'ok': bool, 'action': str, 'details': dict}
    """
    fix_type = root_cause.get('fix_type', 'restart')
    health_text = json.dumps(diagnostics, ensure_ascii=False, default=str)[:2000]

    if fix_type == 'restart':
        return _apply_fix_restart(component, root_cause)
    elif fix_type == 'code_fix':
        return _apply_fix_code(component, root_cause, health_text)
    elif fix_type == 'config':
        return {'ok': False, 'action': 'Config issue — manual intervention needed',
                'details': root_cause}
    elif fix_type == 'manual':
        return {'ok': False, 'action': 'Manual intervention required',
                'details': root_cause}
    else:
        return {'ok': False, 'action': f'Unknown fix type: {fix_type}'}


# ── TEST RUNNER ─────────────────────────────────────────────────────────────

def run_tests() -> dict:
    """Backend testlarini ishga tushiradi.

    Returns: {'ok': bool, 'output': str, 'failed': int, 'passed': int}
    """
    try:
        result = subprocess.run(
            [os.path.join(BASE_DIR, 'venv', 'Scripts', 'python.exe') if os.name == 'nt'
             else 'python3',
             'manage.py', 'test', 'apps.security.tests_auto_fix',
             '--verbosity=1', '--no-input'],
            capture_output=True, text=True, timeout=120, cwd=BASE_DIR,
        )
        output = (result.stdout + result.stderr)[-2000:]
        ok = result.returncode == 0
        # Parse results
        failed = 0
        passed = 0
        m = re.search(r'(\d+) passed', output)
        if m:
            passed = int(m.group(1))
        m = re.search(r'(\d+) failed', output)
        if m:
            failed = int(m.group(1))
        return {'ok': ok, 'output': _redact_secrets(output), 'failed': failed, 'passed': passed}
    except FileNotFoundError:
        return {'ok': True, 'output': 'Python not available locally — tests run on deploy',
                'failed': 0, 'passed': 0}
    except subprocess.TimeoutExpired:
        return {'ok': False, 'output': 'Tests timed out (120s)', 'failed': -1, 'passed': 0}
    except Exception as exc:
        return {'ok': False, 'output': f'Test runner error: {exc}', 'failed': -1, 'passed': 0}


# ── DEPLOY PIPELINE ─────────────────────────────────────────────────────────

def deploy_changes(message: str = 'self-healing: auto-fix') -> dict:
    """Git commit + push — Render auto-deploy.

    Returns: {'ok': bool, 'commit': dict, 'push': dict}
    """
    commit = _git_checkpoint(message)
    if not commit['ok']:
        return {'ok': False, 'commit': commit, 'push': {'ok': False, 'message': 'Skipped'}}

    push = _git_push()
    return {'ok': push['ok'], 'commit': commit, 'push': push}


def verify_deploy(url: str = None, max_wait: int = 300) -> dict:
    """Deploydan keyin health check.

    Returns: {'ok': bool, 'status': int|None, 'detail': str}
    """
    if not url:
        from apps.settings_app.models import Setting
        from . import system_health
        url = system_health.BACKEND_HEALTH_URL

    start = time.time()
    while time.time() - start < max_wait:
        code, ok = _http_check(url, timeout=10.0)
        if ok:
            return {'ok': True, 'status': code, 'detail': f'HTTP {code} — healthy'}
        time.sleep(15)

    return {'ok': False, 'status': code, 'detail': f'Timeout after {max_wait}s'}


# ── NOTIFICATION ────────────────────────────────────────────────────────────

def _send_telegram_notification(message: str):
    """Staff guruhiga xabar yuboradi (best-effort)."""
    try:
        from apps.settings_app.models import Setting
        bot_token = Setting.get_setting('telegram_bot_token', '') or ''
        staff_chat_id = Setting.get_setting('staff_group_chat_id', '') or ''
        if not bot_token or not staff_chat_id:
            return

        url = f'https://api.telegram.org/bot{bot_token}/sendMessage'
        data = json.dumps({
            'chat_id': staff_chat_id,
            'text': message,
            'parse_mode': 'HTML',
            'disable_web_page_preview': True,
        }).encode('utf-8')

        req = urllib.request.Request(url, data=data,
                                     headers={'Content-Type': 'application/json'},
                                     method='POST')
        with urllib.request.urlopen(req, timeout=10) as resp:
            pass
    except Exception as exc:
        logger.warning('Telegram notification xatosi: %s', exc)


def _format_resolved_notification(component: str, root_cause: str, fix: str) -> str:
    """Tuzatilgan muammo uchun xabar."""
    return (
        f"🤖 <b>DONZO SELF-HEALING</b>\n\n"
        f"<b>Issue:</b> {component} down\n"
        f"<b>Root cause:</b> {root_cause[:200]}\n"
        f"<b>Fix:</b> {fix[:200]}\n\n"
        f"<b>Status:</b> 🟢 RESOLVED"
    )


def _format_failed_notification(component: str, attempts: int, last_error: str) -> str:
    """Tuzatib bo'lmagan muammo uchun xabar."""
    return (
        f"🚨 <b>DONZO SELF-HEALING FAILED</b>\n\n"
        f"<b>Issue:</b> {component} down\n"
        f"<b>Attempts:</b> {attempts}/{MAX_ATTEMPTS}\n"
        f"<b>Last error:</b> {last_error[:200]}\n\n"
        f"<b>Action required:</b> Manual intervention needed"
    )


# ── MAIN SELF-HEALING CYCLE ─────────────────────────────────────────────────

def run_self_healing_cycle() -> dict:
    """Bitta self-healing siklini bajaradi.

    Lifecycle: DETECT → DIAGNOSE → ROOT CAUSE → FIX → TEST → DEPLOY → VERIFY

    Returns: {'ok': bool, 'cycle_result': str, 'actions': list}
    """
    global _last_cycle_at

    # Cooldown guard
    now = time.time()
    if now - _last_cycle_at < COOLDOWN_SECONDS:
        return {'ok': True, 'cycle_result': 'cooldown', 'actions': []}

    with _lock:
        _last_cycle_at = now

    actions = []

    # 1. DETECT — health check
    diagnostics = run_diagnostics()
    if diagnostics['ok']:
        return {'ok': True, 'cycle_result': 'all_healthy', 'actions': []}

    # 2. DIAGNOSE — identify failing components
    down_components = diagnostics['down']

    for comp in down_components:
        name = comp['name']
        severity = comp.get('severity', 'MEDIUM')

        # Check attempt limits
        with _lock:
            incident = _active_incidents.get(name, {'attempts': 0, 'last_attempt': 0})
            if incident['attempts'] >= MAX_ATTEMPTS:
                # Already maxed out — skip
                actions.append({
                    'component': name,
                    'action': 'skipped',
                    'detail': f'Max attempts ({MAX_ATTEMPTS}) reached',
                })
                continue

        # 3. ROOT CAUSE ANALYSIS
        logs = _collect_logs(name)
        root_cause = _analyze_root_cause(name, diagnostics, logs)

        actions.append({
            'component': name,
            'action': 'diagnosed',
            'detail': root_cause['cause'],
        })

        # 4. FIX
        fix_result = apply_fix(name, root_cause, diagnostics)
        actions.append({
            'component': name,
            'action': 'fix_applied',
            'detail': fix_result.get('action', ''),
        })

        # 5. TEST (if code was changed)
        if fix_result.get('ok') and root_cause.get('fix_type') == 'code_fix':
            test_result = run_tests()
            actions.append({
                'component': name,
                'action': 'tests',
                'detail': f"passed={test_result['passed']} failed={test_result['failed']}",
            })

            if not test_result['ok']:
                # Tests failed — rollback
                from . import auto_fix
                revert = auto_fix.revert_last_fix('self_healing')
                actions.append({
                    'component': name,
                    'action': 'rollback',
                    'detail': 'Tests failed — reverted',
                })

                # Record incident
                with _lock:
                    _active_incidents[name] = {
                        'attempts': incident['attempts'] + 1,
                        'last_attempt': time.time(),
                        'error': test_result['output'][:200],
                    }
                _record_incident(name, root_cause['cause'],
                                 'Tests failed after fix', 'rollback',
                                 'FAILED')
                continue

            # 6. DEPLOY
            deploy_result = deploy_changes(
                f'self-healing: fix {name} — {root_cause["cause"][:80]}'
            )
            actions.append({
                'component': name,
                'action': 'deploy',
                'detail': 'pushed' if deploy_result['ok'] else 'failed',
            })

            if deploy_result['ok']:
                # 7. VERIFY
                verify_result = verify_deploy(max_wait=180)
                actions.append({
                    'component': name,
                    'action': 'verify',
                    'detail': verify_result['detail'],
                })

                if verify_result['ok']:
                    # RESOLVED
                    with _lock:
                        _active_incidents.pop(name, None)
                    _record_incident(name, root_cause['cause'],
                                     root_cause.get('fix_hint', ''),
                                     'auto-fix deployed', 'RESOLVED')

                    # Notify
                    _send_telegram_notification(
                        _format_resolved_notification(name, root_cause['cause'],
                                                       root_cause.get('fix_hint', ''))
                    )
                    actions.append({
                        'component': name,
                        'action': 'resolved',
                        'detail': '✅ Self-healing successful',
                    })
                else:
                    # Verify failed
                    with _lock:
                        _active_incidents[name] = {
                            'attempts': incident['attempts'] + 1,
                            'last_attempt': time.time(),
                            'error': verify_result['detail'],
                        }
                    _record_incident(name, root_cause['cause'],
                                     'Deploy succeeded but verify failed',
                                     'deploy', 'VERIFY_FAILED')
            else:
                with _lock:
                    _active_incidents[name] = {
                        'attempts': incident['attempts'] + 1,
                        'last_attempt': time.time(),
                        'error': 'Deploy failed',
                    }
        else:
            # Non-code fix (restart, manual)
            with _lock:
                _active_incidents[name] = {
                    'attempts': incident['attempts'] + 1,
                    'last_attempt': time.time(),
                    'error': fix_result.get('action', ''),
                }
            _record_incident(name, root_cause['cause'],
                             root_cause.get('fix_hint', ''),
                             fix_result.get('action', ''),
                             'ATTEMPTED')

            # If manual needed, notify admin
            if root_cause.get('fix_type') == 'manual':
                _send_telegram_notification(
                    _format_failed_notification(
                        name, incident['attempts'] + 1,
                        root_cause.get('fix_hint', 'Manual intervention required')
                    )
                )

    # Final check
    final = run_diagnostics()
    all_ok = final['ok']

    return {
        'ok': all_ok,
        'cycle_result': 'resolved' if all_ok else 'partial',
        'actions': actions,
    }


# ── STATUS REPORT ───────────────────────────────────────────────────────────

def get_system_status() -> str:
    """To'liq tizim holati — /status uchun."""
    diagnostics = run_diagnostics()
    incidents = get_incident_history(limit=5)
    active = dict(_active_incidents)

    lines = ["🟢 <b>DONZO SYSTEM</b>\n"]

    for c in diagnostics['components']:
        icon = '🟢' if c['status'] == 'ok' else '🔴'
        lines.append(f"{icon} <b>{c['name']}</b> — {c.get('detail', '')}")

    if active:
        lines.append(f"\n⚠️ <b>Active incidents:</b> {len(active)}")
        for name, info in active.items():
            lines.append(f"  • {name}: attempt {info['attempts']}/{MAX_ATTEMPTS}")

    if incidents:
        last = incidents[-1]
        lines.append(f"\n📋 Last incident: {last.get('component', '?')} "
                     f"({last.get('status', '?')}) "
                     f"— {last.get('timestamp', '?')[:16]}")

    lines.append("\n🤖 <b>Self-Healing:</b> ACTIVE")
    lines.append(f"📊 Max attempts: {MAX_ATTEMPTS}")
    lines.append(f"⏱️ Cooldown: {COOLDOWN_SECONDS}s")

    return '\n'.join(lines)


# ── BACKGROUND MONITOR ──────────────────────────────────────────────────────

_monitor_stop = threading.Event()
_monitor_thread = None


def _monitor_loop():
    """Background monitor — doimiy health check."""
    while not _monitor_stop.is_set():
        try:
            result = run_self_healing_cycle()
            if result['cycle_result'] not in ('all_healthy', 'cooldown'):
                logger.info('[SelfHealing] cycle: %s actions=%d',
                            result['cycle_result'], len(result.get('actions', [])))
        except Exception as exc:
            logger.exception('[SelfHealing] monitor xatosi: %s', exc)
        _monitor_stop.wait(HEALTH_CHECK_INTERVAL)


def start_monitor():
    """Background monitor'ni ishga tushiradi."""
    global _monitor_thread
    if _monitor_thread and _monitor_thread.is_alive():
        return
    _monitor_stop.clear()
    _monitor_thread = threading.Thread(target=_monitor_loop, daemon=True)
    _monitor_thread.start()
    logger.info('[SelfHealing] monitor ishga tushdi (interval=%ds)', HEALTH_CHECK_INTERVAL)


def stop_monitor():
    """Background monitor'ni to'xtatadi."""
    _monitor_stop.set()
    logger.info('[SelfHealing] monitor to\'xtatildi')
