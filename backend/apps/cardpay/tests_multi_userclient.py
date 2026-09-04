# -*- coding: utf-8 -*-
"""Extra Telethon monitor accounts (UserClientAccount, slot >= 2)."""
from unittest import mock

from django.test import TestCase

from apps.cardpay import user_client_auth as uca
from apps.cardpay.models import UserClientAccount


class MultiUserClientTests(TestCase):
    def test_next_free_slot_starts_at_2(self):
        self.assertEqual(UserClientAccount.next_free_slot(), 2)
        UserClientAccount.objects.create(slot=2)
        self.assertEqual(UserClientAccount.next_free_slot(), 3)
        UserClientAccount.objects.create(slot=4)
        self.assertEqual(UserClientAccount.next_free_slot(), 3)

    def test_create_and_list_accounts(self):
        with mock.patch.object(uca, 'get_status', return_value={'authorized': True}):
            res = uca.create_account('Zaxira A')
            self.assertTrue(res['ok'])
            self.assertEqual(res['slot'], 2)
            listing = uca.list_accounts()
        slots = [a['slot'] for a in listing['accounts']]
        self.assertIn(1, slots)          # legacy always present
        self.assertIn(2, slots)
        self.assertTrue(listing['accounts'][0]['legacy'])

    def test_slot_session_files_are_isolated(self):
        s1, l1 = uca._slot_session_files(1)
        s2, l2 = uca._slot_session_files(2)
        self.assertTrue(s1.endswith('donzo_user.session'))
        self.assertTrue(s2.endswith('donzo_user_2.session'))
        self.assertNotEqual(s1, s2)
        self.assertNotEqual(l1, l2)

    def test_slot_state_keys_are_isolated(self):
        k1 = uca._slot_state_keys(1)
        k2 = uca._slot_state_keys(2)
        self.assertEqual(k1[0], 'user_client_login_phone')
        self.assertEqual(k2[0], 'user_client_login_phone_2')
        self.assertEqual(len(set(k1) & set(k2)), 0)

    def test_login_state_does_not_leak_between_slots(self):
        uca._set_login_state('+998901112233', 'hash2', False, slot=2)
        p1, _, _ = uca._get_login_state(1)
        p2, h2, _ = uca._get_login_state(2)
        self.assertEqual(p1, '')             # slot 1 untouched
        self.assertEqual(p2, '+998901112233')
        self.assertEqual(h2, 'hash2')

    def test_store_session_b64_writes_to_row_for_extra_slot(self):
        UserClientAccount.objects.create(slot=2)
        ok = uca._store_session_b64('QUJD', slot=2)
        self.assertTrue(ok)
        row = UserClientAccount.objects.get(slot=2)
        self.assertEqual(row.session_b64, 'QUJD')
        self.assertTrue(row.authorized)

    def test_delete_and_toggle_extra_slot(self):
        UserClientAccount.objects.create(slot=2, session_b64='x', authorized=True)
        with mock.patch.object(uca, '_kill_worker_crossplatform') as kill, \
             mock.patch.object(uca, '_restart_worker'):
            uca.set_enabled(2, False)
            self.assertFalse(UserClientAccount.objects.get(slot=2).enabled)
            kill.assert_called_with(2)
            uca.delete_account(2)
        self.assertFalse(UserClientAccount.objects.filter(slot=2).exists())

    def test_cannot_delete_legacy_slot(self):
        res = uca.delete_account(1)
        self.assertFalse(res['ok'])

    def test_restart_flag_is_per_slot(self):
        self.assertTrue(uca._slot_restart_flag(1).endswith('.restart_requested'))
        self.assertTrue(uca._slot_restart_flag(3).endswith('.restart_requested_3'))
