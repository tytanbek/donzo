"""
Guruh javob siyosati: bot faqat ESLATILGANDA va QORA RO'YXATDAGILAR yozganda.

Tekshiriladi (bot.py):
  • Oddiy (mention bo'lmagan) xabar — bot JIM turadi (har bir xabarga
    aralashmaydi);
  • Reply / @mention / "donzo" so'zi — javob yoziladi;
  • Qora ro'yxatdagi odam yozganda (mention bo'lmasa ham) — ogohlantirish
    yuboriladi va AI marketing javobi yozilmaydi; bir odamga 6 soatda bir marta;
  • Qora ro'yxat manbalari: User.is_blacklisted va security_blacklist sozlamasi;
  • _send_group_roast (proaktiv "roast") default holatda hech narsa yozmaydi —
    eski xulq faqat marketing_mention_only='False' bo'lganda qaytadi.
"""
import asyncio
from types import SimpleNamespace
from unittest import mock

from django.core.cache import cache
from django.test import TransactionTestCase

from apps.settings_app.models import MarketingGroupMember, Setting
from apps.users.models import User
import bot  # bot.py — django.setup() idempotent, import qilish xavfsiz


class FakeBot:
    """Telegram bot obyekti o'rniga — yuborilgan xabarlar yig'iladi."""

    def __init__(self):
        self.sent = []

    async def send_message(self, **kwargs):
        self.sent.append(kwargs)
        return SimpleNamespace(message_id=1)


class FakeMessage:
    """Guruh xabari o'rniga — reply_html chaqiruvlari yozib olinadi."""

    def __init__(self, chat_id='-100111', title='Gamerlar'):
        self.chat = SimpleNamespace(id=chat_id, title=title, type='supergroup')
        self.message_id = 10
        self.replies = []

    async def reply_html(self, text):
        self.replies.append(text)
        return SimpleNamespace(message_id=2)


def make_user(tg_id=501, username='player1', first_name='Player One'):
    return SimpleNamespace(id=tg_id, username=username, first_name=first_name,
                           is_bot=False)


class GroupReplyPolicyTests(TransactionTestCase):
    """_marketing_group_reply — mention-only + qora ro'yxat siyosati."""

    def setUp(self):
        cache.clear()
        Setting.clear_cache()
        Setting.set_setting('marketing_group_enabled', 'true')
        Setting.set_setting('telegram_bot_token', 'fake:token')
        Setting.set_setting('staff_ai_angry_mode', 'gentle')
        bot._MARKETING_RECENT.clear()
        bot._GROUP_CONVERSATIONS.clear()
        bot._BLACKLIST_WARNED.clear()
        MarketingGroupMember.objects.all().delete()

    def _reply(self, text, user, triggered, chat_id='-100111'):
        """Guruh javob yo'lini ishga tushiradi.

        Returns (msg, fake_bot, marketing_reply_mock).
        """
        msg = FakeMessage(chat_id=chat_id)
        context = SimpleNamespace(bot=FakeBot())
        with mock.patch('apps.security.staff_ai.marketing_reply',
                        return_value={'ok': True,
                                      'answer': 'Salom! donzo shu yerda.'}) as mr:
            asyncio.run(bot._marketing_group_reply(
                None, context, text, msg, user, triggered))
        return msg, context.bot, mr

    def test_plain_message_gets_silence(self):
        """Eslatilmagan oddiy xabar — bot aralashmaydi (mention-only default)."""
        msg, fake_bot, mr = self._reply('bugun ob-havo issiq', make_user(),
                                        triggered=False)
        self.assertEqual(msg.replies, [])
        self.assertEqual(fake_bot.sent, [])
        self.assertFalse(mr.called)

    def test_mentioned_message_gets_reply(self):
        msg, _fake_bot, mr = self._reply('donzo narx qancha?', make_user(),
                                         triggered=True)
        self.assertEqual(len(msg.replies), 1)
        self.assertIn('donzo', msg.replies[0].lower())
        self.assertTrue(mr.called)

    def test_blacklisted_user_is_warned_without_mention(self):
        """Qora ro'yxatdagi odam yozsa — marketing o'chiq bo'lsa ham ogohlantirish."""
        User.objects.create_user(username='badguy', email='b@test.uz', password='x',
                                 telegram_id='777', is_blacklisted=True)
        Setting.set_setting('marketing_group_enabled', 'false')
        user = make_user(tg_id=777, username='badguy', first_name='Bad Guy')
        msg, _fake_bot, mr = self._reply('salom hammaga', user, triggered=False)
        self.assertEqual(len(msg.replies), 1)
        self.assertIn('qora', msg.replies[0].lower())
        self.assertIn('Bad Guy', msg.replies[0])
        # AI marketing javobi yozilmaydi — faqat xavfsizlik ogohlantirishi
        self.assertFalse(mr.called)

    def test_blacklist_settings_list_triggers_warning(self):
        """security_blacklist sozlamasidagi username ham qora ro'yxat hisoblanadi."""
        Setting.set_setting('security_blacklist', 'badguy, 777')
        user = make_user(tg_id=999, username='badguy', first_name='Bad')
        msg, _fake_bot, mr = self._reply('men yozdim', user, triggered=False)
        self.assertEqual(len(msg.replies), 1)
        self.assertFalse(mr.called)

    def test_blacklist_warning_is_rate_limited(self):
        """Bir odam haqida bir guruhda 6 soatda faqat bir marta ogohlantiriladi."""
        Setting.set_setting('security_blacklist', 'badguy')
        user = make_user(username='badguy')
        first, _b1, _mr1 = self._reply('birinchi xabar', user, triggered=False)
        second, _b2, _mr2 = self._reply('ikkinchi xabar', user, triggered=False)
        self.assertEqual(len(first.replies), 1)
        self.assertEqual(second.replies, [])

    def test_not_blacklisted_user_gets_no_warning(self):
        user = make_user(tg_id=888, username='goodguy', first_name='Good')
        msg, _fake_bot, _mr = self._reply('salom', user, triggered=False)
        self.assertEqual(msg.replies, [])

    def test_custom_blacklist_notice_setting_is_used(self):
        """Ogohlantirish matni admin tomonidan sozlanadi ({name} almashtiriladi)."""
        Setting.set_setting('security_blacklist', 'badguy')
        Setting.set_setting('marketing_blacklist_notice',
                            "Ogoh bo'ling: {name} — ishonchsiz hisob.")
        user = make_user(username='badguy', first_name='Bad Guy')
        msg, _fake_bot, _mr = self._reply('salom', user, triggered=False)
        self.assertEqual(len(msg.replies), 1)
        self.assertIn('Bad Guy', msg.replies[0])
        self.assertIn('ishonchsiz hisob', msg.replies[0])


class MentionOnlyOffRestoresProactiveTests(TransactionTestCase):
    """marketing_mention_only='False' — eski TURBO proaktiv xulq qaytadi.

    Bu sozlama adminning ataylab qilgan tanlovi: default (True) holatda bot
    o'zi suhbatga qo'shilmaydi, 'False' bo'lsa faol suhbatga qo'shiladi.
    """

    def setUp(self):
        cache.clear()
        Setting.clear_cache()
        Setting.set_setting('marketing_group_enabled', 'true')
        Setting.set_setting('marketing_mention_only', 'false')
        Setting.set_setting('staff_ai_angry_mode', 'turbo')
        bot._MARKETING_RECENT.clear()
        bot._GROUP_CONVERSATIONS.clear()
        bot._BLACKLIST_WARNED.clear()
        # Faol suhbat: 2+ xabar (turbo proaktiv shart)
        bot._track_group_conversation('-100111', 'birinchi gap')
        bot._track_group_conversation('-100111', 'ikkinchi gap')

    def test_proactive_reply_when_gate_off(self):
        msg = FakeMessage()
        context = SimpleNamespace(bot=FakeBot())
        self.assertTrue(bot._mention_only_enabled() is False)
        with mock.patch('apps.security.staff_ai.marketing_reply',
                        return_value={'ok': True, 'answer': 'gapga javob'}), \
             mock.patch('bot.random.random', return_value=0.0):
            asyncio.run(bot._marketing_group_reply(
                None, context, 'nima gap', msg, make_user(), triggered=False))
        self.assertEqual(len(msg.replies), 1)


class TriggerDetectionTests(TransactionTestCase):
    """staff_ai_handler — qaysi xabar "eslatish" hisoblanishini tekshiradi.

    Guruhda bot FAQAT shu holatlarda javob beradi: reply-to-bot, @mention,
    "donzo" so'zi (gap boshida yoki ichida) va qora ro'yxatdagi odam yozganda.
    """

    def setUp(self):
        cache.clear()
        Setting.clear_cache()
        Setting.set_setting('marketing_group_enabled', 'true')
        Setting.set_setting('telegram_bot_token', 'fake:token')
        Setting.set_setting('staff_ai_angry_mode', 'gentle')
        Setting.set_setting('security_blacklist', '')
        bot._GROUP_LAST_MSG.clear()
        bot._BLACKLIST_WARNED.clear()

    def _triggered(self, text, reply_to_bot=False):
        captured = {}

        async def fake_reply(update, context, text_, msg, user, triggered):
            captured['triggered'] = triggered

        user = make_user()
        msg = SimpleNamespace(
            chat=SimpleNamespace(id=-100111, title='Gamerlar', type='supergroup'),
            message_id=10, text=text, reply_to_message=None)
        if reply_to_bot:
            msg.reply_to_message = SimpleNamespace(
                from_user=SimpleNamespace(is_bot=True, id=999))
        update = SimpleNamespace(effective_message=msg, effective_user=user)
        context = SimpleNamespace(bot=SimpleNamespace(id=999, username='DONZOROBOT'))
        with mock.patch.object(bot, '_marketing_group_reply', side_effect=fake_reply):
            asyncio.run(bot.staff_ai_handler(update, context))
        return captured.get('triggered')

    def test_plain_message_is_not_a_trigger(self):
        self.assertFalse(self._triggered('narx qancha? kim biladi'))

    def test_donzo_word_anywhere_is_a_trigger(self):
        self.assertTrue(self._triggered('narxni donzoda solishtirsak bo\'ladi'))

    def test_at_mention_is_a_trigger(self):
        self.assertTrue(self._triggered('@DONZOROBOT narx qancha?'))

    def test_reply_to_bot_is_a_trigger(self):
        self.assertTrue(self._triggered('javobingiz uchun rahmat', reply_to_bot=True))


class GroupRoastMentionOnlyTests(TransactionTestCase):
    """Default holatda proaktiv "roast" umuman yozmaydi."""

    def setUp(self):
        cache.clear()
        Setting.clear_cache()
        Setting.set_setting('marketing_roast_enabled', 'true')
        Setting.set_setting('telegram_bot_token', 'fake:token')
        MarketingGroupMember.objects.all().delete()
        bot._GROUP_LAST_MSG.clear()
        bot._GROUP_CONVERSATIONS.clear()
        bot._MARKETING_RECENT.clear()

    def test_roast_silent_by_default(self):
        self.assertTrue(bot._mention_only_enabled() is True)
        bot._record_group_member('-100111', 'player1', 'Player One', 123)
        bot._remember_group_message('-100111', 'player1', 555, "men eng zo'rman")
        bot._track_group_conversation('-100111', 'gap 1')
        bot._track_group_conversation('-100111', 'gap 2')
        sent = []

        def fake_api(token, method, payload):
            sent.append(dict(payload))
            return {'ok': True, 'result': {}}

        with mock.patch.object(bot, '_tg_api', side_effect=fake_api), \
             mock.patch('apps.security.staff_ai.proactive_message',
                        return_value={'ok': True, 'answer': 'javob'}):
            bot._send_group_roast()

        self.assertEqual(sent, [])
