# -*- coding: utf-8 -*-
"""
TELEGRAM WEBAPP INITDATA LOGIN tests (REAL LOGIN — yagona kirish yo'li).

`fragment-login` va `login-code` endpointlari xavfsizlik uchun o'chirilgan
(403). Endi yagona kirish — Telegram WebApp initData avto-kirishi:
back-end HMAC-SHA256 bilan bot token yordamida initData imzosini tasdiqlaydi.

  POST /api/v1/auth/initdata-login/  {init_data}
"""
import hashlib
import hmac
import urllib.parse

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.settings_app.models import Setting
from apps.users.models import User

BOT_TOKEN = '123456789:TEST-TOKEN-abcdefghijklmnop'
SUPER_ADMIN_TG_ID = '2007554600'


def _make_initdata(token: str, user_payload: dict, extra: dict | None = None) -> str:
    """Haqiqiy Telegram imzosi bilan initData qurish (HMAC-SHA256).

    Telegram rasmiy hujjati bo'yicha:
      1. check_string = sort(qiymatlar), har biri <key>=<value>, \n bilan.
         (check_string DECODE qilingan qiymatlar ustida quriladi —
         backend _urldecode qilib, o'sha qiymatlar bilan HMAC solishtiradi)
      2. secret_key = HMAC_SHA256(key='WebAppData', msg=bot_token).
      3. hash = HMAC_SHA256(key=secret_key, msg=check_string) → HEX.
    So'nggi initData string: har qiymat URL-encode qilinib & bilan birlashadi.
    """
    import json as _json
    user_json = _json.dumps(user_payload, separators=(',', ':'))
    raw = {
        'user': user_json,
        'auth_date': str(extra.get('auth_date', '1700000000')) if extra else '1700000000',
        'query_id': str(extra.get('query_id', 'AAF-test-query')) if extra else 'AAF-test-query',
    }
    if extra and extra.get('hash_value') is not None:
        raw['hash'] = extra['hash_value']
        encoded = {k: urllib.parse.quote(str(v), safe='') for k, v in raw.items()}
        return '&'.join(f'{k}={v}' for k, v in encoded.items())
    # check_string: DECODE qiymatlar bilan (backend ham shunday qiladi)
    check_string = '\n'.join(f'{k}={v}' for k, v in sorted(raw.items()))
    secret = hmac.new(b'WebAppData', token.encode(), hashlib.sha256).digest()
    digest = hmac.new(secret, check_string.encode(), hashlib.sha256).hexdigest()
    raw['hash'] = digest
    # URL-encode: user JSON'dagi maxsus belgilar (%{}=:...) encode qilinadi
    encoded = {k: urllib.parse.quote(str(v), safe='') for k, v in raw.items()}
    return '&'.join(f'{k}={v}' for k, v in encoded.items())


class InitDataLoginTests(TestCase):
    def setUp(self):
        cache.clear()
        Setting.clear_cache()
        Setting.set_setting('telegram_bot_token', BOT_TOKEN)
        self.client = APIClient()
        self.url = '/api/v1/auth/initdata-login/'

    def _login(self, user_payload, extra=None):
        init_data = _make_initdata(BOT_TOKEN, user_payload, extra)
        return self.client.post(self.url, {'init_data': init_data}, format='json')

    # ── MUVaffaqiyatli kirish ──

    def test_valid_initdata_logs_in_new_user(self):
        resp = self._login({'id': 123456789, 'first_name': 'Test', 'username': 'test_user'})
        self.assertEqual(resp.status_code, 200)
        data = resp.data
        self.assertIn('access', data)
        self.assertIn('refresh', data)
        self.assertEqual(data['user']['username'], 'test_user')
        self.assertEqual(data['user']['role'], 'customer')
        user = User.objects.get(telegram_id='123456789')
        self.assertEqual(user.telegram_username, 'test_user')
        self.assertEqual(user.first_name, 'Test')

    def test_existing_user_keeps_role(self):
        existing = User.objects.create_user(
            username='operator_user', email='op@donzo.user',
            telegram_id='555666', role='operator',
        )
        resp = self._login({'id': 555666, 'first_name': 'Op', 'username': 'operator_user'})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['user']['id'], existing.pk)
        self.assertEqual(resp.data['user']['role'], 'operator')

    def test_super_admin_telegram_id_gets_super_admin(self):
        Setting.set_setting('super_admin_telegram_id', SUPER_ADMIN_TG_ID)
        resp = self._login({'id': int(SUPER_ADMIN_TG_ID), 'first_name': 'Owner'})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['user']['role'], 'super_admin')

    # ── XAVFSIZLIK: noto'g'ri imzo rad etiladi ──

    def test_invalid_signature_rejected(self):
        # Boshqa token bilan imzolangan — backend BOT_TOKEN bilan tasdiqlaydi
        init_data = _make_initdata('000000000:WRONG-TOKEN-xxxxxxxxxxxxxxxx', {'id': 123456789})
        resp = self.client.post(self.url, {'init_data': init_data}, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_missing_hash_rejected(self):
        params = {'user': urllib.parse.quote('{"id":123456789,"first_name":"X"}'),
                  'auth_date': '1700000000'}
        resp = self.client.post(self.url, {'init_data': urllib.parse.urlencode(params)}, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_empty_init_data_400(self):
        resp = self.client.post(self.url, {'init_data': ''}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_no_user_payload_rejected(self):
        # user id bo'sh — kirish rad etiladi (foydalanuvchi ma'lumoti yo'q)
        init_data = _make_initdata(BOT_TOKEN, {'id': '', 'first_name': ''})
        resp = self.client.post(self.url, {'init_data': init_data}, format='json')
        self.assertEqual(resp.status_code, 403)

    # ── O'chirilgan eski login yo'llari ──

    def test_fragment_login_disabled_403(self):
        resp = self.client.post('/api/v1/auth/fragment-login/',
                                {'username': 'test_user'}, format='json')
        self.assertEqual(resp.status_code, 403)
        self.assertIn('Telegram', resp.data['detail'])

    def test_login_code_disabled_403(self):
        resp = self.client.post('/api/v1/auth/login-code/',
                                {'username': 'test_user', 'telegram_id': '123456789'}, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_login_code_verify_disabled_403(self):
        resp = self.client.post('/api/v1/auth/login-code/verify/',
                                {'username': 'test_user', 'code': '123456'}, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_demo_login_blocked_in_production(self):
        from django.test import override_settings
        with override_settings(DEBUG=False):
            resp = self.client.post('/api/v1/auth/demo-login/', {'role': 'admin'}, format='json')
            self.assertEqual(resp.status_code, 404)


class InitDataLoginThrottleTests(TestCase):
    """initdata-login — brute-force himoyasi (ScopedRateThrottle)."""

    def setUp(self):
        cache.clear()
        Setting.clear_cache()
        Setting.set_setting('telegram_bot_token', BOT_TOKEN)
        self.client = APIClient()

    def test_throttle_scope_set(self):
        from apps.users import views
        self.assertEqual(views.initdata_login.view_class.throttle_scope, 'telegram_auth')

    def test_many_requests_throttled(self):
        # 25 ta so'rov — telegram_auth limiti 20/min. Limit oshgach 429.
        from django.test import override_settings
        codes = []
        with override_settings(REST_FRAMEWORK={
            'DEFAULT_THROTTLE_CLASSES': [],
            'DEFAULT_THROTTLE_RATES': {'telegram_auth': '20/min'},
        }):
            for i in range(25):
                resp = self.client.post(
                    '/api/v1/auth/initdata-login/',
                    {'init_data': 'bad-data-%d' % i}, format='json')
                codes.append(resp.status_code)
        self.assertIn(429, codes)
        # Yomon imzo bilan so'rovlar 403 qaytaradi (HMAC rad etildi) —
        # lekin limit tugagach 429 chiqishi kerak (brute-force himoyasi).
        self.assertEqual(codes[0], 403)