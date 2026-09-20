"""
Client IP'ni ISHONCHLI aniqlash.

Muammo (pen-test natijasi): ilgari IP `X-Forwarded-For` ning CHAP tomonidagi
qiymatidan olinardi. Bu sarlavhani mijoz o'zi yozib yuborishi mumkin —
natijada hujumchi har so'rovda boshqa IP ko'rsatib:

  • login brute-force blokirovkasini (20 urinish/15 daqiqa) chetlab o'tardi
    (test: haqiqiy IP bilan 429, spoof bilan 403 — cheklov ishlamadi);
  • anti-fraud IP ↔ akkaunt xaritasini buzardi (o'z kirishlarini boshqa
    IP'ga yozdirib, "bir IP — bir nechta akkaunt" ogohlantirishini
    yo'qotardi yoki begunoh IP'ni ayblovchi qilib qo'yardi).

Yechim: ishonchli proksi zanjiri qo'shib qo'ygan OXIRGI qiymat olinadi
(`NUM_PROXIES` — nechta proksi oldida turishimiz; odatda Cloudflare + Render
uchun 1). Bu DRF'ning o'zi ishlatadigan mantiq bilan bir xil
(`rest_framework.throttling.SimpleRateThrottle.get_ident`), shuning uchun
throttle va brute-force bir xil identifikatorni ko'radi.
"""
from django.conf import settings


def client_ip(request) -> str:
    """Ishonchli client IP (proksi zanjirining oxirgi, ishonchli qiymati)."""
    try:
        num_proxies = int(getattr(settings, 'NUM_PROXIES', 1) or 0)
    except (TypeError, ValueError):
        num_proxies = 1

    xff = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if xff and num_proxies > 0:
        parts = [p.strip() for p in xff.split(',') if p.strip()]
        if parts:
            return parts[-num_proxies][:45]
    return (request.META.get('REMOTE_ADDR', '') or '')[:45]
