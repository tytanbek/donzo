"""Guruh huquqlari nazorati testlari.

Asosiy talab: DONZO guruhda ADMIN BO'LMASA ham yoza olishi kerak. Shuning
uchun tekshiriladi:
  • oddiy a'zo (member) → yozish mumkin (admin huquqi shart emas);
  • restricted / chiqarilgan → yozish yo'q, admin ogohlanadi;
  • privacy mode yoqilgan + admin emas → faqat mention/reply ko'radi;
  • admin bo'lsa privacy mode to'sqinlik qilmaydi;
  • ogohlantirish 24 soatda bir marta yuboriladi (spam yo'q).
"""
from unittest import mock

from django.test import TestCase

from apps.settings_app import group_access
from apps.settings_app.models import Setting


class GroupAccessTests(TestCase):
    TOKEN = '123456:FAKE-TOKEN'

    def setUp(self):
        Setting.set_setting('telegram_bot_token', self.TOKEN)
        Setting.set_setting('super_admin_telegram_id', '777')
        Setting.set_setting('payment_report_chat_id', '-100999')
        group_access._report_cache.clear()
        group_access._read_all_cache.clear()

    def _api(self, member, read_all=True, send_ok=True):
        """Fake Bot API: getMe / getChatMember / sendMessage."""
        def fake(token, method, payload):
            if method == 'getMe':
                return {'ok': True, 'result': {
                    'id': 42, 'is_bot': True,
                    'can_read_all_group_messages': read_all,
                }}
            if method == 'getChatMember':
                return {'ok': True, 'result': member}
            if method == 'sendMessage':
                return {'ok': send_ok, 'result': {'message_id': 1} if send_ok else None}
            return {'ok': False}
        return fake

    def test_plain_member_can_write_without_admin(self):
        with mock.patch.object(group_access, 'tg_api',
                               side_effect=self._api({'status': 'member'})):
            rep = group_access.group_access_report(self.TOKEN, '-1001')
        self.assertTrue(rep['can_send'])
        self.assertFalse(rep['is_admin'])
        self.assertTrue(rep['ok'])

    def test_restricted_bot_cannot_write(self):
        with mock.patch.object(group_access, 'tg_api', side_effect=self._api(
                {'status': 'restricted', 'can_send_messages': False})):
            rep = group_access.group_access_report(self.TOKEN, '-1002')
        self.assertFalse(rep['can_send'])
        self.assertFalse(rep['ok'])
        self.assertIn('yubora olmaydi', rep['note'])

    def test_privacy_mode_without_admin_is_flagged(self):
        with mock.patch.object(group_access, 'tg_api',
                               side_effect=self._api({'status': 'member'},
                                                     read_all=False)):
            rep = group_access.group_access_report(self.TOKEN, '-1003')
        self.assertTrue(rep['ok'])            # yozish mumkin...
        self.assertIs(rep['can_read_all'], False)
        self.assertIn('privacy', rep['note'])  # ...lekin hamma xabarni ko'rmaydi

    def test_admin_ignores_privacy_mode(self):
        with mock.patch.object(group_access, 'tg_api', side_effect=self._api(
                {'status': 'administrator', 'can_send_messages': True},
                read_all=False)):
            rep = group_access.group_access_report(self.TOKEN, '-1004')
        self.assertTrue(rep['ok'])
        self.assertTrue(rep['is_admin'])
        self.assertIn('admin', rep['note'])

    def test_warn_is_sent_once_per_day(self):
        with mock.patch.object(group_access, 'tg_api',
                               side_effect=self._api({'status': 'member'})):
            first = group_access.warn_group_access('-1005', 'Guruh', 'muammo')
            second = group_access.warn_group_access('-1005', 'Guruh', 'muammo')
        self.assertTrue(first)
        self.assertFalse(second)  # 24 soat ichida takror yuborilmaydi

    def test_warn_not_sent_when_api_fails(self):
        with mock.patch.object(group_access, 'tg_api',
                               side_effect=self._api({'status': 'member'},
                                                     send_ok=False)):
            self.assertFalse(group_access.warn_group_access('-1006', 'Guruh', 'muammo'))

    def test_operational_groups_are_skipped(self):
        from apps.settings_app.models import MarketingGroupStat
        MarketingGroupStat.record('-100999', 'Hisobot')   # report chat
        MarketingGroupStat.record('-100777', 'O\'yinchilar')
        skip = group_access.marketing_skip_chat_ids()
        self.assertIn('-100999', skip)
        ids = [cid for cid, _ in group_access.marketing_group_ids()]
        self.assertNotIn('-100999', ids)
        self.assertIn('-100777', ids)
