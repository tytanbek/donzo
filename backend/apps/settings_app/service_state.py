# -*- coding: utf-8 -*-
"""
Supervisor service state — what does the launcher think about a service?

`cloud_launcher._svc_state()` writes one JSON row per supervised process into
`svc_state_<name>` (status, rc, restarts, backoff, last output lines). A
heartbeat answers "did some process write recently?" — but a crash-looping
worker writes a fresh heartbeat at every restart and then dies, so on its own
a heartbeat can keep a DEAD service looking ONLINE ("bazida heartbeat ochib
qolayapti"). Consumers read this state and treat a failure status as the
stronger signal.

Unknown/absent state → None. Callers must stay fail-open (a missing row must
never turn a healthy service into a red alert), the same rule the hang
watchdog follows for unreadable heartbeats.
"""
import json

# Statuses `_supervise` writes when its process is NOT running.
FAILURE_STATES = frozenset({'crashed', 'exited', 'waiting_restart', 'spawn_failed'})

_KEY_PREFIX = 'svc_state_'


def read_service_state(name):
    """Parsed `svc_state_<name>` row, or None when absent/unreadable."""
    try:
        from apps.settings_app.models import Setting
        raw = Setting.get_setting(f'{_KEY_PREFIX}{str(name).lower()}', '') or ''
        if not raw:
            return None
        state = json.loads(raw)
        return state if isinstance(state, dict) else None
    except Exception:
        return None


def failure_reason(name):
    """Short reason when the supervisor says `name` is down, else None.

    None also covers "state unreadable" — the caller then falls back to the
    heartbeat signals, exactly as before.
    """
    state = read_service_state(name)
    if not state or state.get('status') not in FAILURE_STATES:
        return None
    parts = [str(state.get('status'))]
    if state.get('rc') is not None:
        parts.append(f"rc={state['rc']}")
    if state.get('restarts'):
        parts.append(f"{state['restarts']} restart")
    if state.get('backoff_s'):
        parts.append(f"backoff={int(state['backoff_s'])}s")
    return ', '.join(parts)
