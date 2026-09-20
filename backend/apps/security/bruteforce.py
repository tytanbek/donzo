"""
Brute-force protection middleware — login urinishlarini IP bo'yicha cheklaydi.

Qoplaydi:
  • API login endpointlari (initdata-login, fragment-login, login-code, demo)
  • Django admin login formasi (/admin/login/) — xato javob ham 200 bo'lgani
    uchun alohida hisoblanadi

Flow:
  1. So'rov login endpoint'iga keladi
  2. IP'da 20+ muvaffaqiyatsiz urinish (15 daqiqada) → 429, 15 daqiqa blok
  3. Muvaffaqiyatli kirishda hisoblagich tozalanadi

DIQQAT (cheklov): hisoblagich Django cache'ida (LocMemCache) saqlanadi —
bu bitta daphne process uchun to'g'ri ishlaydi (hozirgi deploy shunday).
Agar kelajakda bir nechta worker ishga tushsa, hisoblagichni umumiy
saqlash joyi (Redis yoki DB) ga ko'chirish shart — aks holda cheklov
worker'lar bo'ylab bo'linib ketadi.
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

# Django admin login form. MUHIM: admin login xatosi ham HTTP 200 qaytaradi
# (forma qayta chiziladi), shuning uchun bu yo'lda 200 = muvaffaqiyatsiz
# urinish deb hisoblanadi. Aks holda /admin/login/ ochiq brute-force
# maydoniga aylanib qolardi.
ADMIN_LOGIN_PREFIX = '/admin/login'


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
        is_admin_login = request.path.startswith(ADMIN_LOGIN_PREFIX)

        # Only protect login endpoints
        if not is_admin_login and not any(
            request.path.startswith(ep) for ep in PROTECTED_ENDPOINTS
        ):
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
                if is_admin_login:
                    from django.http import HttpResponse
                    return HttpResponse(
                        '<h1>429 — Juda ko\'p urinish</h1>'
                        '<p>15 daqiqadan keyin qayta urinib ko\'ring.</p>',
                        status=429,
                        content_type='text/html; charset=utf-8',
                    )
                return JsonResponse(
                    {'detail': "Juda ko'p urinish. 15 daqiqa kutib qayta urinib ko'ring."},
                    status=429
                )
        except Exception:
            pass  # Fail-open if cache fails
        
        # Process the request
        response = self.get_response(request)

        # Admin login: 200 = forma xato bilan qayta chizildi (muvaffaqiyatsiz),
        # 302 = muvaffaqiyatli kirish.
        if is_admin_login:
            failed = response.status_code == 200
            succeeded = response.status_code in (301, 302)
        else:
            failed = response.status_code in (400, 401, 403)
            succeeded = response.status_code == 200
        
        # If login failed (400, 401, 403), increment failure count
        if failed:
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
        
        # If login succeeded, clear failure count
        elif succeeded:
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
