"""Growth avtomatikasi: narx e'lonlari, kunlik hisobot, eslatmalar, referal, ochiq API."""
from datetime import datetime, timedelta
from unittest import mock
from zoneinfo import ZoneInfo

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.orders.models import Order, OrderStatus
from apps.services.models import Category, Package, Service
from apps.settings_app import growth
from apps.settings_app.models import CustomerReminder, PriceAnnouncement, Setting
from apps.users.models import Role, User

TASHKENT = ZoneInfo('Asia/Tashkent')


def _channel_on():
    Setting.set_setting('proof_channel_enabled', 'True')
    Setting.set_setting('proof_channel_id', '@donzo_isbot')
    Setting.set_setting('telegram_bot_token', '123:TEST')
    Setting.set_setting('telegram_bot_username', 'DONZOROBOT')


class BaseGrowth(TestCase):
    def setUp(self):
        Setting.clear_cache()   # jarayon ichidagi 3s kesh testlar orasida o'tib qolmasin
        cat = Category.objects.create(name='Games', slug='games-growth')
        self.svc = Service.objects.create(name='PUBG Mobile', slug='pubg-growth', category=cat)
        self.pkg = Package.objects.create(service=self.svc, name='60 UC', price=12000)

    def _order(self, status=OrderStatus.COMPLETED, customer=None, ago=None):
        o = Order.objects.create(service=self.svc, package=self.pkg, customer=customer,
                                 customer_name='A', customer_telegram='@a', status=status)
        if ago is not None:
            Order.objects.filter(pk=o.pk).update(created_at=timezone.now() - ago,
                                                 updated_at=timezone.now() - ago)
        return o


class PriceAnnouncementTests(BaseGrowth):
    def test_price_change_queued_and_flushed_once(self):
        _channel_on()
        self.pkg.price = 11500
        self.pkg.save()
        self.pkg.price = 11000          # ikkinchi tahrir — bitta qatorga jamlanadi
        self.pkg.save()
        self.assertEqual(PriceAnnouncement.objects.count(), 2)

        with mock.patch.object(growth, '_send', return_value=True) as send:
            self.assertFalse(growth.flush_price_announcements())        # hali "tinch" emas
            later = timezone.now() + timedelta(seconds=growth.PRICE_QUIET_SECONDS + 1)
            self.assertTrue(growth.flush_price_announcements(now=later))
            self.assertFalse(growth.flush_price_announcements(now=later))  # takror yo'q
        text = send.call_args.args[2]
        self.assertIn("<s>12 000</s> → <b>11 000 so'm</b> 📉", text)
        self.assertEqual(text.count('60 UC'), 1)

    def test_no_queue_when_channel_off_or_alerts_disabled(self):
        self.pkg.price = 9000
        self.pkg.save()
        _channel_on()
        Setting.set_setting('proof_channel_price_alerts', 'False')
        self.pkg.price = 8000
        self.pkg.save()
        self.assertEqual(PriceAnnouncement.objects.count(), 0)

    def test_unchanged_price_not_announced(self):
        _channel_on()
        self.pkg.name = '60 UC (yangi)'
        self.pkg.save()
        self.assertEqual(PriceAnnouncement.objects.count(), 0)


class DailyReportTests(BaseGrowth):
    def test_report_sent_once_after_time_and_skipped_when_empty(self):
        _channel_on()
        now_local = datetime.now(TASHKENT).replace(hour=21, minute=5)
        with mock.patch.object(growth, '_send', return_value=True) as send:
            self.assertFalse(growth.send_daily_report_if_due(now_local))   # bugun buyurtma yo'q
            send.assert_not_called()

        Setting.set_setting('proof_channel_daily_last', '')
        self._order()
        early = now_local.replace(hour=20)
        with mock.patch.object(growth, '_send', return_value=True) as send:
            self.assertFalse(growth.send_daily_report_if_due(early))
            with mock.patch.object(growth, 'daily_report_text', wraps=growth.daily_report_text):
                self.assertTrue(growth.send_daily_report_if_due(now_local))
            self.assertFalse(growth.send_daily_report_if_due(now_local))   # kuniga bir marta
        self.assertEqual(send.call_count, 1)
        self.assertIn('Bajarilgan buyurtmalar: <b>1 ta</b>', send.call_args.args[2])
        self.assertIn('🥇 PUBG Mobile — 1 ta', send.call_args.args[2])


class ReminderTests(BaseGrowth):
    def setUp(self):
        super().setUp()
        Setting.set_setting('telegram_bot_token', '123:TEST')
        self.user = User.objects.create_user(username='old', email='old@example.com', password='x-strong-pass-1',
                                             role=Role.CUSTOMER, telegram_id='5001', first_name='Ali')
        self._order(customer=self.user, ago=timedelta(days=20))
        self.noon = datetime.now(TASHKENT).replace(hour=12, minute=0)

    def test_sends_personal_reminder_once_per_cooldown(self):
        with mock.patch.object(growth, '_send', return_value=True) as send:
            self.assertEqual(growth.send_due_reminders(self.noon), 1)
            self.assertEqual(growth.send_due_reminders(self.noon), 0)   # 30 kun cooldown
        chat_id, _, text, markup = send.call_args.args
        self.assertEqual(chat_id, '5001')
        self.assertIn('Salom, <b>Ali</b>', text)
        self.assertIn('PUBG Mobile', text)
        self.assertIn("12 000 so'm", text)
        self.assertEqual(markup['inline_keyboard'][1][0]['callback_data'], growth.REMIND_OFF_CALLBACK)

    def test_respects_opt_out_hours_recency_and_switch(self):
        with mock.patch.object(growth, '_send', return_value=True) as send:
            self.assertEqual(growth.send_due_reminders(self.noon.replace(hour=8)), 0)   # erta
            Setting.set_setting('marketing_reminders_enabled', 'False')
            self.assertEqual(growth.send_due_reminders(self.noon), 0)
            Setting.set_setting('marketing_reminders_enabled', 'True')
            growth.opt_out('5001')
            self.assertEqual(growth.send_due_reminders(self.noon), 0)
        send.assert_not_called()

    def test_recent_buyers_and_non_buyers_skipped(self):
        self._order(customer=self.user)                                # yaqinda xarid qildi
        never = User.objects.create_user(username='never', email='n@example.com', password='x-strong-pass-1',
                                         role=Role.CUSTOMER, telegram_id='5002')
        self._order(customer=never, status=OrderStatus.CANCELLED, ago=timedelta(days=40))
        self.assertEqual(growth.reminder_candidates(10), [])

    def test_daily_limit(self):
        Setting.set_setting('marketing_reminders_per_day', '0')
        with mock.patch.object(growth, '_send', return_value=True) as send:
            self.assertEqual(growth.send_due_reminders(self.noon), 0)
        send.assert_not_called()
        self.assertFalse(CustomerReminder.objects.exists())


class ReferralTextTests(BaseGrowth):
    def test_link_stats_and_share_button(self):
        Setting.set_setting('telegram_bot_username', 'DONZOROBOT')
        ref = User.objects.create_user(username='ref', email='ref@example.com', password='x-strong-pass-1',
                                       role=Role.CUSTOMER, telegram_id='6001')
        friend = User.objects.create_user(username='fr', email='fr@example.com', password='x-strong-pass-1',
                                          role=Role.CUSTOMER, telegram_id='6002', referred_by=ref)
        self._order(customer=friend)
        text, markup = growth.referral_text(ref)
        self.assertIn(f'https://t.me/DONZOROBOT?start=ref_{ref.referral_code}', text)
        self.assertIn('Taklif qilganlar: <b>1 ta</b>', text)
        self.assertIn('Xarid qilganlar: <b>1 ta</b>', text)
        self.assertTrue(markup['inline_keyboard'][0][0]['url'].startswith('https://t.me/share/url?url='))

    def test_unknown_user(self):
        text, markup = growth.referral_text(None)
        self.assertIsNone(markup)


class PublicEndpointTests(BaseGrowth):
    def test_top_services_counts_real_completed_sales_per_period(self):
        cat = Category.objects.get(slug='games-growth')
        ff = Service.objects.create(name='Free Fire', slug='ff-growth', category=cat)
        ff_pkg = Package.objects.create(service=ff, name='100 D', price=7000)
        for _ in range(2):
            Order.objects.create(service=ff, package=ff_pkg, customer_name='A', customer_telegram='@a',
                                 status=OrderStatus.COMPLETED)
        self._order()
        self._order(status=OrderStatus.CANCELLED)
        self._order(ago=timedelta(days=3))                 # haftada bor, bugun yo'q
        c = APIClient()
        week = c.get('/api/v1/services/top/?period=week').data['results']
        self.assertEqual([(r['name'], r['sold']) for r in week], [('Free Fire', 2), ('PUBG Mobile', 2)])
        today = c.get('/api/v1/services/top/?period=today').data['results']
        self.assertEqual({r['name']: r['sold'] for r in today}, {'Free Fire': 2, 'PUBG Mobile': 1})

    def test_public_stats(self):
        _channel_on()
        self._order()
        data = APIClient().get('/api/v1/services/stats/').data
        self.assertEqual(data['completed_7d'], 1)
        self.assertEqual(data['proof_channel'], 'donzo_isbot')
        self.assertEqual(data['bot_username'], 'DONZOROBOT')

    def test_slug_route_still_works(self):
        self.assertEqual(APIClient().get('/api/v1/services/pubg-growth/').status_code, 200)
