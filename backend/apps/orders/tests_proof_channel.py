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

    @mock.patch('apps.orders.proof_channel.send_text', return_value=True)
    def test_sends_test_message(self, send):
        _configure()
        res = self.client.post(self.url, {}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data['ok'])
        self.assertEqual(send.call_args.args[0], '-1001234567890')

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
