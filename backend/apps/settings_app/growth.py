"""O'sish (growth) avtomatikasi: kanal hisobotlari, narx e'lonlari, qaytgan
mijozlarga eslatma va referal taklif matni.

Hammasi HAQIQIY ma'lumotlarga asoslanadi va cheklangan:
  • kunlik hisobot — kuniga bir marta, bo'sh kunda yuborilmaydi;
  • narx e'lonlari — o'zgarishlar 3 daqiqa "tinch" qolgach bitta xabarga jamlanadi;
  • eslatma — faqat avval xarid qilgan va botni ishga tushirgan mijozga,
    bir odamga 30 kunda ko'pi bilan bir marta, kunlik limit bilan va
    "🔕 O'chirish" tugmasi bilan (o'chirgan odamga boshqa yuborilmaydi).

Bot `run_periodic()` ni har daqiqada chaqiradi. Telegram'ga yuborish
`apps.orders.proof_channel.send_text_verbose` orqali (IPv4, qayta urinish).
"""
import html
import logging
from collections import OrderedDict
from datetime import timedelta

from django.db.models import Count, Max, Q, Sum
from django.db.models.signals import post_save, pre_save
from django.utils import timezone

logger = logging.getLogger(__name__)

SEPARATOR = '━━━━━━━━━━━━━━━'
PRICE_QUIET_SECONDS = 180
PRICE_MAX_LINES = 20
REMINDER_COOLDOWN_DAYS = 30
REMINDERS_PER_RUN = 5
REMINDER_HOURS = (11, 20)        # Toshkent vaqti bilan [11:00, 20:00)
REMIND_OFF_CALLBACK = 'remind_off'


def _setting(key, default=''):
    from apps.settings_app.models import Setting
    return str(Setting.get_setting(key, default) or '').strip()


def _set(key, value):
    from apps.settings_app.models import Setting
    Setting.set_setting(key, value)


def _truthy(value) -> bool:
    return str(value or '').strip().lower() in ('1', 'true', 'yes', 'on')


def _fmt(amount) -> str:
    try:
        return f"{float(amount):,.0f}".replace(',', ' ')
    except (TypeError, ValueError):
        return str(amount)


def _bot_username() -> str:
    return _setting('telegram_bot_username').lstrip('@') or 'DONZOROBOT'


def _channel():
    """(chat_id, token) — isbot kanali yoqilgan bo'lsa, aks holda (None, None)."""
    from apps.orders.proof_channel import channel_config
    enabled, chat_id, token = channel_config()
    if enabled and chat_id and token:
        return chat_id, token
    return None, None


def _order_button():
    return {'inline_keyboard': [[
        {'text': '🛒 Buyurtma berish', 'url': f'https://t.me/{_bot_username()}?start=ad_channel'},
    ]]}


def _send(chat_id, token, text, markup=None) -> bool:
    from apps.orders.proof_channel import send_text_verbose
    ok, detail = send_text_verbose(chat_id, token, text, markup)
    if not ok:
        logger.warning('Growth: yuborilmadi (%s)', detail)
    return ok


# ═══════════════════════ Narx o'zgarishi e'lonlari ═══════════════════════

def _remember_old_price(sender, instance, **kwargs):
    if instance.pk:
        instance._growth_old_price = (
            type(instance).objects.filter(pk=instance.pk).values_list('price', flat=True).first()
        )
    else:
        instance._growth_old_price = None


def _queue_price_change(sender, instance, created, **kwargs):
    from apps.settings_app.models import PriceAnnouncement
    old = getattr(instance, '_growth_old_price', None)
    if created or old is None or old == instance.price or not instance.is_active:
        return
    try:
        if not (_truthy(_setting('proof_channel_price_alerts', 'True')) and _channel()[0]):
            return
        PriceAnnouncement.objects.create(
            service_name=instance.service.name if instance.service_id else '',
            package_name=instance.name,
            old_price=old,
            new_price=instance.price,
        )
    except Exception:
        logger.exception("Narx o'zgarishini navbatga qo'shib bo'lmadi")


def connect_signals():
    from apps.services.models import Package
    pre_save.connect(_remember_old_price, sender=Package, dispatch_uid='growth_price_pre')
    post_save.connect(_queue_price_change, sender=Package, dispatch_uid='growth_price_post')


def build_price_message(rows) -> str:
    """rows — PriceAnnouncement ro'yxati (eski → oxirgi narx bir paketga jamlanadi)."""
    merged = OrderedDict()
    for r in rows:
        key = (r.service_name, r.package_name)
        if key in merged:
            merged[key][1] = r.new_price
        else:
            merged[key] = [r.old_price, r.new_price]
    by_service = OrderedDict()
    for (service, package), (old, new) in merged.items():
        if old == new:
            continue
        by_service.setdefault(service, []).append((package, old, new))
    if not by_service:
        return ''
    esc = html.escape
    lines = ['📢 <b>Narxlar yangilandi</b>', SEPARATOR]
    count = 0
    for service, items in by_service.items():
        lines.append(f'<b>{esc(service)}</b>')
        for package, old, new in items:
            if count >= PRICE_MAX_LINES:
                break
            arrow = '📉' if new < old else '📈'
            lines.append(f"▫️ {esc(package)}: <s>{_fmt(old)}</s> → <b>{_fmt(new)} so'm</b> {arrow}")
            count += 1
        lines.append('')
    lines += [SEPARATOR, f'🛒 Buyurtma: @{esc(_bot_username())}']
    return '\n'.join(lines)


def flush_price_announcements(now=None) -> bool:
    """O'zgarishlar 3 daqiqa tinch qolgan bo'lsa — bitta xabar bilan e'lon qiladi."""
    from apps.settings_app.models import PriceAnnouncement
    now = now or timezone.now()
    pending = list(PriceAnnouncement.objects.filter(announced_at__isnull=True).order_by('created_at'))
    if not pending:
        return False
    if (now - pending[-1].created_at).total_seconds() < PRICE_QUIET_SECONDS:
        return False   # admin hali tahrirlayapti — kutamiz
    PriceAnnouncement.objects.filter(pk__in=[p.pk for p in pending]).update(announced_at=now)
    chat_id, token = _channel()
    text = build_price_message(pending)
    if not (chat_id and text):
        return False
    return _send(chat_id, token, text, _order_button())


# ═══════════════════════ Kunlik kanal hisoboti ═══════════════════════

def daily_report_text(day) -> str:
    """Toshkent kunining yakuni; bajarilgan buyurtma bo'lmasa — ''."""
    from apps.orders.models import Order
    qs = Order.objects.filter(status='completed', updated_at__date=day)
    agg = qs.aggregate(n=Count('id'), total=Sum('total_price'))
    if not agg['n']:
        return ''
    top = (qs.values('service__name').annotate(n=Count('id')).order_by('-n', 'service__name')[:3])
    esc = html.escape
    medals = ('🥇', '🥈', '🥉')
    lines = [f"📊 <b>Kun yakuni — {day:%d.%m.%Y}</b>", SEPARATOR,
             f"✅ Bajarilgan buyurtmalar: <b>{agg['n']} ta</b>",
             f"💰 Umumiy summa: <b>{_fmt(agg['total'] or 0)} so'm</b>"]
    if top:
        lines += ['', "🏆 <b>Eng ko'p olinganlar</b>"]
        for medal, row in zip(medals, top):
            lines.append(f"{medal} {esc(row['service__name'] or '—')} — {row['n']} ta")
    lines += [SEPARATOR, 'Rahmat, ishonchingiz uchun! 💙', f'🛒 Buyurtma: @{esc(_bot_username())}']
    return '\n'.join(lines)


def send_daily_report_if_due(now_local) -> bool:
    if not _truthy(_setting('proof_channel_daily_report', 'True')):
        return False
    chat_id, token = _channel()
    if not chat_id:
        return False
    try:
        hh, mm = (_setting('proof_channel_daily_time', '21:00') or '21:00').split(':')
        due_min = int(hh) * 60 + int(mm)
    except ValueError:
        due_min = 21 * 60
    if now_local.hour * 60 + now_local.minute < due_min:
        return False
    today = now_local.date()
    if _setting('proof_channel_daily_last') == today.isoformat():
        return False
    _set('proof_channel_daily_last', today.isoformat())   # avval belgilaymiz — takrorlanmaydi
    text = daily_report_text(today)
    if not text:
        return False
    return _send(chat_id, token, text, _order_button())


# ═══════════════════════ Qaytgan mijozlarga eslatma ═══════════════════════

def reminder_candidates(limit, now=None):
    """Avval xarid qilgan, oxirgi buyurtmasi eski, eslatma olmagan mijozlar."""
    from apps.settings_app.models import CustomerReminder
    from apps.users.models import User
    now = now or timezone.now()
    try:
        days = max(3, int(_setting('marketing_reminder_days', '14') or 14))
    except ValueError:
        days = 14
    blocked = CustomerReminder.objects.filter(
        Q(opted_out=True) | Q(last_sent_at__gte=now - timedelta(days=REMINDER_COOLDOWN_DAYS))
    ).values_list('telegram_id', flat=True)
    return list(
        User.objects.filter(is_active=True, role='customer', telegram_id__isnull=False)
        .exclude(telegram_id='')
        .exclude(telegram_id__in=blocked)
        .annotate(
            last_order=Max('orders__created_at'),
            completed=Count('orders', filter=Q(orders__status='completed'), distinct=True),
        )
        .filter(completed__gte=1, last_order__lt=now - timedelta(days=days))
        .order_by('-last_order')[:limit]
    )


def reminder_message(user):
    """(text, reply_markup) — mijozning oxirgi xaridiga asoslangan shaxsiy eslatma."""
    from apps.orders.models import Order
    from apps.settings_app.marketing_ads import _site_origin, active_promo, promo_line
    esc = html.escape
    last = (Order.objects.filter(customer=user, status='completed')
            .select_related('service', 'package').order_by('-created_at').first())
    name = esc(user.first_name or user.username or "do'stim")
    lines = [f'👋 Salom, <b>{name}</b>!', '']
    path = ''
    if last and last.service_id:
        lines.append(f"Oxirgi marta <b>{esc(last.service.name)}</b> — {esc(last.package.name)} olgan edingiz.")
        if last.package.is_active:
            lines.append(f"Hozirgi narxi: <b>{_fmt(last.package.price)} so'm</b>.")
        path = f'/services/{last.service.slug}'
    lines += ['', "Yana kerak bo'lsa — bir daqiqada buyurtma bering 👇"]
    promo = promo_line(active_promo())
    if promo:
        lines += ['', promo]
    markup = {'inline_keyboard': [
        [{'text': '🛒 Buyurtma berish', 'web_app': {'url': f'{_site_origin()}{path}'}}],
        [{'text': "🔕 Eslatmalarni o'chirish", 'callback_data': REMIND_OFF_CALLBACK}],
    ]}
    return '\n'.join(lines), markup


def send_due_reminders(now_local, now=None) -> int:
    from apps.settings_app.models import CustomerReminder
    if not _truthy(_setting('marketing_reminders_enabled', 'True')):
        return 0
    if not (REMINDER_HOURS[0] <= now_local.hour < REMINDER_HOURS[1]):
        return 0
    token = _setting('telegram_bot_token')
    if not token:
        return 0
    try:
        per_day = max(0, int(_setting('marketing_reminders_per_day', '30') or 30))
    except ValueError:
        per_day = 30
    day_key = f'marketing_reminders_sent_{now_local:%Y%m%d}'
    try:
        sent_today = int(_setting(day_key, '0') or 0)
    except ValueError:
        sent_today = 0
    budget = min(REMINDERS_PER_RUN, per_day - sent_today)
    if budget <= 0:
        return 0
    now = now or timezone.now()
    sent = 0
    for user in reminder_candidates(budget, now=now):
        row, _ = CustomerReminder.objects.get_or_create(telegram_id=str(user.telegram_id))
        # Avval belgilaymiz: xato bo'lsa ham bu odamga 30 kun qayta urinilmaydi
        row.last_sent_at = now
        row.sent_count += 1
        row.save(update_fields=['last_sent_at', 'sent_count', 'updated_at'])
        text, markup = reminder_message(user)
        if _send(str(user.telegram_id), token, text, markup):
            sent += 1
    if sent:
        _set(day_key, str(sent_today + sent))
    return sent


def opt_out(telegram_id) -> None:
    from apps.settings_app.models import CustomerReminder
    row, _ = CustomerReminder.objects.get_or_create(telegram_id=str(telegram_id))
    row.opted_out = True
    row.save(update_fields=['opted_out', 'updated_at'])


# ═══════════════════════ Referal taklifi ═══════════════════════

def referral_text(user):
    """/taklif uchun (text, reply_markup)."""
    from urllib.parse import quote
    from apps.users.models import User
    from apps.users.referral_service import REFERRAL_BONUS_PERCENT
    if user is None:
        return ("🎁 Do'stlarni taklif qilish uchun avval Web App orqali kiring: /start", None)
    if not user.referral_code:
        user.save()   # model save() referral_code yaratadi
    link = f'https://t.me/{_bot_username()}?start=ref_{user.referral_code}'
    invited = User.objects.filter(referred_by=user).count()
    buyers = User.objects.filter(referred_by=user, orders__status='completed').distinct().count()
    pct = f'{float(REFERRAL_BONUS_PERCENT):g}'
    text = '\n'.join([
        "🎁 <b>Do'stlaringizni taklif qiling</b>", SEPARATOR,
        f"Taklif qilgan do'stingizning <b>har bir buyurtmasidan {pct}%</b> cashback sizga tushadi.",
        "30 ta do'st — 1 oylik <b>Telegram Premium</b> sovg'a.", '',
        f"👥 Taklif qilganlar: <b>{invited} ta</b>",
        f"🛒 Xarid qilganlar: <b>{buyers} ta</b>", '',
        f"🔗 Sizning havolangiz:\n{html.escape(link)}",
    ])
    share_text = "DONZO — o'yinlar uchun tez va ishonchli donat. Shu havola orqali kiring:"
    share_url = f'https://t.me/share/url?url={quote(link)}&text={quote(share_text)}'
    markup = {'inline_keyboard': [[{'text': "📤 Do'stlarga ulashish", 'url': share_url}]]}
    return text, markup


# ═══════════════════════ Bot sikli ═══════════════════════

def run_periodic(now_local) -> None:
    """Bot har daqiqada chaqiradi. Har qism alohida — biri yiqilsa boshqasi ishlayveradi."""
    for fn in (flush_price_announcements,
               lambda: send_daily_report_if_due(now_local),
               lambda: send_due_reminders(now_local)):
        try:
            fn()
        except Exception:
            logger.exception('Growth periodic task failed')
