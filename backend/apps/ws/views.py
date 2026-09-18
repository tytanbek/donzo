"""
WebSocket views + temporary import endpoint for SQLite → PostgreSQL migration.
"""
import json
import os
import sqlite3
import tempfile

from django.db import connection
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods


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

    try:
        bot_hb = Setting.get_setting('bot_polling_lock', '')
        bot_ok = bool(bot_hb)
        if bot_hb:
            from datetime import datetime, timezone
            hb_time = datetime.fromisoformat(bot_hb.replace('Z', '+00:00'))
            bot_ok = (datetime.now(timezone.utc) - hb_time).total_seconds() < 120
        uc_hb = Setting.get_setting('user_client_worker_heartbeat_at', '')
        uc_ok = bool(uc_hb)
        if uc_hb:
            from datetime import datetime, timezone
            uc_time = datetime.fromisoformat(uc_hb.replace('Z', '+00:00'))
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


def ws_metrics(request):
    """WebSocket metrics placeholder."""
    return JsonResponse({'metrics': 'not_implemented'})


@csrf_exempt
@require_http_methods(["POST"])
def import_sqlite_backup(request):
    """TEMPORARY: Import data from an uploaded SQLite backup into PostgreSQL.

    POST with multipart file upload field 'backup'.
    Returns import statistics per table.
    """
    uploaded = request.FILES.get('backup')
    if not uploaded:
        return JsonResponse({'error': 'No file uploaded. Use field name: backup'}, status=400)

    # Save to temp file
    tmp_path = tempfile.mktemp(suffix='.sqlite3')
    try:
        with open(tmp_path, 'wb') as f:
            for chunk in uploaded.chunks():
                f.write(chunk)

        # Open SQLite backup
        sqlite_conn = sqlite3.connect(tmp_path)
        sqlite_conn.row_factory = sqlite3.Row
        cursor = sqlite_conn.cursor()

        # Get all tables — import in dependency order (users first)
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        all_tables = [row['name'] for row in cursor.fetchall()]
        # Priority order: independent tables first, then dependent
        priority = ['users', 'settings', 'categories', 'services', 'service_fields',
                     'packages', 'orders', 'payments', 'balance_transactions',
                     'promo_codes', 'banners', 'card_payment_messages',
                     'audit_logs', 'notifications', 'token_blacklist_outstandingtoken',
                     'token_blacklist_blacklistedtoken']
        tables = [t for t in priority if t in all_tables]
        tables += [t for t in all_tables if t not in tables]

        results = {}
        imported = 0
        skipped = 0

        with connection.cursor() as pg_cursor:
            # Disable ALL FK constraints on ALL tables
            pg_cursor.execute("""
                SELECT conrelid::regclass::text AS table_name,
                       conname AS constraint_name
                FROM pg_constraint
                WHERE contype = 'f'
            """)
            fk_constraints = pg_cursor.fetchall()
            disabled_fks = []
            for tbl, con in fk_constraints:
                try:
                    pg_cursor.execute(f'ALTER TABLE "{tbl}" DROP CONSTRAINT IF EXISTS "{con}"')
                    disabled_fks.append((tbl, con))
                except Exception:
                    pass

            # Find NOT NULL columns with no default — these will cause failures
            # if SQLite backup has NULL. We skip them during INSERT.
            skip_notnull = {}  # table -> set of columns to skip
            try:
                pg_cursor.execute("""
                    SELECT table_name, column_name, data_type
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND is_nullable = 'NO'
                      AND column_default IS NULL
                """)
                for tbl, col, dtype in pg_cursor.fetchall():
                    if tbl not in skip_notnull:
                        skip_notnull[tbl] = set()
                    # Skip auto-managed fields
                    if col in ('id',):
                        continue
                    skip_notnull[tbl].add(col)
            except Exception:
                pass

            for table in tables:
                try:
                    cursor.execute(f'SELECT COUNT(*) as cnt FROM "{table}"')
                    count = cursor.fetchone()['cnt']

                    if count == 0:
                        results[table] = {'rows': 0, 'imported': 0, 'status': 'empty'}
                        continue

                    # Get column names
                    cursor.execute(f'PRAGMA table_info("{table}")')
                    columns = [row['name'] for row in cursor.fetchall()]

                    if not columns:
                        results[table] = {'rows': count, 'imported': 0, 'status': 'no_columns'}
                        continue

                    # Check if table exists in PostgreSQL
                    pg_cursor.execute(
                        "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = %s)",
                        [table]
                    )
                    pg_exists = pg_cursor.fetchone()[0]

                    if not pg_exists:
                        results[table] = {'rows': count, 'imported': 0, 'status': 'table_missing_in_pg'}
                        skipped += count
                        continue

                    # Check PG table columns
                    pg_cursor.execute(
                        "SELECT column_name FROM information_schema.columns WHERE table_name = %s",
                        [table]
                    )
                    pg_columns = {row[0] for row in pg_cursor.fetchall()}
                    common_cols = [c for c in columns if c in pg_columns]
                    # Remove NOT NULL columns without defaults to avoid insert failures
                    to_skip = skip_notnull.get(table, set())
                    common_cols = [c for c in common_cols if c not in to_skip]

                    if not common_cols:
                        results[table] = {'rows': count, 'imported': 0, 'status': 'no_common_columns'}
                        skipped += count
                        continue

                    # Get PG column types for boolean conversion
                    pg_cursor.execute(
                        "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = %s",
                        [table]
                    )
                    pg_types = {row[0]: row[1] for row in pg_cursor.fetchall()}
                    boolean_cols = {c for c in common_cols if pg_types.get(c) == 'boolean'}

                    # Fetch all rows
                    cursor.execute(f'SELECT {", ".join(f"\"{c}\"" for c in common_cols)} FROM "{table}"')
                    rows = cursor.fetchall()

                    inserted = 0
                    errors_log = []
                    for row in rows:
                        values = []
                        for col in common_cols:
                            v = row[col]
                            # Convert SQLite integer booleans to Python booleans for PG
                            if col in boolean_cols and isinstance(v, int):
                                v = bool(v)
                            values.append(v)
                        placeholders = ', '.join(['%s'] * len(common_cols))
                        cols_str = ', '.join(f'"{c}"' for c in common_cols)
                        try:
                            pg_cursor.execute(
                                f'INSERT INTO "{table}" ({cols_str}) VALUES ({placeholders}) ON CONFLICT DO NOTHING',
                                values
                            )
                            inserted += 1
                        except Exception as e:
                            # Retry: fill NULLs with type-appropriate defaults
                            if 'not-null' in str(e).lower() or 'type' in str(e).lower():
                                fixed_values = []
                                for i, col in enumerate(common_cols):
                                    v = values[i]
                                    pg_t = pg_types.get(col, '')
                                    if v is None or (col in boolean_cols and not isinstance(v, bool)):
                                        if pg_t == 'boolean':
                                            v = False
                                        elif pg_t in ('integer', 'bigint', 'smallint'):
                                            v = 0
                                        elif pg_t in ('double precision', 'real', 'numeric'):
                                            v = 0.0
                                        elif 'timestamp' in pg_t or 'date' in pg_t:
                                            from datetime import datetime, timezone
                                            v = datetime(2000, 1, 1, tzinfo=timezone.utc)
                                        elif 'char' in pg_t or pg_t == 'text' or 'text' in pg_t:
                                            v = ''
                                        else:
                                            v = None  # let DB decide
                                    fixed_values.append(v)
                                try:
                                    pg_cursor.execute(
                                        f'INSERT INTO "{table}" ({cols_str}) VALUES ({placeholders}) ON CONFLICT DO NOTHING',
                                        fixed_values
                                    )
                                    inserted += 1
                                except Exception as e2:
                                    if len(errors_log) < 3:
                                        errors_log.append(f'{type(e2).__name__}: {str(e2)[:120]}')
                            else:
                                if len(errors_log) < 3:
                                    errors_log.append(f'{type(e).__name__}: {str(e)[:120]}')

                    results[table] = {'rows': count, 'imported': inserted, 'status': 'ok'}
                    if errors_log:
                        results[table]['errors'] = errors_log
                    imported += inserted

                except Exception as exc:
                    results[table] = {'error': str(exc)[:200], 'status': 'error'}

        sqlite_conn.close()

        # Re-enable FK constraints
        try:
            with connection.cursor() as pg_cursor:
                for tbl, con in disabled_fks:
                    try:
                        pg_cursor.execute(f'ALTER TABLE "{tbl}" ADD CONSTRAINT "{con}" NOT VALID')
                    except Exception:
                        pass
        except Exception:
            pass

        return JsonResponse({
            'status': 'completed',
            'tables': tables,
            'results': results,
            'total_imported': imported,
            'total_skipped': skipped,
        })

    except Exception as exc:
        return JsonResponse({'error': str(exc)[:500]}, status=500)
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
