"""
Marketing statistika testlari.

Covers:
  • MarketingGroupStat.record — reply/ad/join hisoblagichlari + daily
  • MarketingStatsView — admin API: guruhlar, totals, 14 kunlik daily
  • _send_daily_marketing — kunlik suratli reklama (kuniga bir marta)
"""
from datetime import timedelta
from unittest import mock

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.users.models import User
from apps.settings_app.models import MarketingDailyStat, MarketingGroupStat
import bot  # bot.py — django.setup() idempotent, import qilish xavfsiz


class MarketingGroupStatTests(TestCase):
    def test_record_increments_counters_and_daily(self):
        MarketingGroupStat.record('-100111', 'Gamerlar', 'reply')
        MarketingGroupStat.record('-100111', 'Gamerlar', 'reply')
        MarketingGroupStat.record('-100111', 'Gamerlar', 'ad')
        MarketingGroupStat.record('-100222', 'PUBG Club', 'join')

        g1 = MarketingGroupStat.objects.get(chat_id='-100111')
        self.assertEqual(g1.replies_count, 2)
        self.assertEqual(g1.ads_count, 1)
        self.assertEqual(g1.joins_count, 0)
        self.assertIsNotNone(g1.last_reply_at)
        self.assertEqual(g1.chat_title, 'Gamerlar')

        g2 = MarketingGroupStat.objects.get(chat_id='-100222')
        self.assertEqual(g2.joins_count, 1)
        self.assertEqual(g2.replies_count, 0)

        daily = MarketingDailyStat.objects.get(day=timezone.localdate())
        self.assertEqual(daily.replies_count, 2)
        self.assertEqual(daily.ads_count, 1)
        self.assertEqual(daily.joins_count, 1)

    def test_record_never_raises_on_bad_input(self):
        # Hech qanday holatda xato tashlamasligi kerak (bot oqimi buzilmaydi)
        MarketingGroupStat.record(None, None, 'bogus_event')
        MarketingGroupStat.record('', '', 'reply')
        # Xato tashlanmadi — qatorlar yaratildi (None va '' alohida chat_id sifatida)
        self.assertEqual(MarketingGroupStat.objects.count(), 2)
        self.assertEqual(MarketingDailyStat.objects.count(), 1)


class MarketingStatsViewTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username='admin', email='admin@test.uz', password='x',
            role='super_admin', is_staff=True, is_superuser=True,
        )
        self.client.force_authenticate(user=self.admin)

    def test_view_returns_groups_totals_and_14_days(self):
        MarketingGroupStat.record('-100111', 'Gamerlar', 'reply')
        MarketingGroupStat.record('-100111', 'Gamerlar', 'reply')
        MarketingGroupStat.record('-100111', 'Gamerlar', 'ad')
        MarketingGroupStat.record('-100222', 'PUBG Club', 'join')
        # Eski kunlik qator (14 kun ichida) — grafikda ko'rinishi kerak
        old_day = timezone.localdate() - timedelta(days=5)
        MarketingDailyStat.objects.update_or_create(
            day=old_day, defaults={'replies_count': 3, 'ads_count': 1, 'joins_count': 0},
        )

        resp = self.client.get('/api/v1/admin/marketing-stats/')
        self.assertEqual(resp.status_code, 200)
        body = resp.json()

        self.assertEqual(body['totals']['groups'], 2)
        self.assertEqual(body['totals']['replies'], 2)
        self.assertEqual(body['totals']['ads'], 1)
        self.assertEqual(body['totals']['joins'], 1)

        by_id = {g['chat_id']: g for g in body['groups']}
        self.assertEqual(by_id['-100111']['replies_count'], 2)
        self.assertEqual(by_id['-100222']['joins_count'], 1)

        self.assertEqual(len(body['daily']), 14)
        days = {d['day'] for d in body['daily']}
        self.assertIn(old_day.isoformat(), days)
        old_entry = next(d for d in body['daily'] if d['day'] == old_day.isoformat())
        self.assertEqual(old_entry['replies_count'], 3)

    def test_view_requires_admin(self):
        customer = User.objects.create_user(
            username='cust', email='c@test.uz', password='x', role='customer',
        )
        client = APIClient()
        client.force_authenticate(user=customer)
        resp = client.get('/api/v1/admin/marketing-stats/')
        self.assertIn(resp.status_code, (403, 401))


class DailyMarketingTests(TestCase):
    def setUp(self):
        cache.clear()
        from apps.settings_app.models import Setting
        Setting.clear_cache()  # in-process TTL cache — testlar orasida tozalanadi
        Setting.set_setting('marketing_daily_enabled', 'true')
        Setting.set_setting('marketing_daily_time', '09:00')
        Setting.set_setting('marketing_daily_image', '')
        Setting.set_setting('telegram_bot_token', 'fake:token')
        Setting.set_setting('payment_report_chat_id', '-100999')  # operatsion — o'tkazib yuboriladi
        MarketingGroupStat.objects.create(chat_id='-100111', chat_title='Gamerlar')
        MarketingGroupStat.objects.create(chat_id='-100999', chat_title='Staff')

    def _freeze_now(self, hh=9, mm=5):
        from datetime import datetime
        from zoneinfo import ZoneInfo
        return datetime(2026, 8, 17, hh, mm, tzinfo=ZoneInfo('Asia/Tashkent'))

    def test_sends_photo_to_marketing_groups_once_per_day(self):
        from apps.settings_app.models import Setting
        sent = []

        def fake_api(token, method, payload):
            sent.append((method, dict(payload)))
            return {'ok': True, 'result': {}}

        with mock.patch.object(bot, '_tg_api', side_effect=fake_api), \
             mock.patch.object(bot, '_tashkent_now', return_value=self._freeze_now()):
            bot._send_daily_marketing()

        # Operatsion guruh (-100999) o'tkazib yuborildi; faqat -100111 ga yuborildi
        self.assertEqual(len(sent), 1)
        method, payload = sent[0]
        # Kod endi default DONZO reklama rasmi bilan yuboradi (surat yo'q bo'lsa ham)
        self.assertEqual(method, 'sendPhoto')
        self.assertEqual(payload['chat_id'], '-100111')
        self.assertIn('DONZO', payload['caption'])
        self.assertEqual(Setting.get_setting('marketing_daily_last', ''),
                         self._freeze_now().strftime('%Y-%m-%d'))

    def test_never_sends_twice_same_day(self):
        from apps.settings_app.models import Setting
        Setting.set_setting('marketing_daily_last', self._freeze_now().strftime('%Y-%m-%d'))
        sent = []

        def fake_api(token, method, payload):
            sent.append(method)
            return {'ok': True, 'result': {}}

        with mock.patch.object(bot, '_tg_api', side_effect=fake_api), \
             mock.patch.object(bot, '_tashkent_now', return_value=self._freeze_now()):
            bot._send_daily_marketing()

        self.assertEqual(len(sent), 0)  # bugun allaqachon yuborilgan

    def test_disabled_does_nothing(self):
        from apps.settings_app.models import Setting
        Setting.set_setting('marketing_daily_enabled', 'false')
        sent = []

        def fake_api(token, method, payload):
            sent.append(method)
            return {'ok': True, 'result': {}}

        with mock.patch.object(bot, '_tg_api', side_effect=fake_api), \
             mock.patch.object(bot, '_tashkent_now', return_value=self._freeze_now()):
            bot._send_daily_marketing()

        self.assertEqual(len(sent), 0)


class GroupRoastTests(TestCase):
    """Suhbatga qo'shilish: BELGILAMASDAN, aytilgan gapga reply qilib javob.

    Eski xulq (a'zolarni @username bilan ommaviy belgilab yozish) YO'Q:
    DONZO faqat shu suhbatda haqiqatan yozgan odamning xabariga reply qilib,
    o'sha gapni chaynab tashlaydigan javob yozadi.
    """

    def setUp(self):
        cache.clear()
        from apps.settings_app.models import MarketingGroupMember, Setting
        Setting.clear_cache()
        Setting.set_setting('marketing_roast_enabled', 'true')
        Setting.set_setting('telegram_bot_token', 'fake:token')
        Setting.set_setting('payment_report_chat_id', '-100999')  # operatsion — hech qachon yozilmaydi
        MarketingGroupMember.objects.all().delete()
        bot._GROUP_LAST_MSG.clear()
        bot._GROUP_CONVERSATIONS.clear()
        bot._MARKETING_RECENT.clear()

    def _speak(self, chat_id, username, mid, text):
        """Guruhda odam gap aytdi: xabar eslab qolinadi + suhbat faollashadi."""
        bot._remember_group_message(chat_id, username, mid, text)
        bot._track_group_conversation(chat_id, text)
        bot._track_group_conversation(chat_id, 'yana bir gap')

    def test_replies_to_last_speaker_without_any_mention(self):
        bot._record_group_member('-100111', 'player1', 'Player One', 123)
        self._speak('-100111', 'player1', 555, "men eng zo'r o'yinchiman")
        sent = []
        prompts = []

        def fake_api(token, method, payload):
            sent.append(dict(payload))
            return {'ok': True, 'result': {}}

        def fake_proactive(username, mock=False, their_text='', context=''):
            prompts.append({'username': username, 'mock': mock,
                            'their_text': their_text, 'context': context})
            return {'ok': True,
                    'answer': '@player1, gaping oqsoqol gapiga o\'xshamaydi 😏'}

        with mock.patch.object(bot, '_tg_api', side_effect=fake_api), \
             mock.patch('apps.security.staff_ai.proactive_message',
                        side_effect=fake_proactive):
            bot._send_group_roast()

        self.assertEqual(len(sent), 1)
        payload = sent[0]
        self.assertEqual(payload['chat_id'], '-100111')
        # @belgilash YO'Q — ommaviy ping bo'lmaydi
        self.assertNotIn('@', payload['text'])
        self.assertIn('player1', payload['text'])
        # @ o'rniga REPLY — aynan o'sha odamning o'sha gapiga
        self.assertEqual(payload['reply_to_message_id'], 555)
        self.assertTrue(payload['allow_sending_without_reply'])
        # AI ga suhbatdoshNING AYTGAN GAPI berilgan — gapni chaynash uchun
        self.assertEqual(prompts[0]['their_text'], "men eng zo'r o'yinchiman")
        self.assertTrue(prompts[0]['mock'])
        self.assertTrue(prompts[0]['context'])
        # Eslab qolindi — bir odamga tez-tez yozilmasligi uchun
        from apps.settings_app.models import MarketingGroupMember
        row = MarketingGroupMember.objects.get(chat_id='-100111', username='player1')
        self.assertIsNotNone(row.last_roast_at)
        self.assertEqual(row.roast_count, 1)

    def test_never_writes_to_member_who_never_spoke(self):
        # A'zo DB'da bor, lekin bu suhbatda gap aytmagan — BELGILANMAYDI
        bot._record_group_member('-100111', 'player1', 'Player One', 123)
        sent = []

        def fake_api(token, method, payload):
            sent.append(dict(payload))
            return {'ok': True, 'result': {}}

        with mock.patch.object(bot, '_tg_api', side_effect=fake_api), \
             mock.patch('apps.security.staff_ai.proactive_message',
                        return_value={'ok': True, 'answer': 'salom'}):
            bot._send_group_roast()

        self.assertEqual(sent, [])

    def test_quiet_group_gets_nothing(self):
        # Bitta xabar — suhbat faol emas: DONZO jim turadi
        bot._record_group_member('-100111', 'player1')
        bot._remember_group_message('-100111', 'player1', 777, 'salom')
        sent = []

        def fake_api(token, method, payload):
            sent.append(dict(payload))
            return {'ok': True, 'result': {}}

        with mock.patch.object(bot, '_tg_api', side_effect=fake_api), \
             mock.patch('apps.security.staff_ai.proactive_message',
                        return_value={'ok': True, 'answer': 'salom'}):
            bot._send_group_roast()

        self.assertEqual(sent, [])

    def test_stale_message_gets_nothing(self):
        # Xabar juda eski (90 daqiqadan oshgan) — endi javob yozilmaydi
        bot._record_group_member('-100111', 'player1')
        self._speak('-100111', 'player1', 888, 'kechagi gap')
        for rec in bot._GROUP_LAST_MSG['-100111'].values():
            rec['ts'] -= 4 * 3600
        sent = []

        def fake_api(token, method, payload):
            sent.append(dict(payload))
            return {'ok': True, 'result': {}}

        with mock.patch.object(bot, '_tg_api', side_effect=fake_api), \
             mock.patch('apps.security.staff_ai.proactive_message',
                        return_value={'ok': True, 'answer': 'salom'}):
            bot._send_group_roast()

        self.assertEqual(sent, [])

    def test_strip_pings_removes_mentions(self):
        # AI baribir @yozib qo'ysa — yuborishdan oldin olib tashlanadi
        self.assertEqual(bot._strip_pings('@player1, gaping zaif'),
                         'player1, gaping zaif')
        self.assertEqual(bot._strip_pings('gap shu. @ali gapirma'),
                         'gap shu. ali gapirma')
        # Email/manzil ichidagi @ tegilmaydi
        self.assertEqual(bot._strip_pings('mail info@donzo.uz'),
                         'mail info@donzo.uz')

    def test_members_persist_in_db(self):
        """A'zolar DB'da saqlanadi — bot restart bo'lsa ham eslab qoladi."""
        from apps.settings_app.models import MarketingGroupMember
        bot._record_group_member('-100111', 'player1', 'Player One', 123)
        # Xotiradagi narsa yo'q — faqat DB manba
        self.assertEqual(MarketingGroupMember.objects.filter(chat_id='-100111', username='player1').count(), 1)
        row = MarketingGroupMember.objects.get(chat_id='-100111', username='player1')
        self.assertEqual(row.first_name, 'Player One')
        self.assertEqual(row.user_id, 123)
        # Takroriy ko'rinish — bitta qator, yangi last_seen
        bot._record_group_member('-100111', 'player1')
        self.assertEqual(MarketingGroupMember.objects.filter(chat_id='-100111', username='player1').count(), 1)

    def test_cooldown_blocks_repeat_answer(self):
        # Shu odamga yaqinda javob yozilgan — yana yozilmaydi (zeriktirmaslik)
        from django.utils import timezone
        from apps.settings_app.models import MarketingGroupMember
        bot._record_group_member('-100111', 'player1', 'Player One', 123)
        MarketingGroupMember.mark_roasted('-100111', 'player1', when=timezone.now())
        self._speak('-100111', 'player1', 999, 'yana men gapirdim')
        sent = []

        def fake_api(token, method, payload):
            sent.append(dict(payload))
            return {'ok': True, 'result': {}}

        with mock.patch.object(bot, '_tg_api', side_effect=fake_api), \
             mock.patch('apps.security.staff_ai.proactive_message',
                        return_value={'ok': True, 'answer': 'salom'}):
            bot._send_group_roast()

        self.assertEqual(sent, [])

    def test_respected_and_owner_users_are_skipped(self):
        from apps.settings_app.models import Setting
        Setting.set_setting('staff_ai_respected_users', 'player1')
        bot._record_group_member('-100111', 'player1')
        self._speak('-100111', 'player1', 101, 'men gapirdim')
        sent = []

        def fake_api(token, method, payload):
            sent.append(dict(payload))
            return {'ok': True, 'result': {}}

        with mock.patch.object(bot, '_tg_api', side_effect=fake_api), \
             mock.patch('apps.security.staff_ai.proactive_message',
                        return_value={'ok': True, 'answer': 'salom'}):
            bot._send_group_roast()

        self.assertEqual(sent, [])

    def test_never_roasts_operational_group(self):
        # Faqat operatsion (staff) guruhida gap aytilgan — hech narsa yuborilmaydi
        bot._record_group_member('-100999', 'admin1')
        self._speak('-100999', 'admin1', 303, 'staff guruhdagi gap')
        sent = []

        def fake_api(token, method, payload):
            sent.append(method)
            return {'ok': True, 'result': {}}

        with mock.patch.object(bot, '_tg_api', side_effect=fake_api), \
             mock.patch('apps.security.staff_ai.proactive_message',
                        return_value={'ok': True, 'answer': 'test'}):
            bot._send_group_roast()

        self.assertEqual(len(sent), 0)

    def test_disabled_does_nothing(self):
        from apps.settings_app.models import Setting
        Setting.set_setting('marketing_roast_enabled', 'false')
        bot._record_group_member('-100111', 'player1')
        self._speak('-100111', 'player1', 404, 'gap aytdim')
        sent = []

        def fake_api(token, method, payload):
            sent.append(method)
            return {'ok': True, 'result': {}}

        with mock.patch.object(bot, '_tg_api', side_effect=fake_api):
            bot._send_group_roast()

        self.assertEqual(len(sent), 0)

    def test_ai_offline_sends_nothing(self):
        """AI javob bermasa — yuborilmaydi (bo'sh xabar ketmaydi)."""
        bot._record_group_member('-100111', 'player1')
        self._speak('-100111', 'player1', 505, 'gap aytdim')
        sent = []

        def fake_api(token, method, payload):
            sent.append(dict(payload))
            return {'ok': True, 'result': {}}

        with mock.patch.object(bot, '_tg_api', side_effect=fake_api), \
             mock.patch('apps.security.staff_ai.proactive_message',
                        return_value={'ok': False, 'answer': ''}):
            bot._send_group_roast()

        self.assertEqual(len(sent), 0)

    def test_latest_speaker_wins(self):
        # Ikki odam gapirgan — eng oxirgi gap egasiga reply qilinadi
        bot._record_group_member('-100111', 'player1')
        bot._record_group_member('-100111', 'player2')
        self._speak('-100111', 'player1', 601, 'birinchi gap')
        self._speak('-100111', 'player2', 602, 'oxirgi gap')
        sent = []

        def fake_api(token, method, payload):
            sent.append(dict(payload))
            return {'ok': True, 'result': {}}

        def fake_proactive(username, mock=False, their_text='', context=''):
            return {'ok': True, 'answer': f'{username} ga javob'}

        with mock.patch.object(bot, '_tg_api', side_effect=fake_api), \
             mock.patch('apps.security.staff_ai.proactive_message',
                        side_effect=fake_proactive):
            bot._send_group_roast()

        self.assertEqual(len(sent), 1)
        self.assertEqual(sent[0]['reply_to_message_id'], 602)
        self.assertIn('player2', sent[0]['text'])
        self.assertNotIn('@', sent[0]['text'])

    def test_last_message_of_helper(self):
        bot._remember_group_message('-100111', 'Player2', 700, 'gapim')
        hit = bot._last_message_of('-100111', {'player2'}, 600)
        self.assertIsNotNone(hit)
        self.assertEqual(hit[0], 700)
        self.assertEqual(hit[1], 'gapim')
        # Begona odam so'ralsa — topilmaydi (yolg'on "sen aytding" bo'lmaydi)
        self.assertIsNone(bot._last_message_of('-100111', {'boshqa'}, 600))
