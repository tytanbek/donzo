"""
IP ↔ akkaunt kuzatuvi (anti-fraud / multi-account detection).

Vazifasi: har bir muvaffaqiyatli kirishda IP manzilni akkauntga bog'lash va
AGAR shu IP'dan boshqa akkaunt(lar) ham kirgan bo'lsa — adminni darhol
Telegram orqali ogohlantirish.

Nima uchun kerak
----------------
Firibgarlar odatda bitta qurilma (bitta IP) dan bir nechta akkaunt ochadi:
  • yangi akkauntga "yangi mijoz" bonusini olish uchun;
  • promokod / chegirmani qayta ishlatish uchun;
  • bloklangan akkaunt o'rniga yangisidan kirish uchun.

Ogohlantirish qoidalari
-----------------------
  • Faqat OMMAVIY (public) IP'lar yoziladi — 127.0.0.1/10.x/192.168.x/::1
    kabi ichki manzillar e'tiborga olinmaydi (lokal dev va proxy shovqini).
  • Bir IP + bir akkaunt juftligi uchun ogohlantirish 12 soatda bir marta
    yuboriladi (spam bo'lmasin) — cache orqali, ishlamasa ham login buzilmaydi.
  • Signal kuchi: bir xil qurilma (User-Agent) bo'lsa "KUCHLI", boshqa
    qurilma bo'lsa "O'RTA" (NAT / umumiy Wi-Fi bo'lishi mumkin).

Bu modul HECH QACHON login oqimini to'xtatmaydi yoki xato qaytarmaydi:
har qanday istisno yutiladi va faqat log yoziladi.
"""
import ipaddress
import logging

from django.core.cache import cache
from django.utils import timezone

logger = logging.getLogger(__name__)

ALERT_THROTTLE_SECONDS = 12 * 3600  # bir IP+akkaunt uchun 12 soat
MAX_TELEGRAM_LEN = 3500


def _client_ip(request) -> str:
    """Ishonchli client IP (apps.security.net — XFF spoofing'ga qarshi).

    XFF ning chap tomoni mijoz tomonidan yozilishi mumkin: u holda
    firibgar o'z kirishlarini boshqa IP'ga yozdirib, "bir IP — bir nechta
    akkaunt" tekshiruvini yo'q qilardi.
    """
    from apps.security.net import client_ip

    return client_ip(request)


def is_public_ip(ip: str) -> bool:
    """Ommaviy IP'mi? Ichki/loopback manzillar kuzatilmaydi."""
    if not ip:
        return False
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return not (
        addr.is_private or addr.is_loopback or addr.is_link_local
        or addr.is_multicast or addr.is_reserved or addr.is_unspecified
    )


def _fmt_account(row) -> str:
    user = row.user
    name = f'@{user.telegram_username}' if user.telegram_username else f'@{user.username}'
    tg = user.telegram_id or '—'
    return f"{name} (ID {tg}, {user.role}) — oxirgi kirish {row.last_seen_at:%d.%m %H:%M}"


def _admin_recipients():
    """Ogohlantirish yuboriladigan chat'lar: super admin + hisobot guruhi."""
    from apps.settings_app.models import Setting
    from apps.users.views import get_super_admin_telegram_id

    out = []
    owner = get_super_admin_telegram_id()
    if owner:
        out.append(str(owner))
    group = (Setting.get_setting('payment_report_chat_id', '') or '').strip()
    if group and group not in out:
        out.append(group)
    return out


def _send_telegram_alert(text: str) -> int:
    """Admin(lar)ga Telegram xabar. Yuborilgan chat'lar sonini qaytaradi."""
    from apps.settings_app.models import Setting
    from apps.security.alerts import _send  # mavjud past-darajali yuboruvchi

    bot_token = (Setting.get_setting('telegram_bot_token', '') or '').strip()
    if not bot_token:
        return 0
    sent = 0
    for chat_id in _admin_recipients():
        try:
            if _send(bot_token, chat_id, text[:MAX_TELEGRAM_LEN]):
                sent += 1
        except Exception:
            logger.exception('[SharedIP] Telegram yuborishda xato (chat=%s)', chat_id)
    return sent


def build_alert_text(user, ip, location, device, shared_rows, same_device: bool) -> str:
    lines = [
        '🚨 <b>DONZO XAVFSIZLIK: BIR IP — BIR NECHTA AKKAUNT</b>',
        '',
        f"📍 IP: <code>{ip}</code>",
    ]
    if location:
        lines.append(f'🗺 Joylashuv: {location}')
    if device:
        lines.append(f'📱 Qurilma: {device[:120]}')
    signal = 'KUCHLI (bir xil qurilma)' if same_device else "O'RTA (turli qurilma)"
    lines += [
        f'⚠️ Signal: {signal}',
        '',
        '👤 <b>Hozir kirgan akkaunt:</b>',
        f"• @{user.telegram_username or user.username} "
        f"(ID {user.telegram_id or '—'}, {user.role})",
        '',
        f'📋 <b>Shu IP\'dan kirgan boshqa akkauntlar ({len(shared_rows)}):</b>',
    ]
    lines += [f'• {_fmt_account(r)}' for r in shared_rows[:10]]
    if len(shared_rows) > 10:
        lines.append(f'• ... yana {len(shared_rows) - 10} ta')
    lines += [
        '',
        f"⏱ Vaqt: {timezone.localtime():%d.%m.%Y %H:%M}",
        '🛡 Admin panel → Security Center → “Bir IP — bir nechta akkaunt”',
    ]
    return '\n'.join(lines)


def record_login_ip(user, request) -> dict:
    """Kirish paytida IP ↔ akkaunt xaritasini yangilaydi va kerak bo'lsa ogohlantiradi.

    Qaytaradi: {'ip': str, 'shared': [{'username', 'telegram_id', 'role',
    'last_seen_at', 'login_count'}], 'alerted': bool}
    Hech qachon istisno ko'tarmaydi.
    """
    result = {'ip': '', 'shared': [], 'alerted': False}
    try:
        from .models import LoginIPMap

        ip = _client_ip(request)
        result['ip'] = ip
        if not is_public_ip(ip):
            return result

        device = (request.META.get('HTTP_USER_AGENT', '') or '')[:500]
        location = (user.last_ip_location or '')[:200]
        platform = (user.last_platform or '')[:100]

        row, created = LoginIPMap.objects.get_or_create(
            ip_address=ip,
            user=user,
            defaults={
                'device': device,
                'platform': platform,
                'location': location,
            },
        )
        if not created:
            row.login_count = (row.login_count or 0) + 1
            row.device = device or row.device
            row.platform = platform or row.platform
            row.location = location or row.location
            row.save(update_fields=[
                'login_count', 'device', 'platform', 'location', 'last_seen_at',
            ])

        others = list(
            LoginIPMap.objects
            .filter(ip_address=ip)
            .exclude(user=user)
            .select_related('user')
            .order_by('-last_seen_at')[:20]
        )
        if not others:
            return result

        result['shared'] = [
            {
                'username': o.user.telegram_username or o.user.username,
                'telegram_id': o.user.telegram_id,
                'role': o.user.role,
                'last_seen_at': o.last_seen_at.isoformat() if o.last_seen_at else None,
                'login_count': o.login_count,
            }
            for o in others
        ]

        # ── Ogohlantirishni throttle qilamiz (bir IP+akkaunt / 12 soat) ──
        cache_key = f'shared_ip_alert:{ip}:{user.pk}'
        if cache.get(cache_key):
            return result
        cache.set(cache_key, True, ALERT_THROTTLE_SECONDS)

        same_device = bool(
            device and others
            and any(o.device and o.device == device for o in others)
        )
        text = build_alert_text(user, ip, location, device, others, same_device)
        sent = _send_telegram_alert(text)

        try:
            from apps.security.models import HIGH, SecurityAlert
            SecurityAlert.objects.create(
                alert_type=HIGH,
                severity=HIGH,
                recipient=', '.join(_admin_recipients()) or 'none',
                message_text=text[:500],
                status='SENT' if sent else 'FAILED',
            )
        except Exception:
            logger.exception('[SharedIP] SecurityAlert yozishda xato')

        try:
            row.alerted_at = timezone.now()
            row.save(update_fields=['alerted_at'])
        except Exception:
            pass

        result['alerted'] = True
        logger.warning(
            '[SharedIP] %s shu IP (%s) dan boshqa %d akkaunt bilan mos keldi '
            '(sent=%d, same_device=%s)',
            user.username, ip, len(others), sent, same_device,
        )
        return result
    except Exception:
        logger.exception('[SharedIP] record_login_ip xatosi (ahamiyatsiz)')
        return result


def shared_ip_clusters(min_accounts: int = 2, limit: int = 100) -> list:
    """Bir IP'dan kirgan bir nechta akkauntlar ro'yxati (admin panel uchun)."""
    from django.db.models import Count, Max

    from .models import LoginIPMap

    rows = (
        LoginIPMap.objects
        .values('ip_address')
        .annotate(accounts=Count('user', distinct=True), last_seen=Max('last_seen_at'))
        .filter(accounts__gte=min_accounts)
        .order_by('-last_seen')[:limit]
    )
    clusters = []
    for r in rows:
        accounts = list(
            LoginIPMap.objects
            .filter(ip_address=r['ip_address'])
            .select_related('user')
            .order_by('-last_seen_at')
        )
        clusters.append({
            'ip_address': r['ip_address'],
            'accounts_count': r['accounts'],
            'last_seen_at': r['last_seen'].isoformat() if r['last_seen'] else None,
            'location': accounts[0].location if accounts else '',
            'alerted_at': max(
                (a.alerted_at for a in accounts if a.alerted_at), default=None
            ),
            'accounts': [
                {
                    'user_id': a.user_id,
                    'username': a.user.telegram_username or a.user.username,
                    'telegram_id': a.user.telegram_id,
                    'role': a.user.role,
                    'is_blacklisted': a.user.is_blacklisted,
                    'login_count': a.login_count,
                    'last_seen_at': a.last_seen_at.isoformat() if a.last_seen_at else None,
                    'device': a.device[:120],
                    'platform': a.platform,
                }
                for a in accounts
            ],
        })
    return clusters
