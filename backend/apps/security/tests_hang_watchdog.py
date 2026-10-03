# -*- coding: utf-8 -*-
"""Qotib qolgan jarayon watchdog siyosati testlari (cloud_launcher uchun)."""
from django.test import SimpleTestCase

from apps.security.hang_watchdog import (
    DEFAULT_MAX_STRIKES,
    evaluate,
    heartbeat_source,
)

BOT_LIMIT = 420  # cloud_launcher.BOT_HANG_SECONDS


class HangWatchdogPolicyTests(SimpleTestCase):
    def test_fresh_heartbeat_never_kills(self):
        strikes, kill = evaluate(15, BOT_LIMIT, 0)
        self.assertEqual(strikes, 0)
        self.assertFalse(kill)

    def test_unknown_heartbeat_never_kills(self):
        # DB o'qilmadi (Neon uzilishi) — jarayonni o'ldirish taqiqlanadi,
        # aks holda DB sekinlashganda hamma servis qayta ishga tushadi.
        strikes, kill = evaluate(None, BOT_LIMIT, DEFAULT_MAX_STRIKES - 1)
        self.assertEqual(strikes, 0)
        self.assertFalse(kill)

    def test_exactly_at_the_limit_is_still_alive(self):
        strikes, kill = evaluate(BOT_LIMIT, BOT_LIMIT, 0)
        self.assertEqual(strikes, 0)
        self.assertFalse(kill)

    def test_kill_only_after_strikes_in_a_row(self):
        strikes = 0
        for probe in range(1, DEFAULT_MAX_STRIKES):
            strikes, kill = evaluate(BOT_LIMIT + 1, BOT_LIMIT, strikes)
            self.assertEqual(strikes, probe)
            self.assertFalse(kill)
        strikes, kill = evaluate(BOT_LIMIT + 1, BOT_LIMIT, strikes)
        self.assertTrue(kill)
        self.assertEqual(strikes, DEFAULT_MAX_STRIKES)

    def test_a_fresh_probe_between_stale_ones_resets_the_counter(self):
        strikes, _ = evaluate(BOT_LIMIT + 60, BOT_LIMIT, 0)
        strikes, _ = evaluate(BOT_LIMIT + 60, BOT_LIMIT, strikes)
        self.assertEqual(strikes, 2)
        strikes, kill = evaluate(5, BOT_LIMIT, strikes)  # qisqa tiklanish
        self.assertEqual(strikes, 0)
        self.assertFalse(kill)

    def test_strike_threshold_is_configurable(self):
        # User Client uchun boshqa chegara ishlatilishi mumkin.
        strikes, kill = evaluate(901, 900, 0, max_strikes=1)
        self.assertTrue(kill)
        self.assertEqual(strikes, 1)


class HeartbeatSourceTests(SimpleTestCase):
    """Har bir servis O'Z heartbeat'iga qaralishi kerak.

    Slot >= 2 workerlari umumiy Settings kalitini umuman yozmaydi (faqat
    o'z UserClientAccount.last_heartbeat'ini). Ularni umumiy kalit bilan
    kuzatish boshqa slotning liveness'ini o'qib, qotib qolgan workerni
    hech qachon o'ldirmasdi.
    """

    def test_bot_watches_the_polling_lock(self):
        self.assertEqual(heartbeat_source('BOT'), ('setting', 'bot_polling_lock'))

    def test_slot_one_worker_watches_the_shared_setting(self):
        # Legacy slot-1 procesi 'USERCLIENT' nomi bilan ro'yxatga olinadi.
        self.assertEqual(
            heartbeat_source('USERCLIENT'),
            ('setting', 'user_client_worker_heartbeat_at'),
        )
        self.assertEqual(
            heartbeat_source('USERCLIENT1'),
            ('setting', 'user_client_worker_heartbeat_at'),
        )

    def test_extra_slots_watch_their_own_account_row(self):
        self.assertEqual(heartbeat_source('USERCLIENT2'), ('account', 2))
        self.assertEqual(heartbeat_source('userclient7'), ('account', 7))

    def test_processes_without_a_heartbeat_are_skipped(self):
        self.assertEqual(heartbeat_source('DAPHNE'), (None, None))
        self.assertEqual(heartbeat_source('USERCLIENTx'), (None, None))
