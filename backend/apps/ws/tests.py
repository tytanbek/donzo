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

    def test_bot_activity_block_reports_update_counters(self):
        from unittest import mock

        fake = {
            'started_at': '2026-09-30T07:55:00+00:00',
            'last_activity': '2026-09-30T08:00:00+00:00',
            'restarts': 3,
            'updates_handled': 41,
            'messages_sent': 40,
            'commands': {'start': 5, 'reklama': 9},
            'token_status': {'valid': True, 'username': 'DONZOROBOT'},
            'polling_errors': [{'ts': 'x', 'kind': 'conflict_409', 'message': 'y'}],
        }
        with mock.patch('bot_stats.read_bot_stats', return_value=fake):
            resp = self._diag()
        self.assertEqual(resp.status_code, 200)
        act = resp.json()['bot_activity']
        self.assertNotIn('error', act)
        self.assertEqual(act['updates_handled'], 41)
        self.assertEqual(act['token_valid'], True)
        self.assertEqual(list(act['top_commands'])[0], 'reklama')
        self.assertEqual(len(act['polling_errors']), 1)

    def test_bot_activity_block_never_breaks_the_snapshot(self):
        from unittest import mock

        with mock.patch('bot_stats.read_bot_stats', side_effect=OSError('yo`q')):
            resp = self._diag()
        self.assertEqual(resp.status_code, 200)
        self.assertIn('error', resp.json()['bot_activity'])


class HealthCheckSupervisorStateTests(TestCase):
    """`/health/` supervisor qarorini heartbeat'dan ustun qo'yishi kerak.

    Crash-loop'dagi user-client worker har restart'da yangi heartbeat yozadi;
    faqat heartbeat'ga qaralsa /health/ uni yana "ok" deb ko'rsatardi
    ("bazida heartbeat ochib qolayapti").
    """

    def setUp(self):
        from django.core.cache import cache

        from apps.settings_app.models import Setting
        cache.clear()
        Setting.clear_cache()

    def _set(self, key, value):
        from apps.settings_app.models import Setting
        Setting.set_setting(key, value)

    def _fresh_uc_heartbeat(self):
        from django.utils import timezone
        self._set('user_client_worker_heartbeat_at', timezone.now().isoformat())

    def test_fresh_heartbeat_with_crash_loop_is_stale(self):
        import json

        self._fresh_uc_heartbeat()
        self._set('svc_state_userclient', json.dumps({
            'status': 'waiting_restart', 'rc': 4, 'restarts': 391,
            'backoff_s': 300,
        }))

        body = self.client.get('/health/').json()
        self.assertEqual(body['user_client'], 'stale')
        self.assertIn('waiting_restart', body['user_client_error'])
        self.assertEqual(body['user_client_state']['restarts'], 391)
        self.assertLess(body['user_client_age_s'], 180)  # heartbeat YANGI edi

    def test_running_worker_with_fresh_heartbeat_is_ok(self):
        import json

        self._fresh_uc_heartbeat()
        self._set('svc_state_userclient', json.dumps({'status': 'running', 'pid': 31}))

        body = self.client.get('/health/').json()
        self.assertEqual(body['user_client'], 'ok')
        self.assertIsNone(body['user_client_error'])

    def test_missing_state_keeps_the_old_verdict(self):
        # svc_state yo'q (lokal/dev yoki eski deploy) — heartbeat mantiq
        # o'zgarmaydi, ya'ni soxta qizil signal paydo bo'lmaydi.
        self._fresh_uc_heartbeat()
        body = self.client.get('/health/').json()
        self.assertEqual(body['user_client'], 'ok')
        self.assertIsNone(body['user_client_error'])
