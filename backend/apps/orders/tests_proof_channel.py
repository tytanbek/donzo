"""Isbot kanali: bajarilgan buyurtmalar Telegram kanalga yuboriladi."""
from unittest import mock

from django.test import TestCase
from rest_framework.test import APIClient

from apps.orders import proof_channel
from apps.orders.models import Order, OrderStatus
from apps.services.models import Category, Package, Service
from apps.settings_app.models import Setting
from apps.users.models import Role, User


def _configure(enabled='True', chat_id='-1001234567890'):
    Setting.set_setting('proof_channel_enabled', enabled)
    Setting.set_setting('proof_channel_id', chat_id)
    Setting.set_setting('telegram_bot_token', '123:TEST')
    Setting.set_setting('telegram_bot_username', 'DONZOROBOT')


class ProofChannelTests(TestCase):
    def setUp(self):
        cat = Category.objects.create(name='Games', slug='games-proof')
        self.svc = Service.objects.create(name='PUBG Mobile', slug='pubg-proof', category=cat)
        self.pkg = Package.objects.create(service=self.svc, name='660 UC', price=110000)
        self.order = Order.objects.create(
            service=self.svc, package=self.pkg,
            customer_name='Abdulloh', customer_telegram='@abdulloh_tg',
            field_values={'game_id': '5123456789'},
        )

    def _complete(self, order=None):
        order = order or self.order
        order.status = OrderStatus.COMPLETED
        with self.captureOnCommitCallbacks(execute=True):
            order.save()

    def test_message_masks_customer_data(self):
        text = proof_channel.build_proof_message(self.order)
        self.assertIn('BUYURTMA BAJARILDI', text)
        self.assertIn('PUBG Mobile', text)
        self.assertIn('660 UC', text)
        self.assertIn("110 000 so'm", text)
        self.assertIn('Ab***h', text)
        self.assertIn('51***9', text)
        self.assertNotIn('Abdulloh', text)
        self.assertNotIn('abdulloh_tg', text)
        self.assertNotIn('5123456789', text)

    def test_message_escapes_html(self):
        self.order.customer_name = '<b>x</b>yz'
        text = proof_channel.build_proof_message(self.order)
        self.assertNotIn('<b>x</b>', text)

    @mock.patch('apps.orders.proof_channel.threading.Thread')
    @mock.patch('apps.orders.proof_channel.send_text', return_value=True)
    def test_completed_order_is_posted_once(self, send, thread):
        thread.side_effect = lambda target, daemon: mock.Mock(start=target)
        _configure()
        self._complete()
        self.assertEqual(send.call_count, 1)
        chat_id, token, text, markup = send.call_args.args
        self.assertEqual(chat_id, '-1001234567890')
        self.assertEqual(token, '123:TEST')
        self.assertIn(self.order.order_number, text)
        self.assertEqual(markup['inline_keyboard'][0][0]['url'], 'https://t.me/DONZOROBOT')

        # Qayta saqlash (status o'zgarmagan) — ikkinchi xabar yuborilmaydi
        with self.captureOnCommitCallbacks(execute=True):
            self.order.save()
        self.assertEqual(send.call_count, 1)

    @mock.patch('apps.orders.proof_channel.send_text', return_value=True)
    def test_not_posted_when_disabled_or_not_completed(self, send):
        _configure(enabled='False')
        self._complete()
        _configure()
        other = Order.objects.create(service=self.svc, package=self.pkg,
                                     customer_name='Ali', customer_telegram='@ali')
        other.status = OrderStatus.CANCELLED
        with self.captureOnCommitCallbacks(execute=True):
            other.save()
        send.assert_not_called()

    @mock.patch('apps.orders.proof_channel.send_text', side_effect=RuntimeError('down'))
    def test_send_failure_never_raises(self, _send):
        _configure()
        self.assertFalse(proof_channel.post_order_proof(self.order))


class ProofChannelTestEndpointTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username='proofadmin', email='proofadmin@example.com',
            password='x-strong-pass-1', role=Role.ADMIN,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.url = '/api/v1/admin/proof-channel/test/'

    @mock.patch('apps.orders.proof_channel.send_text_verbose', return_value=(True, ''))
    def test_sends_test_message(self, send):
        _configure()
        res = self.client.post(self.url, {}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data['ok'])
        self.assertEqual(send.call_args.args[0], '-1001234567890')


    @mock.patch('apps.orders.proof_channel.send_text_verbose',
                return_value=(False, 'Telegram: Bad Request: chat not found'))
    def test_reports_telegram_error(self, _send):
        _configure()
        res = self.client.post(self.url, {}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('chat not found', res.data['detail'])

    def test_requires_channel_id(self):
        _configure(chat_id='')
        res = self.client.post(self.url, {}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_customer_cannot_use_it(self):
        user = User.objects.create_user(
            username='cust', email='cust@example.com',
            password='x-strong-pass-1', role=Role.CUSTOMER,
        )
        client = APIClient()
        client.force_authenticate(user)
        self.assertEqual(client.post(self.url, {}, format='json').status_code, 403)

    def test_settings_accept_new_keys(self):
        res = self.client.put('/api/v1/admin/settings/', {
            'proof_channel_enabled': 'True', 'proof_channel_id': '@donzo_isbot',
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(Setting.get_setting('proof_channel_id'), '@donzo_isbot')


class ProofChannelSenderTests(TestCase):
    def _resp(self, payload):
        resp = mock.Mock(status=200)
        resp.read.return_value = __import__('json').dumps(payload).encode()
        return resp

    @mock.patch('apps.orders.proof_channel._IPv4HTTPSConnection')
    def test_success(self, conn_cls):
        conn_cls.return_value.getresponse.return_value = self._resp({'ok': True})
        self.assertEqual(proof_channel.send_text_verbose('-100', 'T', 'hi'), (True, ''))
        conn_cls.assert_called_once_with('api.telegram.org', 443, timeout=proof_channel.SEND_TIMEOUT)

    @mock.patch('apps.orders.proof_channel._IPv4HTTPSConnection')
    def test_retries_once_on_timeout(self, conn_cls):
        conn = conn_cls.return_value
        conn.request.side_effect = [TimeoutError(), None]
        conn.getresponse.return_value = self._resp({'ok': True})
        self.assertEqual(proof_channel.send_text_verbose('-100', 'T', 'hi'), (True, ''))
        self.assertEqual(conn_cls.call_count, 2)

    @mock.patch('apps.orders.proof_channel._IPv4HTTPSConnection')
    def test_gives_up_after_two_timeouts(self, conn_cls):
        conn_cls.return_value.request.side_effect = TimeoutError()
        ok, detail = proof_channel.send_text_verbose('-100', 'T', 'hi')
        self.assertFalse(ok)
        self.assertIn('TimeoutError', detail)
        self.assertEqual(conn_cls.call_count, proof_channel.SEND_ATTEMPTS)

    @mock.patch('apps.orders.proof_channel._IPv4HTTPSConnection')
    def test_telegram_rejection_is_not_retried(self, conn_cls):
        conn_cls.return_value.getresponse.return_value = self._resp(
            {'ok': False, 'description': 'Forbidden: bot is not a member of the channel chat'})
        ok, detail = proof_channel.send_text_verbose('-100', 'T', 'hi')
        self.assertFalse(ok)
        self.assertIn('not a member', detail)
        self.assertEqual(conn_cls.call_count, 1)

    @mock.patch('apps.orders.proof_channel.socket.create_connection')
    @mock.patch('apps.orders.proof_channel.socket.getaddrinfo',
                return_value=[(2, 1, 6, '', ('149.154.167.220', 443))])
    def test_connection_uses_ipv4_only(self, gai, create):
        conn = proof_channel._IPv4HTTPSConnection('api.telegram.org', 443, timeout=5)
        conn._context = mock.Mock()
        conn.connect()
        self.assertEqual(gai.call_args.args[2], proof_channel.socket.AF_INET)
        create.assert_called_once_with(('149.154.167.220', 443), 5)
        conn._context.wrap_socket.assert_called_once_with(
            create.return_value, server_hostname='api.telegram.org')
