# -*- coding: utf-8 -*-
"""
FRAGMENT LOGIN tests — yangi xavfsizlik modeli.

`fragment-login` endpointi butunlay o'chirilgan (SECURITY v2): username-based
login har kim admin username'ini kiritib kirishi mumkin edi (account takeover).
Yagona kirish — Telegram WebApp initData avto-kirishi (initdata-login, HMAC).

  POST /api/v1/auth/fragment-login/  → 403 (o'chirilgan)
"""
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.settings_app.models import Setting


class FragmentLoginDisabledTests(TestCase):
    """fragment-login endpointi o'chirilgan — har qanday so'rov 403."""

    def setUp(self):
        cache.clear()
        Setting.clear_cache()
        Setting.set_setting('fragment_api_key', 'test-key')
        self.client = APIClient()

    def test_fragment_login_disabled_403(self):
        resp = self.client.post('/api/v1/auth/fragment-login/',
                                {'username': 'test_user'}, format='json')
        self.assertEqual(resp.status_code, 403)
        self.assertIn('Telegram', resp.data['detail'])

    def test_fragment_login_with_telegram_id_disabled_403(self):
        # Telegram ichida bo'lsa ham endpoint o'chirilgan — hamma 403
        resp = self.client.post('/api/v1/auth/fragment-login/',
                                {'username': 'test_user', 'telegram_id': '123456789'},
                                format='json')
        self.assertEqual(resp.status_code, 403)

    def test_fragment_login_no_username_disabled_403(self):
        resp = self.client.post('/api/v1/auth/fragment-login/', {}, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_fragment_login_does_not_create_users(self):
        # O'chirilgan endpoint user yaratmasligi kerak
        resp = self.client.post('/api/v1/auth/fragment-login/',
                                {'username': 'test_user'}, format='json')
        self.assertEqual(resp.status_code, 403)
        from apps.users.models import User
        self.assertFalse(User.objects.filter(username='test_user').exists())