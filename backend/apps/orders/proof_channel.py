"""Bajarilgan buyurtmalarni Telegram kanalga "isbot / hisobot" sifatida yuborish.

Admin panel → Kalitlar → "Isbot kanali" bo'limida:
  • proof_channel_enabled — yoqish/o'chirish
  • proof_channel_id      — kanal ID (-100...) yoki @username

Buyurtma holati `completed`ga o'tgan zahoti (qaysi yo'l bilan bo'lishidan
qat'i nazar — operator paneli, bot, Fragment avto-yetkazish, staff AI)
kanalga xabar ketadi. Kanal ommaviy bo'lishi mumkin, shuning uchun mijoz
ismi, username va o'yin ID'lari yashiriladi (masalan: Ab***r, 51***9).

Bot kanalga ADMIN sifatida qo'shilgan bo'lishi shart (xabar yuborish huquqi).
Yuborish fon oqimida, tranzaksiya commit bo'lgandan keyin bajariladi —
Telegram sekin yoki ishlamasa ham buyurtma jarayoni hech qachon to'xtamaydi.
"""
import html
import logging
import threading

from django.db import transaction
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from django.utils import timezone

from .models import Order, OrderStatus

logger = logging.getLogger(__name__)

SEPARATOR = '━━━━━━━━━━━━━━━'


def _truthy(value) -> bool:
    return str(value or '').strip().lower() in ('1', 'true', 'yes', 'on')


def mask(value, keep_start: int = 2, keep_end: int = 1) -> str:
    """'Abdulloh' → 'Ab***h'. Juda qisqa qiymat → 'A***'. Bo'sh → ''."""
    text = str(value or '').strip().lstrip('@')
    if not text:
        return ''
    if len(text) <= keep_start + keep_end:
        return text[0] + '***'
    return f"{text[:keep_start]}***{text[-keep_end:]}"


def _format_sum(amount) -> str:
    try:
        return f"{float(amount):,.0f}".replace(',', ' ')
    except (TypeError, ValueError):
        return str(amount)


def _duration_label(order) -> str:
    if not order.created_at:
        return ''
    seconds = max(0, int((timezone.now() - order.created_at).total_seconds()))
    if seconds < 60:
        return f'{seconds} soniya'
    minutes = seconds // 60
    if minutes < 60:
        return f'{minutes} daqiqa'
    hours, minutes = divmod(minutes, 60)
    return f'{hours} soat {minutes} daqiqa' if minutes else f'{hours} soat'


def _today_stats():
    """Bugun (mahalliy vaqt) bajarilgan buyurtmalar soni va summasi."""
    from django.db.models import Count, Sum
    today = timezone.localdate()
    agg = Order.objects.filter(
        status=OrderStatus.COMPLETED, updated_at__date=today,
    ).aggregate(n=Count('id'), total=Sum('total_price'))
    return agg['n'] or 0, agg['total'] or 0


def build_proof_message(order) -> str:
    """Kanal uchun HTML xabar (mijoz ma'lumotlari yashirilgan)."""
    esc = html.escape
    service = order.service.name if order.service_id else 'Xizmat'
    package = order.package.name if order.package_id else ''
    customer = mask(order.customer_name) or mask(order.customer_telegram) or 'Mijoz'

    lines = [
        '✅ <b>BUYURTMA BAJARILDI</b>',
        SEPARATOR,
        f'🧾 Buyurtma: <b>#{esc(order.order_number)}</b>',
        f'🎮 Xizmat: <b>{esc(service)}</b>',
    ]
    if package:
        lines.append(f'📦 Paket: <b>{esc(package)}</b>')
    lines.append(f"💰 Summa: <b>{_format_sum(order.total_price)} so'm</b>")
    lines.append(f'👤 Mijoz: {esc(customer)}')

    values = order.field_values if isinstance(order.field_values, dict) else {}
    game_id = values.get('game_id')
    if game_id:
        lines.append(f'🆔 ID: <code>{esc(mask(game_id))}</code>')

    duration = _duration_label(order)
    if duration:
        lines.append(f'⚡ Bajarilish vaqti: {duration}')
    lines.append(f"🕒 {timezone.localtime().strftime('%d.%m.%Y %H:%M')}")

    count, total = _today_stats()
    lines += [
        SEPARATOR,
        f"📊 Bugun bajarildi: <b>{count} ta</b> • <b>{_format_sum(total)} so'm</b>",
    ]
    return '\n'.join(lines)


def _order_button():
    from apps.settings_app.models import Setting
    username = str(Setting.get_setting('telegram_bot_username', '') or '').strip().lstrip('@')
    if not username:
        return None
    return {'inline_keyboard': [[
        {'text': '🛒 Buyurtma berish', 'url': f'https://t.me/{username}'},
    ]]}


def channel_config():
    """(yoqilganmi, chat_id, bot_token)."""
    from apps.settings_app.models import Setting
    enabled = _truthy(Setting.get_setting('proof_channel_enabled', 'False'))
    chat_id = str(Setting.get_setting('proof_channel_id', '') or '').strip()
    token = str(Setting.get_setting('telegram_bot_token', '') or '').strip()
    return enabled, chat_id, token


def send_text(chat_id: str, token: str, text: str, reply_markup=None) -> bool:
    from apps.users.telegram_notify import _send_message
    return _send_message(token, chat_id, text, reply_markup=reply_markup)


def post_order_proof(order) -> bool:
    """Bitta buyurtma uchun isbot xabarini sinxron yuboradi. Hech qachon xato otmaydi."""
    try:
        enabled, chat_id, token = channel_config()
        if not (enabled and chat_id and token):
            return False
        return send_text(chat_id, token, build_proof_message(order), _order_button())
    except Exception:
        logger.exception('Isbot kanaliga yuborishda xato (order=%s)', getattr(order, 'pk', None))
        return False


def _post_in_background(order_id: int):
    def _run():
        try:
            order = Order.objects.select_related('service', 'package').get(pk=order_id)
        except Order.DoesNotExist:
            return
        post_order_proof(order)

    threading.Thread(target=_run, daemon=True).start()


@receiver(pre_save, sender=Order)
def _remember_old_status(sender, instance, **kwargs):
    if instance.pk:
        instance._proof_old_status = (
            Order.objects.filter(pk=instance.pk).values_list('status', flat=True).first()
        )
    else:
        instance._proof_old_status = None


@receiver(post_save, sender=Order)
def _post_when_completed(sender, instance, created, **kwargs):
    old = getattr(instance, '_proof_old_status', None)
    if instance.status != OrderStatus.COMPLETED or old == OrderStatus.COMPLETED:
        return
    enabled, chat_id, token = channel_config()
    if not (enabled and chat_id and token):
        return
    order_id = instance.pk
    transaction.on_commit(lambda: _post_in_background(order_id))
