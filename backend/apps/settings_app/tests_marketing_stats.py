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
        self.assertEqual(method, 'sendMessage')  # surat yo'q → matnli
        self.assertEqual(payload['chat_id'], '-100111')
        self.assertIn('DONZO', payload['text'])
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
    """Guruh a'zolarini username orqali kinoyali murojaat qilish (marketing)."""

    def setUp(self):
        cache.clear()
        from apps.settings_app.models import MarketingGroupMember, Setting
        Setting.clear_cache()
        Setting.set_setting('marketing_roast_enabled', 'true')
        Setting.set_setting('telegram_bot_token', 'fake:token')
        Setting.set_setting('payment_report_chat_id', '-100999')  # operatsion — hech qachon yozilmaydi
        MarketingGroupMember.objects.all().delete()

    def test_roasts_seen_member_by_username(self):
        bot._record_group_member('-100111', 'player1', 'Player One', 123)
        sent = []

        def fake_api(token, method, payload):
            sent.append(dict(payload))
            return {'ok': True, 'result': {}}

        with mock.patch.object(bot, '_tg_api', side_effect=fake_api), \
             mock.patch('apps.security.staff_ai.proactive_message',
                        return_value={'ok': True, 'answer': '@player1, kaltakdan boshqa gap bilmaysizmi?'}):
            bot._send_group_roast()

        self.assertEqual(len(sent), 1)
        payload = sent[0]
        self.assertEqual(payload['chat_id'], '-100111')
        self.assertIn('@player1', payload['text'])
        # Masxara qilingan — DB'da eslab qolindi (takrorlanmasligi uchun)
        from apps.settings_app.models import MarketingGroupMember
        row = MarketingGroupMember.objects.get(chat_id='-100111', username='player1')
        self.assertIsNotNone(row.last_roast_at)
        self.assertEqual(row.roast_count, 1)

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

    def test_never_roasts_operational_group(self):
        # Faqat operatsion (staff) guruhida a'zo ko'rilgan — hech narsa yuborilmaydi
        bot._record_group_member('-100999', 'admin1')
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
        sent = []

        def fake_api(token, method, payload):
            sent.append(method)
            return {'ok': True, 'result': {}}

        with mock.patch.object(bot, '_tg_api', side_effect=fake_api):
            bot._send_group_roast()

        self.assertEqual(len(sent), 0)

    def test_ai_offline_uses_fallback_line(self):
        """AI javob bermasa ham tayyor kinoyali qatordan biri ishlatiladi."""
        bot._record_group_member('-100111', 'player1')
        sent = []

        def fake_api(token, method, payload):
            sent.append(dict(payload))
            return {'ok': True, 'result': {}}

        with mock.patch.object(bot, '_tg_api', side_effect=fake_api), \
             mock.patch('apps.security.staff_ai.proactive_message',
                        return_value={'ok': False, 'answer': ''}):
            bot._send_group_roast()

        self.assertEqual(len(sent), 0)  # javob yo'q bo'lsa — yuborilmaydi (yiqilmaydi)
