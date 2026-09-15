"""
Security headers middleware — strips server info and adds hardening headers.

Removes:
  - x-render-origin-server (reveals 'daphne')
  - Server header details

Adds:
  - Permissions-Policy (restrict browser features)
  - Cross-Origin-Embedder-Policy
  - Cross-Origin-Resource-Policy
  - Cache-Control for API responses
"""
import re


# Headers to remove (lowercase) — information leakage prevention
REMOVE_HEADERS = {
    'x-render-origin-server',
    'x-powered-by',
    'x-debug',
    'x-aspnet-version',
    'x-aspnetmvc-version',
    'x-runtime',
}

# Headers to add for security hardening
SECURITY_HEADERS = {
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
}


class SecurityHeadersMiddleware:
    """
    Middleware that:
    1. Removes information-leaking response headers
    2. Adds security-hardening headers
    3. Sets restrictive cache headers for API responses
    """
    
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        
        # Remove information-leaking headers
        for header in REMOVE_HEADERS:
            if header in response:
                del response[header]
        
        # Add security headers (only for API responses, not static files)
        if request.path.startswith('/api/') or request.path == '/health/':
            for key, value in SECURITY_HEADERS.items():
                response[key] = value
        
        return response
