"""Guruhlarda DONZO yozish/ko'rish huquqlari diagnostikasi.

Telegram bot guruhda ADMIN bo'lmasa ham xabar yuboradi — admin huquqi faqat
moderatsiya (o'chirish, pin qilish, a'zo chiqarish) uchun kerak. DONZO oddiy
a'zo bo'lib ham yozishi kerak, shuning uchun quyidagi ikki shart tekshiriladi:

  1) bot "Send Messages" huquqidan mahrum qilinmagan (ban/restricted emas);
  2) botning privacy mode'i O'CHIRILGAN (BotFather → /setprivacy → Disable).
     Privacy YOQILGAN bo'lsa bot guruhda faqat @mention, reply va buyruqlarni
     KO'RADI (yozish taqiqlanmaydi, lekin suhbatga o'zi qo'shila olmaydi).
     Privacy'ni o'chirish uchun admin huquqi SHART EMAS.

Bu modul shu holatlarni aniqlaydi, admin panel/diagnostika uchun tayyor
hisobot beradi va muammo bo'lsa super adminni bir marta ogohlantiradi.
Hech bir funksiya exception tashlamaydi — bot oqimini buzmaydi.
"""
import logging
import time

from apps.settings_app.models import Setting

logger = logging.getLogger(__name__)

_READ_ALL_TTL = 600          # getMe natijasi 10 daqiqa keshlanadi
_REPORT_TTL = 300            # guruh hisoboti 5 daqiqa keshlanadi
WARN_TTL = 24 * 60 * 60      # bir guruh uchun ogohlantirish oralig'i (24 soat)

_read_all_cache = {}         # token -> (ts, bool|None)
_report_cache = {}           # chat_id -> (ts, dict)


def tg_api(token: str, method: str, payload: dict):
    """Telegram Bot API'ga POST — parsed json dict yoki None. Hech qachon buzmaydi."""
    try:
        import json
        import urllib.request
        req = urllib.request.Request(
            f'https://api.telegram.org/bot{token}/{method}',
            data=json.dumps(payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except Exception:
        return None


def bot_can_read_all(token: str):
    """getMe → can_read_all_group_messages: privacy mode o'chirilganmi?

    None — aniqlanmadi (tarmoq xatosi). True — bot guruhdagi HAMMA xabarni
    ko'radi. False — privacy mode yoqilgan: faqat mention/reply/buyruqlar.
    """
    try:
        now = time.time()
        cached = _read_all_cache.get(token)
        if cached and now - cached[0] < _READ_ALL_TTL:
            return cached[1]
        res = tg_api(token, 'getMe', {})
        val = None
        if res and res.get('ok'):
            val = bool((res.get('result') or {}).get('can_read_all_group_messages'))
        _read_all_cache[token] = (now, val)
        return val
    except Exception:
        return None


def bot_id_for(token: str):
    """Botning Telegram id'si (getMe) yoki None."""
    try:
        res = tg_api(token, 'getMe', {})
        if res and res.get('ok'):
            return (res.get('result') or {}).get('id')
    except Exception:
        pass
    return None


def group_access_report(token: str, chat_id: str, bot_id=None) -> dict:
    """Bitta guruh uchun DONZO huquqlari hisoboti.

    Returns dict: chat_id, status, is_admin, can_send, can_read_all, ok, note.
    `ok` — DONZO bu guruhda yoza oladimi (admin huquqi shart emas).
    """
    cid = str(chat_id)
    rep = {'chat_id': cid, 'status': '', 'is_admin': False, 'can_send': False,
           'can_read_all': None, 'ok': False, 'note': ''}
    try:
        now = time.time()
        cached = _report_cache.get(cid)
        if cached and now - cached[0] < _REPORT_TTL:
            return cached[1]

        if bot_id is None:
            bot_id = bot_id_for(token)
        rep['can_read_all'] = bot_can_read_all(token)

        res = tg_api(token, 'getChatMember', {'chat_id': cid, 'user_id': bot_id})
        member = (res or {}).get('result') or {}
        status = member.get('status') or ''
        rep['status'] = status
        rep['is_admin'] = status in ('administrator', 'creator')

        if status == 'creator':
            rep['can_send'] = True
        elif status == 'administrator':
            # Admin huquqlari aniq berilgan bo'lsa, faqat "send" huquqi muhim.
            rep['can_send'] = bool(member.get('can_send_messages', True))
        elif status in ('member', 'restricted'):
            # `member` — oddiy a'zo: yozish huquqi bor (admin shart emas).
            # `restricted` — huquqlar cheklangan, can_send_messages ga qaraymiz.
            rep['can_send'] = bool(member.get('can_send_messages', status == 'member'))
        else:
            rep['can_send'] = False

        rep['ok'] = bool(rep['can_send'])
        if not rep['can_send']:
            rep['note'] = ('DONZO bu guruhda xabar yubora olmaydi — bot '
                           'cheklangan (restricted) yoki guruhdan chiqarilgan.')
        elif rep['can_read_all'] is False and not rep['is_admin']:
            rep['note'] = ("DONZO faqat @mention / reply / buyruqlarni ko'radi — "
                           "boshqa xabarlarga o'zi qo'shilishi uchun privacy mode "
                           "o'chirilishi kerak (BotFather → /setprivacy → Disable).")
        elif rep['can_read_all'] is False and rep['is_admin']:
            rep['note'] = ('OK — bot admin, shuning uchun privacy mode to\'sqinlik '
                           'qilmaydi: guruhdagi hamma xabarni ko\'radi.')
        else:
            rep['note'] = 'OK — yozish va o\'qish huquqi joyida.'

        _report_cache[cid] = (now, rep)
        return rep
    except Exception as exc:
        rep['note'] = f'xato: {type(exc).__name__}'
        return rep


def marketing_skip_chat_ids() -> set:
    """HECH QACHON marketing yozilmaydigan chat'lar (staff / hisobot / monitor)."""
    out = set()
    try:
        for key in ('payment_report_chat_id', 'payment_monitor_chat_id',
                    'staff_group_chat_id'):
            val = str(Setting.get_setting(key, '') or '').strip()
            if val:
                out.add(val)
    except Exception:
        pass
    return out


def marketing_group_ids():
    """Marketing kuzatuvidagi guruhlar: (chat_id, chat_title) ro'yxati."""
    out = []
    try:
        from apps.settings_app.models import MarketingGroupStat
        skip = marketing_skip_chat_ids()
        for chat_id, title in (MarketingGroupStat.objects
                               .values_list('chat_id', 'chat_title')):
            cid = str(chat_id)
            if cid and cid not in skip:
                out.append((cid, title or ''))
    except Exception:
        pass
    return out


def warn_group_access(chat_id: str, chat_title: str, note: str,
                      kind: str = 'access') -> bool:
    """Guruhdagi huquq muammosi haqida super adminni ogohlantiradi.

    Bir guruh + bir xil sabab uchun 24 soatda faqat bir marta yuboriladi.
    Hech qachon exception tashlamaydi.
    """
    try:
        key = f'marketing_access_warn_{kind}_{chat_id}'
        now = time.time()
        last = Setting.get_setting(key, '') or ''
        try:
            if last and now - float(last) < WARN_TTL:
                return False
        except (TypeError, ValueError):
            pass

        token = (Setting.get_setting('telegram_bot_token', '') or '').strip()
        if not token:
            return False
        targets = []
        for tkey in ('super_admin_telegram_id', 'payment_report_chat_id'):
            val = str(Setting.get_setting(tkey, '') or '').strip()
            if val and val not in targets:
                targets.append(val)
        text = (
            "⚠️ <b>DONZO — GURUH HUQUQI</b>\n\n"
            f"Guruh: <b>{chat_title or chat_id}</b>\n"
            f"ID: <code>{chat_id}</code>\n\n"
            f"{note}\n\n"
            "DONZO guruhda yozishi uchun <b>admin huquqi shart emas</b> — oddiy "
            "a'zo bo'lishi yetarli. Quyidagilarni tekshiring:\n"
            "• bot guruhdan chiqarilmagan va cheklanmagan (Send Messages);\n"
            "• guruhda \"Send Messages\" a'zolar uchun ochiq;\n"
            "• privacy mode o'chirilgan: @BotFather → /setprivacy → "
            "botni tanlash → <b>Disable</b>."
        )
        sent = False
        for target in targets:
            res = tg_api(token, 'sendMessage', {
                'chat_id': target, 'text': text,
                'parse_mode': 'HTML', 'disable_web_page_preview': True,
            })
            if res and res.get('ok'):
                sent = True
        if sent:
            Setting.set_setting(key, str(now), description='guruh huquqi ogohlantirishi')
        return sent
    except Exception:
        logger.debug('warn_group_access failed', exc_info=True)
        return False


def check_all_groups(warn: bool = True) -> list:
    """Barcha marketing guruhlarini tekshiradi va muammoli joyda ogohlantiradi.

    Returns har bir guruh uchun hisobot ro'yxati (muammosizlar ham).
    """
    reports = []
    try:
        token = (Setting.get_setting('telegram_bot_token', '') or '').strip()
        if not token:
            return reports
        bot_id = bot_id_for(token)
        for cid, title in marketing_group_ids():
            rep = group_access_report(token, cid, bot_id=bot_id)
            rep['chat_title'] = title
            reports.append(rep)
            if warn and not rep.get('ok'):
                warn_group_access(cid, title, rep.get('note') or '', kind='send')
            elif warn and rep.get('can_read_all') is False and not rep.get('is_admin'):
                warn_group_access(cid, title, rep.get('note') or '', kind='privacy')
    except Exception:
        logger.debug('check_all_groups failed', exc_info=True)
    return reports
