"""Guruhlarga yuboriladigan premium DONZO reklama posti.

Faqat HAQIQIY ma'lumotlar ishlatiladi — narxlar bazadagi faol paketlardan,
ijtimoiy isbot haqiqatan bajarilgan buyurtmalar sonidan olinadi. Soxta
"oz qoldi", to'qilgan sharh yoki raqamlar yo'q: guruh a'zolari isbot
kanalida hammasini o'zlari tekshira oladi — ishonch shundan quriladi.

compose_ad() → (caption_html, reply_markup, variant). Ikki xil post:
  • catalog   — eng ko'p sotilgan xizmatlarning "...dan" narxlari;
  • spotlight — bitta o'yinning faol paketlari narxi bilan.
Ikkalasiga (bo'lsa) admin tanlagan AMALDAGI promokod va so'nggi bajarilgan
buyurtmalar lentasi qo'shiladi. "Buyurtma berish" tugmasi /start ad_<variant>
bilan ochiladi — admin panelda qaysi post nechta kirish va buyurtma olib
kelgani ko'rinadi. Caption Telegram chegarasi (1024 belgi) ichida qoladi.
"""
import html
import random
import re
from datetime import timedelta
from urllib.parse import urlparse

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


# Premium reklama rasmlari — frontend/public/ads/ (Vercel orqali ochiq URL)
AD_IMAGE_FILES = ('ad-1.jpg', 'ad-2.jpg', 'ad-3.jpg')
DEFAULT_SITE = 'https://donzo-eight.vercel.app'


def _site_origin() -> str:
    """Mini App sayti manzili (scheme://host). t.me havolasi bo'lsa — default sayt."""
    parsed = urlparse(_setting('web_app_url'))
    if parsed.scheme == 'https' and parsed.netloc and not parsed.netloc.endswith('t.me'):
        return f'https://{parsed.netloc}'
    return DEFAULT_SITE


# Spotlight postlar uchun o'yinga mos rasm (slug/nomdagi kalit so'z bo'yicha)
SPOTLIGHT_IMAGES = (
    ('pubg', 'ad-pubg.jpg'),
    ('free-fire', 'ad-freefire.jpg'), ('freefire', 'ad-freefire.jpg'),
    ('mobile-legends', 'ad-mlbb.jpg'), ('mlbb', 'ad-mlbb.jpg'),
    ('telegram', 'ad-premium.jpg'), ('premium', 'ad-premium.jpg'), ('stars', 'ad-premium.jpg'),
)


def spotlight_image(variant: str) -> str:
    """s-<slug> varianti uchun o'yin rasmi URL'i (mos rasm bo'lmasa — '')."""
    if not variant.startswith('s-'):
        return ''
    for key, filename in SPOTLIGHT_IMAGES:
        if key in variant:
            return f'{_site_origin()}/ads/{filename}'
    return ''


def pick_ad_image(rng=random) -> str:
    """Admin o'z rasmini (marketing_daily_image) bergan bo'lsa — o'sha,
    aks holda 3 ta premium rasmdan tasodifiy biri."""
    custom = _setting('marketing_daily_image')
    if custom:
        return custom
    return f'{_site_origin()}/ads/{rng.choice(AD_IMAGE_FILES)}'


TICKER_MARK = ' oldin'
PACKAGE_MARK = "so'm</b> "   # spotlight paket qatori belgisi (oxirida bo'shliq)
VARIANT_RE = re.compile(r'^[a-z0-9-]{1,40}$')
SPOTLIGHT_PACKAGES = 6
TICKER_SIZE = 3
ATTRIBUTION_DAYS = 7


def _slug_variant(text: str) -> str:
    return re.sub(r'[^a-z0-9-]+', '-', (text or '').lower()).strip('-')[:38] or 'x'


def build_reply_markup(variant: str = ''):
    start = f'ad_{variant}' if variant else 'ad'
    rows = [[{'text': '🛒 Buyurtma berish', 'url': f'https://t.me/{_bot_username()}?start={start}'}]]
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


# ── Haqiqiy aksiya: admin tanlagan promokod (faqat amalda bo'lsa) ──

def active_promo():
    """marketing_promo_code sozlamasidagi kod hozir amalda bo'lsa — PromoCode."""
    code = _setting('marketing_promo_code')
    if not code:
        return None
    from apps.promocodes.models import PromoCode
    promo = PromoCode.objects.filter(code__iexact=code, is_active=True).first()
    if promo is None:
        return None
    now = timezone.now()
    if promo.starts_at and now < promo.starts_at:
        return None
    if promo.expires_at and now > promo.expires_at:
        return None
    if promo.max_uses and promo.current_uses >= promo.max_uses:
        return None
    return promo


def promo_line(promo) -> str:
    if promo is None:
        return ''
    if promo.discount_type == 'percentage':
        value = f'{float(promo.discount_value):g}%'
    else:
        value = f"{_fmt_sum(promo.discount_value)} so'm"
    parts = [f'🎁 Promokod <code>{html.escape(promo.code)}</code> — <b>{value}</b> chegirma']
    if promo.min_order_amount and float(promo.min_order_amount) > 0:
        parts.append(f"{_fmt_sum(promo.min_order_amount)} so'mdan")
    if promo.expires_at:
        parts.append(f"{timezone.localtime(promo.expires_at):%d.%m} gacha")
    return ' · '.join(parts)


# ── So'nggi buyurtmalar lentasi (mijoz ma'lumotisiz) ──

def _ago(dt) -> str:
    minutes = max(1, int((timezone.now() - dt).total_seconds() // 60))
    if minutes < 60:
        return f'{minutes} daqiqa{TICKER_MARK}'
    return f'{minutes // 60} soat{TICKER_MARK}'


def recent_orders(limit: int = TICKER_SIZE, hours: int = 24):
    from apps.orders.models import Order
    since = timezone.now() - timedelta(hours=hours)
    rows = (Order.objects.filter(status='completed', updated_at__gte=since)
            .select_related('service', 'package').order_by('-updated_at')[:limit])
    return [(o.service.name if o.service_id else '', o.package.name if o.package_id else '', o.updated_at)
            for o in rows]


def ticker_lines():
    rows = recent_orders()
    if not rows:
        return []
    esc = html.escape
    lines = ["🕒 <b>So'nggi buyurtmalar</b>"]
    for service, package, when in rows:
        label = f'{esc(service)} · {esc(package)}' if package else esc(service)
        lines.append(f'🟢 {label} — {_ago(when)}')
    return lines


# ── Spotlight: bitta o'yin ──

def spotlight_service(rng=random):
    """Kamida 2 ta faol paketi bor xizmat; ko'p sotilgani ehtimolliroq tanlanadi."""
    from apps.services.models import Service
    rows = list(
        Service.objects.filter(is_active=True)
        .annotate(
            active_pkgs=Count('packages', filter=Q(packages__is_active=True), distinct=True),
            sold=Count('orders', filter=Q(orders__status='completed'), distinct=True),
        )
        .filter(active_pkgs__gte=2)
        .order_by('-sold', 'name')[:6]
    )
    if not rows:
        return None
    return rng.choices(rows, weights=[r.sold + 1 for r in rows], k=1)[0]


def _spotlight_lines(service):
    from apps.services.models import Package
    esc = html.escape
    pkgs = (Package.objects.filter(service=service, is_active=True)
            .order_by('order_index', 'price')[:SPOTLIGHT_PACKAGES])
    lines = [f"{_emoji_for(service.name)} <b>{esc(service.name)}</b> — DONZO'da",
             SEPARATOR, '<i>Rasmiy paketlar, aniq narx, tez yetkazish.</i>', '', '💰 <b>Narxlar</b>']
    for pkg in pkgs:
        lines.append(f"▫️ {esc(pkg.name)} — <b>{_fmt_sum(pkg.price)} {PACKAGE_MARK}")
    return lines


def _catalog_lines(headline, tagline):
    esc = html.escape
    lines = [headline, SEPARATOR, f'<i>{tagline}</i>']
    prices = featured_prices()
    if prices:
        lines += ['', '🔥 <b>Narxlar</b>']
        for name, price in prices:
            lines.append(f"{_emoji_for(name)} {esc(name)} — <b>{_fmt_sum(price)} {PRICE_MARK}")
    return lines


def _fit(lines):
    """1024 belgiga sig'dirish: avval lenta, keyin paket/narx qatorlari qisqaradi."""
    caption = '\n'.join(lines)
    for mark in (TICKER_MARK, PACKAGE_MARK, PRICE_MARK):
        while len(caption) > CAPTION_LIMIT:
            idx = max((i for i, ln in enumerate(lines) if mark in ln), default=None)
            if idx is None:
                break
            lines.pop(idx)
            caption = '\n'.join(lines)
    return caption[:CAPTION_LIMIT]


def compose_ad(rng=random, mode=None):
    """(caption, reply_markup, variant) — mode: 'catalog' | 'spotlight' | None (tasodifiy)."""
    mode = mode or rng.choice(('catalog', 'spotlight'))
    service = spotlight_service(rng) if mode == 'spotlight' else None
    if service is not None:
        lines = _spotlight_lines(service)
        variant = f's-{_slug_variant(service.slug or service.name)}'
        benefits = BENEFITS[:2]
    else:
        idx = rng.randrange(len(HEADLINES))
        lines = _catalog_lines(*HEADLINES[idx])
        variant = f'c{idx + 1}'
        benefits = BENEFITS

    promo = promo_line(active_promo())
    if promo:
        lines += ['', promo]
    ticker = ticker_lines()
    if ticker:
        lines += ['', *ticker]
    lines += ['', *benefits]
    done = completed_last_days()
    if done >= MIN_SOCIAL_PROOF:
        lines.append(f"✅ So'nggi 7 kunda <b>{done} ta</b> buyurtma bajarildi")
    lines += [SEPARATOR, f'👇 Buyurtma: @{html.escape(_bot_username())}']
    return _fit(lines), build_reply_markup(variant), variant


def build_premium_ad(rng=random):
    """Katalog posti (orqaga moslik uchun): (caption, reply_markup)."""
    caption, markup, _ = compose_ad(rng, mode='catalog')
    return caption, markup


def ad_payload(chat_id: str, image: str = ''):
    """(method, payload): rasm bo'lsa sendPhoto, aks holda sendMessage."""
    caption, markup, variant = compose_ad()
    # Admin o'z rasmini bermagan bo'lsa — spotlight postga o'yinning o'z rasmi
    if image and not _setting('marketing_daily_image'):
        image = spotlight_image(variant) or image
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


# ── Samaradorlikni o'lchash ──

def variant_from_payload(payload: dict) -> str:
    try:
        url = payload['reply_markup']['inline_keyboard'][0][0]['url']
    except (KeyError, IndexError, TypeError):
        return ''
    m = re.search(r'[?&]start=ad_([a-z0-9-]+)', url)
    return m.group(1) if m else ''


def record_ad_sent(payload: dict) -> str:
    """Muvaffaqiyatli yuborilgan post — shu variantning yuborishlar soni +1."""
    from apps.settings_app.models import AdVariantStat
    variant = variant_from_payload(payload)
    if variant:
        AdVariantStat.bump(variant, 'sends')
    return variant


def record_ad_start(start_param: str, telegram_id) -> str:
    """/start ad_<variant> — kirishni yozadi (bir odam/variant uchun 24 soatda bir marta)."""
    from apps.settings_app.models import AdStart, AdVariantStat
    param = str(start_param or '')
    if not param.startswith('ad_'):
        return ''
    variant = param[3:].lower()
    tg = str(telegram_id or '').strip()
    if not VARIANT_RE.match(variant) or not tg:
        return ''
    since = timezone.now() - timedelta(hours=24)
    if AdStart.objects.filter(variant=variant, telegram_id=tg, created_at__gte=since).exists():
        return variant
    AdStart.objects.create(variant=variant, telegram_id=tg)
    AdVariantStat.bump(variant, 'starts')
    return variant


def variant_label(variant: str) -> str:
    if variant.startswith('s-'):
        return f'Spotlight: {variant[2:]}'
    if variant.startswith('c') and variant[1:].isdigit():
        idx = int(variant[1:]) - 1
        if 0 <= idx < len(HEADLINES):
            return 'Katalog: ' + re.sub(r'<[^>]+>', '', HEADLINES[idx][0])
    return variant


def ad_stats(days: int = 30):
    """Har variant: yuborishlar, kirishlar, kirgandan keyin 7 kun ichidagi buyurtmalar va tushum."""
    from django.db.models import Sum
    from apps.orders.models import Order
    from apps.settings_app.models import AdStart, AdVariantStat

    def empty(variant):
        return {'variant': variant, 'sends': 0, 'starts': 0, 'orders': 0, 'revenue': 0.0}

    stats = {}
    for v in AdVariantStat.objects.all():
        row = empty(v.variant)
        row.update(sends=v.sends, starts=v.starts)
        stats[v.variant] = row
    since = timezone.now() - timedelta(days=days)
    for start in AdStart.objects.filter(created_at__gte=since).order_by('-created_at')[:3000]:
        row = stats.setdefault(start.variant, empty(start.variant))
        agg = (Order.objects.filter(
            customer__telegram_id=start.telegram_id,
            created_at__gte=start.created_at,
            created_at__lt=start.created_at + timedelta(days=ATTRIBUTION_DAYS),
        ).exclude(status='cancelled').aggregate(n=Count('id'), total=Sum('total_price')))
        row['orders'] += agg['n'] or 0
        row['revenue'] += float(agg['total'] or 0)
    result = []
    for row in stats.values():
        row['start_rate'] = round(100 * row['starts'] / row['sends'], 1) if row['sends'] else 0
        row['label'] = variant_label(row['variant'])
        result.append(row)
    return sorted(result, key=lambda r: (-r['orders'], -r['starts'], -r['sends']))
