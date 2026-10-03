# -*- coding: utf-8 -*-
"""
Hung-process watchdog policy — when is a "running" process actually dead?

`_supervise()` in cloud_launcher.py restarts a service only after its process
EXITS. A process whose event loop deadlocks — Telegram polling stuck on a
half-open socket, a blocking DB call that never times out — stays alive
forever while its heartbeat ages: `/health/` says "stale", the launcher still
says "running", and nothing brings the service back. The bot spent 41 hours
in exactly that state (2026-09-28 → 09-30): no replies, no ads, no recovery.

This module owns the decision rule (pure, so it is cheap to test); the
launcher owns the killing. The rule is deliberately conservative:

  • an unreadable heartbeat must never kill anything — a DB hiccup would
    otherwise restart every service at once, turning a slowdown into an
    outage;
  • one stale reading is not enough — the probe has to stay stale for
    `max_strikes` cycles in a row (≈ 3 extra minutes at the launcher's
    one-minute interval), which rides out deploy handovers and slow queries.
"""

# Consecutive stale probes before the process is killed.
DEFAULT_MAX_STRIKES = 3


# Service names are the ones `_supervise` registers in cloud_launcher.py.
def heartbeat_source(name):
    """Which heartbeat belongs to a supervised service?

    Returns (kind, arg):
      • ('setting', key) — a Settings row: the bot's polling lock and the
        slot-1 user-client worker both publish there;
      • ('account', slot) — slot >= 2 workers NEVER write the shared Settings
        key, they only refresh their own UserClientAccount.last_heartbeat, so
        watching the shared key for them would read another slot's liveness;
      • (None, None) — no heartbeat: daphne exits are already handled.
    """
    upper = (name or '').upper()
    if upper == 'BOT':
        return 'setting', 'bot_polling_lock'
    if upper.startswith('USERCLIENT'):
        suffix = upper[len('USERCLIENT'):] or '1'
        if suffix == '1':
            return 'setting', 'user_client_worker_heartbeat_at'
        try:
            return 'account', int(suffix)
        except ValueError:
            return None, None
    return None, None


def evaluate(age_s, limit_s, strikes, max_strikes=DEFAULT_MAX_STRIKES):
    """Fold one probe into the strike counter.

    age_s   — heartbeat age in seconds, or None when it cannot be read.
    limit_s — how old a heartbeat may get before the owner counts as hung.
    strikes — stale readings already seen in a row.

    Returns (strikes, kill):
      • unknown  → (0, False) — never kill on unknown state;
      • fresh    → (0, False) — a healthy probe clears the history;
      • stale    → keep counting; kill on the max_strikes-th in a row.
    """
    if age_s is None or age_s <= limit_s:
        return 0, False
    strikes += 1
    return strikes, strikes >= max_strikes
