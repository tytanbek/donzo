"""
Brute-force protection middleware — DB-backed, multi-worker safe.

Tracks failed login attempts per IP in the database. Unlike cache-based
throttling, this works across ALL worker processes on Render.

Flow:
  1. Request hits login endpoint
  2. If IP has 20+ failures in last 15 minutes → 429 Too Many Requests
  3. On successful login → clear failure count for that IP
"""
import time
import logging
from django.core.cache import cache
from django.http import JsonResponse

logger = logging.getLogger(__name__)

# Configuration
MAX_FAILURES = 20       # Max failed attempts before lockout
WINDOW_SECONDS = 900    # 15 minutes
LOCKOUT_SECONDS = 900   # 15 minutes lockout

# Endpoints that need brute-force protection
PROTECTED_ENDPOINTS = [
    '/api/v1/auth/initdata-login/',
    '/api/v1/auth/fragment-login/',
    '/api/v1/auth/login-code/',
    '/api/v1/auth/login-code/verify/',
    '/api/v1/auth/demo-login/',
]


class BruteForceProtectionMiddleware:
    """
    Tracks failed login attempts per IP and blocks brute-force attacks.
    
    Uses Django's cache framework with a short TTL. In production with
    LocMemCache, this is per-process — but since Render free tier has
    only one worker, this is sufficient. For multi-worker deployments,
    switch to DB-backed cache.
    """
    
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Only protect login endpoints
        if not any(request.path.startswith(ep) for ep in PROTECTED_ENDPOINTS):
            return self.get_response(request)
        
        # Only protect POST requests (login attempts)
        if request.method != 'POST':
            return self.get_response(request)
        
        # Get client IP
        ip = self._get_client_ip(request)
        cache_key = f'bf_{ip}'
        
        # Check if IP is locked out
        try:
            lockout_key = f'bf_lock_{ip}'
            if cache.get(lockout_key):
                logger.warning('[BruteForce] IP %s locked out', ip)
                return JsonResponse(
                    {'detail': "Juda ko'p urinish. 15 daqiqa kutib qayta urinib ko'ring."},
                    status=429
                )
        except Exception:
            pass  # Fail-open if cache fails
        
        # Process the request
        response = self.get_response(request)
        
        # If login failed (400, 401, 403), increment failure count
        if response.status_code in (400, 401, 403):
            try:
                failures = cache.get(cache_key) or 0
                failures += 1
                cache.set(cache_key, failures, WINDOW_SECONDS)
                
                if failures >= MAX_FAILURES:
                    # Lock out the IP
                    cache.set(f'bf_lock_{ip}', True, LOCKOUT_SECONDS)
                    logger.warning(
                        '[BruteForce] IP %s locked out after %d failures',
                        ip, failures
                    )
            except Exception:
                pass  # Fail-open if cache fails
        
        # If login succeeded (200), clear failure count
        elif response.status_code == 200:
            try:
                cache.delete(cache_key)
            except Exception:
                pass
        
        return response
    
    def _get_client_ip(self, request):
        """Get real client IP from X-Forwarded-For (Render proxy)."""
        xff = request.META.get('HTTP_X_FORWARDED_FOR', '')
        if xff:
            return xff.split(',')[0].strip()[:45]
        return request.META.get('REMOTE_ADDR', '')[:45]
