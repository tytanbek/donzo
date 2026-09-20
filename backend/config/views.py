"""
Loyiha darajasidagi xato handlerlari.

Maqsad: API hech qachon Django'ning HTML xato sahifasini (yoki debug
matnini) qaytarmasin. Ilgari kutilmagan xato 500 bo'lganda brauzer
`<!doctype html> ... Server Error (500)` sahifasini olardi — bu ham
professional emas, ham tashqi ko'rinishga ortiqcha ma'lumot beradi.

Endi har qanday ushlanmagan xato toza JSON bo'lib qaytadi va serverda
to'liq traceback log'ga yoziladi (foydalanuvchiga ko'rsatilmaydi).
"""
import logging

from django.http import JsonResponse

logger = logging.getLogger(__name__)


def server_error(request, *args, **kwargs):
    """500 — kutilmagan server xatosi (handler500).

    Xato tafsilotlari HECH QACHON javobga chiqmaydi: faqat umumiy xabar.
    Traceback `django.request` logger orqali serverga yoziladi.
    """
    logger.error(
        '[500] Unhandled error: %s %s (user=%s)',
        request.method,
        request.get_full_path(),
        getattr(getattr(request, 'user', None), 'pk', None),
    )
    return JsonResponse(
        {'detail': "Serverda kutilmagan xatolik yuz berdi. Birozdan keyin qayta urinib ko'ring."},
        status=500,
    )


def _wants_json(request) -> bool:
    """API/eksport yo'llari JSON oladi; Django admin o'z HTML sahifasida qoladi."""
    path = request.path or ''
    return not path.startswith('/admin')


def bad_request(request, exception=None, *args, **kwargs):
    """400 — SuspiciousOperation / BadRequest uchun toza JSON."""
    logger.warning('[400] Bad request: %s %s', request.method, request.get_full_path())
    if not _wants_json(request):
        from django.views import defaults
        return defaults.bad_request(request, exception)
    return JsonResponse({'detail': "So'rov noto'g'ri."}, status=400)


def permission_denied(request, exception=None, *args, **kwargs):
    """403 — ruxsat yo'q (DRF bo'lmagan yo'llar uchun ham JSON)."""
    if not _wants_json(request):
        from django.views import defaults
        return defaults.permission_denied(request, exception)
    return JsonResponse({'detail': "Ruxsat yo'q."}, status=403)


def page_not_found(request, exception=None, *args, **kwargs):
    """404 — topilmadi."""
    if not _wants_json(request):
        from django.views import defaults
        return defaults.page_not_found(request, exception)
    return JsonResponse({'detail': 'Topilmadi.'}, status=404)
