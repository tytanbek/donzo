# -*- coding: utf-8 -*-
"""
BOT ORQALI TASDIQLASH KODI tests — yangi xavfsizlik modeli.

`login-code` va `login-code/verify` endpointlari butunlay o'chirilgan
(SECURITY v2): username-based login har kim admin username'ini kiritib
kirishi mumkin edi (account takeover). Yagona kirish — Telegram WebApp
initData avto-kirishi (initdata-login, HMAC).

  POST /api/v1/auth/login-code/           → 403 (o'chirilgan)
  POST /api/v1/auth/login-code/verify/    → 403 (o'chirilgan)
"""
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.settings_app.models import Setting
from apps.users.models import TelegramLoginCode


class LoginCodeDisabledTests(TestCase):
    """login-code endpointlari o'chirilgan — har qanday so'rov 403."""

    def setUp(self):
        cache.clear()
        Setting.clear_cache()
        Setting.set_setting('fragment_api_key', 'test-key')
        Setting.set_setting('telegram_bot_token', 'test-bot-token')
        self.client = APIClient()
        self.url = '/api/v1/auth/login-code/'
        self.verify_url = '/api/v1/auth/login-code/verify/'

    def test_request_code_disabled_403(self):
        resp = self.client.post(self.url, {'username': 'uz_ultra', 'telegram_id': '123456789'},
                                format='json')
        self.assertEqual(resp.status_code, 403)
        self.assertIn('Telegram', resp.data['detail'])

    def test_request_code_without_telegram_id_disabled_403(self):
        resp = self.client.post(self.url, {'username': 'uz_ultra'}, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_request_code_does_not_create_code(self):
        # O'chirilgan endpoint kod yaratmasligi kerak
        self.client.post(self.url, {'username': 'uz_ultra', 'telegram_id': '123456789'},
                         format='json')
        self.assertFalse(TelegramLoginCode.objects.exists())

    def test_verify_code_disabled_403(self):
        resp = self.client.post(self.verify_url, {'username': 'uz_ultra', 'code': '123456'},
                                format='json')
        self.assertEqual(resp.status_code, 403)

    def test_verify_code_does_not_login(self):
        # O'chirilgan endpoint hech qanday user kiritmaydi
        resp = self.client.post(self.verify_url, {'username': 'uz_ultra', 'code': '123456'},
                                format='json')
        self.assertEqual(resp.status_code, 403)
        from apps.users.models import User
        self.assertFalse(User.objects.filter(username='uz_ultra').exists())