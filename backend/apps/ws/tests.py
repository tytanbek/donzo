"""
Live-session WebSocket consumer tests (DEMO MODE).

Login tizimi olib tashlangani uchun auth view'lar endi telegram_session
push qilmaydi — faqat OrderConsumer'ning telegram_session handler'i sinov
qilinadi (admin "Jonli sessiyalar" ekrani o'z poll fallback'iga ega).
"""
import json
import asyncio

from django.test import TestCase


class SessionConsumerHandlerTests(TestCase):
    """OrderConsumer.telegram_session forwards the event to the client."""

    def test_handler_emits_json_message(self):
        from apps.ws.consumers import OrderConsumer

        consumer = OrderConsumer()
        received = []

        async def fake_send(text_data):
            received.append(json.loads(text_data))

        consumer.send = fake_send  # type: ignore[method-assign]

        asyncio.run(consumer.telegram_session({
            'type': 'telegram_session',
            'session': {'id': 99, 'telegram_id': 'demo', 'is_authenticated': True},
        }))

        self.assertEqual(len(received), 1)
        msg = received[0]
        self.assertEqual(msg['type'], 'telegram_session')
        self.assertEqual(msg['session']['id'], 99)
        self.assertIn('timestamp', msg)


class DiagStateTests(TestCase):
    """`/internal/diag/` — marketing bloki xatosiz va kunlik limit ko'rinadi.

    Bu blok bir marta `timezone.localdate()` (moduldagi stdlib `datetime.timezone`
    bilan to'qnashuv) sababli yiqilib, `marketing: {error: ...}` bo'lib qolgan
    edi — ya'ni monitoring snapshot'i jim ishlamay qolgan edi. Shu sabab
    testda xato maydoni YO'Qligi va bugungi reklama soni hisoblanishi
    tekshiriladi.
    """

    def setUp(self):
        from django.core.cache import cache

        from apps.settings_app.models import Setting
        cache.clear()
        Setting.clear_cache()

    def _diag(self):
        from unittest import mock

        with mock.patch('apps.ws.views._diag_token', return_value='test-token'):
            return self.client.get('/internal/diag/', HTTP_X_DIAG_TOKEN='test-token')

    def test_marketing_block_has_no_error_and_counts_today(self):
        from apps.settings_app.models import MarketingGroupStat, Setting
        Setting.set_setting('marketing_ads_per_day', '2')
        MarketingGroupStat.record('-100111', 'Gamerlar', 'ad')

        resp = self._diag()
        self.assertEqual(resp.status_code, 200)
        marketing = resp.json()['marketing']
        self.assertNotIn('error', marketing)
        self.assertEqual(marketing['ads_per_day'], 2)
        by_id = {g['chat_id']: g for g in marketing['groups']}
        self.assertEqual(by_id['-100111']['ads_today'], 1)

    def test_marketing_block_without_groups(self):
        resp = self._diag()
        self.assertEqual(resp.status_code, 200)
        marketing = resp.json()['marketing']
        self.assertNotIn('error', marketing)
        self.assertEqual(marketing['groups'], [])
        self.assertEqual(marketing['totals']['ads'], 0)
