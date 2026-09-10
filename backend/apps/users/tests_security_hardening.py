"""
Xavfsizlik mustahkamlash testlari (security hardening).

  1. username-based login (fragment-login / login-code) butunlay o'chirilgan
     — har qanday so'rov 403 (account takeover himoyasi).
  2. demo-login DEBUG=False da 404.
  3. IDOR: buyurtma faqat egasiga.
"""
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.orders.models import Order, OrderStatus
from apps.services.models import Category, Service, Package
from apps.users.models import User
from apps.settings_app.models import Setting


class UsernameLoginBlockedInProductionTests(TestCase):
    """SECURITY: username-based login yo'llari butunlay o'chirilgan (403)."""

    def setUp(self):
        Setting.clear_cache()
        Setting.set_setting('telegram_bot_token', '123456:TEST-TOKEN')
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='sec_cust', email='sec_cust@tg.user', telegram_username='sec_cust',
            telegram_id='90001',
        )

    def test_fragment_login_blocked_403(self):
        """fragment-login o'chirilgan — haker username bilan kira olmaydi."""
        r = self.client.post('/api/v1/auth/fragment-login/', {'username': 'sec_cust'})
        self.assertEqual(r.status_code, 403)
        self.assertIn('Telegram', r.data['detail'])

    def test_login_code_blocked_403(self):
        """login-code o'chirilgan — Telegram ichida ham, tashqarida ham 403."""
        r = self.client.post('/api/v1/auth/login-code/',
                             {'username': 'sec_cust', 'telegram_id': '90001'})
        self.assertEqual(r.status_code, 403)

    def test_login_code_verify_blocked_403(self):
        r = self.client.post('/api/v1/auth/login-code/verify/',
                             {'username': 'sec_cust', 'code': '123456'})
        self.assertEqual(r.status_code, 403)

    def test_blocked_endpoints_never_create_users_or_codes(self):
        """O'chirilgan endpointlar hech qanday user/kod yaratmaydi."""
        self.client.post('/api/v1/auth/fragment-login/', {'username': 'ghost_user'})
        self.client.post('/api/v1/auth/login-code/', {'username': 'ghost_user', 'telegram_id': '1'})
        self.assertFalse(User.objects.filter(username='ghost_user').exists())
        from apps.users.models import TelegramLoginCode
        self.assertFalse(TelegramLoginCode.objects.exists())


class DemoLoginBlockedTests(TestCase):
    """SECURITY: demo-login production'da 404."""

    @override_settings(DEBUG=False)
    def test_demo_login_404_in_production(self):
        r = APIClient().post('/api/v1/auth/demo-login/', {'role': 'admin'})
        self.assertEqual(r.status_code, 404)

    @override_settings(DEBUG=True)
    def test_demo_login_works_in_debug(self):
        r = APIClient().post('/api/v1/auth/demo-login/', {'role': 'customer'})
        self.assertEqual(r.status_code, 200)


class OrderIDORProtectionTests(TestCase):
    """SECURITY: IDOR — buyurtma faqat egasi ko'ra oladi."""

    def setUp(self):
        self.cat, _ = Category.objects.get_or_create(slug='idor-cat', defaults={'name': 'I'})
        self.svc, _ = Service.objects.get_or_create(
            slug='idor-svc', defaults={'name': 'S', 'category': self.cat, 'is_active': True},
        )
        self.pkg, _ = Package.objects.get_or_create(
            service=self.svc, name='P',
            defaults={'amount_label': 'P', 'price': '10000'},
        )
        self.owner = User.objects.create_user(
            username='idor_owner', email='idor_owner@tg.user', telegram_id='80001',
        )
        self.other = User.objects.create_user(
            username='idor_other', email='idor_other@tg.user', telegram_id='80002',
        )
        self.order = Order.objects.create(
            customer=self.owner, service=self.svc, package=self.pkg,
            customer_name='x', customer_telegram='x',
            total_price='10000', status=OrderStatus.PENDING, payment_status='unpaid',
        )
        self.client = APIClient()

    def test_other_user_cannot_read_foreign_order(self):
        self.client.force_authenticate(self.other)
        r = self.client.get(f'/api/v1/orders/{self.order.id}/')
        self.assertEqual(r.status_code, 404)  # "No Order matches"

    def test_owner_reads_own_order(self):
        self.client.force_authenticate(self.owner)
        r = self.client.get(f'/api/v1/orders/{self.order.id}/')
        self.assertEqual(r.status_code, 200)

    def test_other_user_cannot_update_foreign_order(self):
        self.client.force_authenticate(self.other)
        r = self.client.patch(f'/api/v1/orders/{self.order.id}/', {'status': 'completed'})
        self.assertIn(r.status_code, (403, 404, 405))