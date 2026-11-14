"""Guruhlarga yuboriladigan premium DONZO reklama posti.

Faqat HAQIQIY ma'lumotlar ishlatiladi — narxlar bazadagi faol paketlardan,
ijtimoiy isbot haqiqatan bajarilgan buyurtmalar sonidan olinadi. Soxta
"oz qoldi", to'qilgan sharh yoki raqamlar yo'q: guruh a'zolari isbot
kanalida hammasini o'zlari tekshira oladi — ishonch shundan quriladi.

build_premium_ad() → (caption_html, reply_markup). Rasm bilan yuborilganda
caption Telegram chegarasi (1024 belgi) ichida qoladi.
"""
import html
import random
from datetime import timedelta

from django.db.models import Count, Min, Q
from django.utils import timezone

SEPARATOR = '━━━━━━━━━━━━━━━'
CAPTION_LIMIT = 1024
MIN_SOCIAL_PROOF = 5      # bundan kam bo'lsa raqam ko'rsatilmaydi
MAX_FEATURED = 4
PRICE_MARK = "so'm</b>dan"

SERVICE_EMOJI = {
    'pubg': '🎯', 'free fire': '🔥', 'mobile legends': '⚔️', 'telegram': '💎',
    'steam': '🎮', 'standoff': '🔫', 'roblox': '🧊', 'clash': '🏰', 'brawl': '⭐',
    'genshin': '✨', 'netflix': '🎬', 'spotify': '🎧',
}

# (sarlavha, kichik matn) — hammasi xizmatning haqiqiy xususiyatlari haqida
HEADLINES = (
    ("👑 <b>DONZO PREMIUM</b> — o'yiningiz uchun top-up",
     "Rasmiy paketlar, aniq narx, tez yetkazish."),
    ("⚡ <b>DONZO</b> — buyurtma berish 1 daqiqa",
     "Tanlang, to'lang — qolganini biz bajaramiz."),
    ("💎 <b>DONZO</b> — ishonchli donat xizmati",
     "Har bir bajarilgan buyurtma ochiq kanalda e'lon qilinadi."),
    ("🎮 <b>DONZO</b> — UC, Diamond, Premium bir joyda",
     "Bot ichida tanlang, to'lang — tamom."),
)

BENEFITS = (
    "⚡ Tez yetkazish, holatini botda kuzatasiz",
    "🛡 Xavfsiz to'lov: karta yoki balans",
    "🧾 Har buyurtma uchun chek va holat kuzatuvi",
    "🕐 24/7 qo'llab-quvvatlash",
)


def _emoji_for(name: str) -> str:
    low = (name or '').lower()
    for key, emoji in SERVICE_EMOJI.items():
        if key in low:
            return emoji
    return '🔹'


def _fmt_sum(value) -> str:
    try:
        return f"{float(value):,.0f}".replace(',', ' ')
    except (TypeError, ValueError):
        return str(value)


def featured_prices(limit: int = MAX_FEATURED):
    """[(xizmat nomi, eng arzon faol paket narxi)] — eng ko'p sotilganlar oldinda."""
    from apps.services.models import Service
    rows = (
        Service.objects.filter(is_active=True, packages__is_active=True)
        .annotate(
            min_price=Min('packages__price', filter=Q(packages__is_active=True)),
            sold=Count('orders', filter=Q(orders__status='completed'), distinct=True),
        )
        .order_by('-sold', 'name')
        .values_list('name', 'min_price')[:limit]
    )
    return [(name, price) for name, price in rows if price]


def completed_last_days(days: int = 7) -> int:
    from apps.orders.models import Order
    since = timezone.now() - timedelta(days=days)
    return Order.objects.filter(status='completed', updated_at__gte=since).count()


def _setting(key, default=''):
    from apps.settings_app.models import Setting
    return str(Setting.get_setting(key, default) or '').strip()


def _bot_username() -> str:
    return _setting('telegram_bot_username').lstrip('@') or 'DONZOROBOT'


def _public_proof_channel() -> str:
    """Isbot kanali yoqilgan va ommaviy (@username) bo'lsa — username, aks holda ''."""
    enabled = _setting('proof_channel_enabled', 'False').lower() in ('1', 'true', 'yes', 'on')
    chat = _setting('proof_channel_id')
    if enabled and chat.startswith('@') and len(chat) > 1:
        return chat[1:]
    return ''


def build_reply_markup():
    rows = [[{'text': '🛒 Buyurtma berish', 'url': f'https://t.me/{_bot_username()}?start=ad'}]]
    second = []
    proof = _public_proof_channel()
    if proof:
        second.append({'text': '✅ Isbotlar', 'url': f'https://t.me/{proof}'})
    support = _setting('support_telegram').lstrip('@')
    if support:
        second.append({'text': '💬 Yordam', 'url': f'https://t.me/{support}'})
    if second:
        rows.append(second)
    return {'inline_keyboard': rows}


def build_premium_ad(rng=random):
    """Premium reklama posti: (HTML caption, inline klaviatura)."""
    esc = html.escape
    headline, tagline = rng.choice(HEADLINES)
    lines = [headline, SEPARATOR, f'<i>{tagline}</i>']

    prices = featured_prices()
    if prices:
        lines += ['', '🔥 <b>Narxlar</b>']
        for name, price in prices:
            lines.append(f"{_emoji_for(name)} {esc(name)} — <b>{_fmt_sum(price)} {PRICE_MARK}")

    lines += ['', *BENEFITS]

    done = completed_last_days()
    if done >= MIN_SOCIAL_PROOF:
        lines.append(f"✅ So'nggi 7 kunda <b>{done} ta</b> buyurtma bajarildi")

    lines += [SEPARATOR, f'👇 Buyurtma: @{esc(_bot_username())}']

    caption = '\n'.join(lines)
    # Telegram rasm izohi chegarasi — narx qatorlarini oxiridan qisqartiramiz
    while len(caption) > CAPTION_LIMIT:
        idx = max((i for i, ln in enumerate(lines) if PRICE_MARK in ln), default=None)
        if idx is None:
            caption = caption[:CAPTION_LIMIT]
            break
        lines.pop(idx)
        caption = '\n'.join(lines)
    return caption, build_reply_markup()


def ad_payload(chat_id: str, image: str = ''):
    """(method, payload): rasm bo'lsa sendPhoto, aks holda sendMessage."""
    caption, markup = build_premium_ad()
    base = {'chat_id': chat_id, 'parse_mode': 'HTML', 'reply_markup': markup}
    if image:
        return 'sendPhoto', {**base, 'photo': image, 'caption': caption}
    return 'sendMessage', {**base, 'text': caption, 'disable_web_page_preview': True}


def text_fallback(payload: dict) -> dict:
    """sendPhoto muvaffaqiyatsiz bo'lsa — xuddi shu post matn sifatida."""
    fb = {k: v for k, v in payload.items() if k not in ('photo', 'caption')}
    fb['text'] = payload.get('caption') or payload.get('text', '')
    fb['disable_web_page_preview'] = True
    return fb
