"""
CSV eksport xavfsizligi testlari.

Nima tekshiriladi:
  • buzuq / yaroqsiz havola kaliti 500 emas, TOZA JSON 401 qaytaradi
    (avval bu yerda UnboundLocalError → HTML 500 sahifasi bo'lgan);
  • muddati o'tgan imzolangan havola 401;
  • havola berilgandan keyin ham huquq qayta tekshiriladi (rol olib
    qo'yilgan / bloklangan foydalanuvchi yuklab olmaydi);
  • oddiy mijoz hech qanday yo'l bilan eksport qila olmaydi;
  • eski `?token=<JWT>` yo'li butunlay o'chirilgan.
"""
from django.contrib.auth import get_user_model
from django.core import signing
from django.test import TestCase
from rest_framework.test import APIClient

from apps.payments.export_orders import EXPORT_LINK_SALT

User = get_user_model()

# Barcha eksport yo'llari `/api/v1/` ostida mount qilingan.
API_PREFIX = '/api/v1'


class ExportOrdersTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username='exp_admin', email='exp_admin@test.local', role='admin',
        )
        self.customer = User.objects.create_user(
            username='exp_customer', email='exp_customer@test.local',
        )
        self.admin_client = APIClient()
        self.admin_client.force_authenticate(user=self.admin)
        self.customer_client = APIClient()
        self.customer_client.force_authenticate(user=self.customer)

    def _link(self, payload=None):
        resp = self.admin_client.post('/api/v1/export/orders/link/',
                                      payload or {}, format='json')
        self.assertEqual(resp.status_code, 200)
        return resp.json()

    # ── Header autentifikatsiya ──────────────────────────────────────────
    def test_admin_can_export_with_header_auth(self):
        resp = self.admin_client.get('/api/v1/export/orders/csv/')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('text/csv', resp['Content-Type'])

    def test_customer_cannot_export(self):
        resp = self.customer_client.get('/api/v1/export/orders/csv/')
        self.assertEqual(resp.status_code, 403)

    def test_anonymous_cannot_export(self):
        resp = APIClient().get('/api/v1/export/orders/csv/')
        self.assertEqual(resp.status_code, 401)

    # ── Imzolangan havola oqimi ─────────────────────────────────────────
    def test_admin_gets_short_lived_link_without_jwt_in_url(self):
        body = self._link({'status': 'pending'})
        self.assertTrue(body['url'].startswith('/export/orders/csv/download/?key='))
        self.assertEqual(body['expires_in'], 120)
        # Admin access tokeni URL'da ko'chib yurmasligi SHART.
        self.assertNotIn('access_token', body['url'])
        self.assertNotIn('token=', body['url'])

    def test_signed_link_downloads_csv(self):
        # Havola API ildiziga nisbatan qaytadi (frontend `apiUrl()` bilan
        # `/api/v1` ni qo'shadi) — shuning uchun test ham to'liq yo'lni oladi.
        url = API_PREFIX + self._link()['url']
        resp = APIClient().get(url)  # imzolangan kalitning o'zi ruxsatnoma
        self.assertEqual(resp.status_code, 200)
        self.assertIn('text/csv', resp['Content-Type'])

    def test_garbage_key_returns_clean_401(self):
        resp = APIClient().get('/api/v1/export/orders/csv/download/?key=deadbeef')
        self.assertEqual(resp.status_code, 401)
        self.assertEqual(resp['Content-Type'].split(';')[0], 'application/json')
        self.assertNotIn(b'Server Error', resp.content)

    def test_missing_key_returns_401(self):
        resp = APIClient().get('/api/v1/export/orders/csv/download/')
        self.assertEqual(resp.status_code, 401)

    def test_expired_link_is_rejected(self):
        key = signing.dumps({'user_id': self.admin.pk, 'status': ''},
                            salt=EXPORT_LINK_SALT)
        url = f'/api/v1/export/orders/csv/download/?key={key}'
        self.assertEqual(APIClient().get(url).status_code, 200)

        import apps.payments.export_orders as ex
        original = ex.EXPORT_LINK_MAX_AGE
        ex.EXPORT_LINK_MAX_AGE = -1  # muddati o'tgan holat
        try:
            resp = APIClient().get(url)
            self.assertEqual(resp.status_code, 401)
        finally:
            ex.EXPORT_LINK_MAX_AGE = original

    def test_link_of_demoted_admin_is_refused(self):
        url = API_PREFIX + self._link()['url']
        self.admin.role = 'customer'
        self.admin.save(update_fields=['role'])
        self.assertEqual(APIClient().get(url).status_code, 403)

    def test_link_of_inactive_user_is_refused(self):
        url = API_PREFIX + self._link()['url']
        self.admin.is_active = False
        self.admin.save(update_fields=['is_active'])
        self.assertEqual(APIClient().get(url).status_code, 403)

    def test_customer_cannot_create_link(self):
        resp = self.customer_client.post('/api/v1/export/orders/link/', {},
                                         format='json')
        self.assertEqual(resp.status_code, 403)

    def test_legacy_jwt_in_url_endpoint_is_gone(self):
        resp = APIClient().get('/api/v1/export/orders/csv/token/?token=x')
        self.assertEqual(resp.status_code, 404)
