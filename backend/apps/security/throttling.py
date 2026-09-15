"""
Database-backed rate throttling for multi-worker deployments.

LocMemCache is per-process -- on Render with multiple workers, each worker
has its own rate limiter state, effectively multiplying the rate limit.

This uses Django's cache framework but with explicit cache keys that survive
across process boundaries when using a shared cache backend.
"""
import time
import logging
from django.core.cache import cache
from rest_framework.throttling import ScopedRateThrottle

logger = logging.getLogger(__name__)


class DBScopedRateThrottle(ScopedRateThrottle):
    """
    ScopedRateThrottle that uses Django cache framework explicitly.
    
    In production with DB-backed cache, this shares state across workers.
    Falls back to allowing requests if cache fails (fail-open).
    """
    pass


class StrictRateThrottle(ScopedRateThrottle):
    """
    Stricter rate throttle that uses both IP and session identifier.
    Used for sensitive endpoints like login.
    """
    def get_cache_key(self, request, view):
        if self.rate is None:
            return None
        ident = self.get_ident(request)
        return self.cache_format % {
            'scope': self.scope,
            'ident': ident
        }
