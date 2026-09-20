"""
Multi-account (bir IP — bir nechta akkaunt) anti-fraud testlari.

Tekshiriladi:
  • login paytida IP ↔ akkaunt juftligi yoziladi va login_count oshadi;
  • ichki (private/loopback) IP'lar kuzatilmaydi;
  • bitta akkaunt — ogohlantirish yo'q;
  • ikkinchi akkaunt xuddi shu IP'dan kirsa — admin Telegram ogohlantirishi
    yuboriladi va SecurityAlert yozuvi paydo bo'ladi;
  • ogohlantirish 12 soat davomida takrorlanmaydi (spam bo'lmasin);
  • ogohlantirish yuborilmasa ham login oqimi buzilmaydi.
"""
from unittest import mock

from django.core.cache import cache
from django.test import TestCase

from apps.security.models import SecurityAlert
from apps.users.ip_tracking import is_public_ip, record_login_ip, shared_ip_clusters
from apps.users.models import LoginIPMap, User


class FakeRequest:
    """Minimal request: faqat META kerak."""

    def __init__(self, ip='213.230.93.180', ua='Mozilla/5.0 (Linux; Android 14)'):
        self.META = {
            'HTTP_X_FORWARDED_FOR': ip,
            'REMOTE_ADDR': ip,
            'HTTP_USER_AGENT': ua,
        }


class PublicIPTests(TestCase):
    def test_private_and_loopback_are_not_tracked(self):
        for ip in ['127.0.0.1', '10.0.0.5', '192.168.1.7', '::1', '172.16.4.4', '', 'nope']:
            self.assertFalse(is_public_ip(ip), ip)

    def test_public_ips_are_tracked(self):
        for ip in ['213.230.93.180', '8.8.8.8', '2a00:1450:4001:81b::200e']:
            self.assertTrue(is_public_ip(ip), ip)


class LoginIPMapTests(TestCase):
    def setUp(self):
        cache.clear()
        self.ua = 'Mozilla/5.0 (Linux; Android 14)'
        self.user_a = User.objects.create_user(
            username='multi_a', email='multi_a@test.local',
            telegram_id='9000001', telegram_username='multi_a',
        )
        self.user_b = User.objects.create_user(
            username='multi_b', email='multi_b@test.local',
            telegram_id='9000002', telegram_username='multi_b',
        )

    def test_single_account_is_recorded_without_alert(self):
        with mock.patch('apps.users.ip_tracking._send_telegram_alert', return_value=1) as send:
            result = record_login_ip(self.user_a, FakeRequest(ua=self.ua))
        self.assertEqual(result['ip'], '213.230.93.180')
        self.assertEqual(result['shared'], [])
        send.assert_not_called()
        row = LoginIPMap.objects.get(user=self.user_a)
        self.assertEqual(row.login_count, 1)
        self.assertIn('Android', row.device)

    def test_private_ip_creates_no_row(self):
        record_login_ip(self.user_a, FakeRequest(ip='192.168.0.10'))
        self.assertFalse(LoginIPMap.objects.exists())

    def test_repeat_login_increments_counter(self):
        record_login_ip(self.user_a, FakeRequest())
        record_login_ip(self.user_a, FakeRequest())
        row = LoginIPMap.objects.get(user=self.user_a, ip_address='213.230.93.180')
        self.assertEqual(row.login_count, 2)

    def test_second_account_same_ip_triggers_alert_once(self):
        with mock.patch('apps.users.ip_tracking._send_telegram_alert', return_value=1) as send:
            record_login_ip(self.user_a, FakeRequest(ua=self.ua))
            result = record_login_ip(self.user_b, FakeRequest(ua=self.ua))

        self.assertEqual(len(result['shared']), 1)
        self.assertEqual(result['shared'][0]['username'], 'multi_a')
        self.assertTrue(result['alerted'])
        self.assertEqual(send.call_count, 1)
        text = send.call_args[0][0]
        self.assertIn('213.230.93.180', text)
        self.assertIn('KUCHLI', text)  # bir xil qurilma
        self.assertTrue(SecurityAlert.objects.exists())

    def test_alert_is_throttled_for_12_hours(self):
        with mock.patch('apps.users.ip_tracking._send_telegram_alert', return_value=1) as send:
            record_login_ip(self.user_a, FakeRequest())
            record_login_ip(self.user_b, FakeRequest())
            record_login_ip(self.user_b, FakeRequest())  # takroriy login
        self.assertEqual(send.call_count, 1)

    def test_alert_throttle_expires(self):
        with mock.patch('apps.users.ip_tracking._send_telegram_alert', return_value=1) as send:
            record_login_ip(self.user_a, FakeRequest())
            record_login_ip(self.user_b, FakeRequest())
            cache.clear()  # throttled kalit yo'qoldi
            record_login_ip(self.user_b, FakeRequest())
        self.assertEqual(send.call_count, 2)

    def test_alert_failure_does_not_break_login(self):
        with mock.patch('apps.users.ip_tracking._send_telegram_alert',
                        side_effect=RuntimeError('telegram down')):
            record_login_ip(self.user_a, FakeRequest())
            # Modul o'zi yutadi — istisno ko'tarilmaydi
            result = record_login_ip(self.user_b, FakeRequest())
        self.assertEqual(result['ip'], '213.230.93.180')

    def test_shared_ip_clusters_report(self):
        record_login_ip(self.user_a, FakeRequest())
        record_login_ip(self.user_b, FakeRequest())
        clusters = shared_ip_clusters()
        self.assertEqual(len(clusters), 1)
        self.assertEqual(clusters[0]['ip_address'], '213.230.93.180')
        self.assertEqual(clusters[0]['accounts_count'], 2)
        usernames = {a['username'] for a in clusters[0]['accounts']}
        self.assertEqual(usernames, {'multi_a', 'multi_b'})


class SharedIPApiTests(TestCase):
    """/api/v1/admin/security/shared-ips/ — faqat admin ko'radi."""

    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user(
            username='shared_admin', email='shared_admin@test.local', role='admin',
        )
        self.customer = User.objects.create_user(
            username='shared_customer', email='shared_customer@test.local',
        )

    def test_customer_is_blocked(self):
        from rest_framework.test import APIClient

        client = APIClient()
        client.force_authenticate(user=self.customer)
        resp = client.get('/api/v1/admin/security/shared-ips/')
        self.assertEqual(resp.status_code, 403)

    def test_admin_sees_clusters(self):
        from rest_framework.test import APIClient

        a = User.objects.create_user(username='ipc_a', email='ipc_a@test.local')
        b = User.objects.create_user(username='ipc_b', email='ipc_b@test.local')
        record_login_ip(a, FakeRequest())
        record_login_ip(b, FakeRequest())

        client = APIClient()
        client.force_authenticate(user=self.admin)
        resp = client.get('/api/v1/admin/security/shared-ips/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['count'], 1)
        self.assertEqual(data['clusters'][0]['ip_address'], '213.230.93.180')
