"""Premium guruh reklamasi: faqat haqiqiy ma'lumotlar, to'g'ri format."""
import random

from django.test import TestCase

from apps.orders.models import Order, OrderStatus
from apps.services.models import Category, Package, Service
from apps.settings_app import marketing_ads
from apps.settings_app.models import Setting


class PremiumAdTests(TestCase):
    def setUp(self):
        cat = Category.objects.create(name='Games', slug='games-ad')
        self.pubg = Service.objects.create(name='PUBG Mobile', slug='pubg-ad', category=cat)
        Package.objects.create(service=self.pubg, name='60 UC', price=11000)
        Package.objects.create(service=self.pubg, name='660 UC', price=110000)
        Package.objects.create(service=self.pubg, name='Old', price=500, is_active=False)
        self.ff = Service.objects.create(name='Free Fire', slug='ff-ad', category=cat)
        self.ff_pkg = Package.objects.create(service=self.ff, name='100 D', price=7000)
        hidden = Service.objects.create(name='Hidden', slug='hidden-ad', category=cat, is_active=False)
        Package.objects.create(service=hidden, name='x', price=1)
        Setting.set_setting('telegram_bot_username', 'DONZOROBOT')

    def _complete(self, n, service=None, package=None):
        for _ in range(n):
            Order.objects.create(service=service or self.ff, package=package or self.ff_pkg,
                                 customer_name='A', customer_telegram='@a',
                                 status=OrderStatus.COMPLETED)

    def test_prices_come_from_active_packages_only(self):
        prices = dict(marketing_ads.featured_prices())
        self.assertEqual(float(prices['PUBG Mobile']), 11000)   # 500 lik nofaol paket emas
        self.assertNotIn('Hidden', prices)

    def test_best_sellers_listed_first(self):
        self._complete(3)
        names = [n for n, _ in marketing_ads.featured_prices()]
        self.assertEqual(names[0], 'Free Fire')

    def test_caption_contains_real_prices_and_cta(self):
        caption, markup = marketing_ads.build_premium_ad(random.Random(1))
        self.assertIn("11 000 so'm", caption)
        self.assertIn('@DONZOROBOT', caption)
        self.assertLessEqual(len(caption), marketing_ads.CAPTION_LIMIT)
        self.assertRegex(markup['inline_keyboard'][0][0]['url'], r'^https://t\.me/DONZOROBOT\?start=ad_c[1-4]$')

    def test_social_proof_only_when_real_volume(self):
        caption, _ = marketing_ads.build_premium_ad()
        self.assertNotIn('buyurtma bajarildi', caption)
        self._complete(marketing_ads.MIN_SOCIAL_PROOF)
        caption, _ = marketing_ads.build_premium_ad()
        self.assertIn(f'<b>{marketing_ads.MIN_SOCIAL_PROOF} ta</b> buyurtma bajarildi', caption)

    def test_proof_and_support_buttons(self):
        Setting.set_setting('proof_channel_enabled', 'True')
        Setting.set_setting('proof_channel_id', '@donzo_isbot')
        Setting.set_setting('support_telegram', '@donzo_help')
        rows = marketing_ads.build_reply_markup()['inline_keyboard']
        self.assertEqual(rows[1][0]['url'], 'https://t.me/donzo_isbot')
        self.assertEqual(rows[1][1]['url'], 'https://t.me/donzo_help')

    def test_private_proof_channel_has_no_button(self):
        Setting.set_setting('proof_channel_enabled', 'True')
        Setting.set_setting('proof_channel_id', '-1001234567890')
        Setting.set_setting('support_telegram', '')
        rows = marketing_ads.build_reply_markup()['inline_keyboard']
        self.assertEqual(len(rows), 1)

    def test_long_catalogue_is_trimmed_to_caption_limit(self):
        cat = Category.objects.get(slug='games-ad')
        for i in range(40):
            svc = Service.objects.create(name='X' * 60 + str(i), slug=f'long-{i}', category=cat)
            Package.objects.create(service=svc, name='p', price=1000 + i)
        with self.settings():
            marketing_ads.MAX_FEATURED, old = 40, marketing_ads.MAX_FEATURED
            try:
                caption, _ = marketing_ads.build_premium_ad()
            finally:
                marketing_ads.MAX_FEATURED = old
        self.assertLessEqual(len(caption), marketing_ads.CAPTION_LIMIT)

    def test_html_is_escaped(self):
        cat = Category.objects.get(slug='games-ad')
        svc = Service.objects.create(name='<script>', slug='xss-ad', category=cat)
        Package.objects.create(service=svc, name='p', price=1)
        self._complete(2, service=svc, package=svc.packages.first())
        caption, _ = marketing_ads.build_premium_ad()
        self.assertNotIn('<script>', caption)
        self.assertIn('&lt;script&gt;', caption)

    def test_payload_shapes(self):
        method, payload = marketing_ads.ad_payload('-100', 'https://img/x.png')
        self.assertEqual(method, 'sendPhoto')
        self.assertEqual(payload['parse_mode'], 'HTML')
        fb = marketing_ads.text_fallback(payload)
        self.assertNotIn('photo', fb)
        self.assertEqual(fb['text'], payload['caption'])
        method, payload = marketing_ads.ad_payload('-100')
        self.assertEqual(method, 'sendMessage')


class AdImageTests(TestCase):
    def test_default_images_served_from_mini_app_site(self):
        Setting.set_setting('marketing_daily_image', '')
        Setting.set_setting('web_app_url', 'https://donzo-eight.vercel.app/some/path')
        url = marketing_ads.pick_ad_image(random.Random(0))
        self.assertRegex(url, r'^https://donzo-eight\.vercel\.app/ads/ad-[123]\.jpg$')

    def test_tme_link_falls_back_to_default_site(self):
        Setting.set_setting('marketing_daily_image', '')
        Setting.set_setting('web_app_url', 'https://t.me/DONZOROBOT/app')
        self.assertTrue(marketing_ads.pick_ad_image().startswith(marketing_ads.DEFAULT_SITE + '/ads/'))

    def test_admin_custom_image_wins(self):
        Setting.set_setting('marketing_daily_image', 'https://cdn.example.com/x.png')
        self.assertEqual(marketing_ads.pick_ad_image(), 'https://cdn.example.com/x.png')

    def test_all_images_exist_in_frontend(self):
        from pathlib import Path
        from django.conf import settings
        public = Path(settings.BASE_DIR).parent / 'frontend' / 'public' / 'ads'
        for name in marketing_ads.AD_IMAGE_FILES:
            self.assertTrue((public / name).exists(), name)


class AdV2Tests(TestCase):
    """Spotlight, promokod, lenta va samaradorlikni o'lchash."""

    def setUp(self):
        cat = Category.objects.create(name='Games', slug='games-v2')
        self.pubg = Service.objects.create(name='PUBG Mobile', slug='pubg-mobile', category=cat)
        self.p60 = Package.objects.create(service=self.pubg, name='60 UC', price=11000, order_index=0)
        Package.objects.create(service=self.pubg, name='325 UC', price=55000, order_index=1)
        Setting.set_setting('telegram_bot_username', 'DONZOROBOT')
        Setting.set_setting('marketing_promo_code', '')

    def test_spotlight_lists_packages_with_variant(self):
        caption, markup, variant = marketing_ads.compose_ad(random.Random(0), mode='spotlight')
        self.assertEqual(variant, 's-pubg-mobile')
        self.assertIn('<b>PUBG Mobile</b>', caption)
        self.assertIn("60 UC — <b>11 000 so'm</b>", caption)
        self.assertIn("325 UC — <b>55 000 so'm</b>", caption)
        self.assertTrue(markup['inline_keyboard'][0][0]['url'].endswith('?start=ad_s-pubg-mobile'))

    def test_spotlight_falls_back_to_catalog_without_candidates(self):
        Package.objects.filter(service=self.pubg).exclude(pk=self.p60.pk).update(is_active=False)
        _, _, variant = marketing_ads.compose_ad(random.Random(0), mode='spotlight')
        self.assertRegex(variant, r'^c[1-4]$')

    def _promo(self, **kw):
        from apps.promocodes.models import PromoCode
        data = dict(code='DONZO10', discount_type='percentage', discount_value=10)
        data.update(kw)
        return PromoCode.objects.create(**data)

    def test_promo_shown_only_when_configured_and_valid(self):
        from datetime import timedelta
        from django.utils import timezone
        self._promo(expires_at=timezone.now() + timedelta(days=3))
        caption, _, _ = marketing_ads.compose_ad(random.Random(0), mode='catalog')
        self.assertNotIn('DONZO10', caption)          # sozlanmagan — ko'rsatilmaydi
        Setting.set_setting('marketing_promo_code', 'donzo10')
        caption, _, _ = marketing_ads.compose_ad(random.Random(0), mode='catalog')
        self.assertIn('<code>DONZO10</code> — <b>10%</b> chegirma', caption)
        self.assertIn('gacha', caption)

    def test_expired_or_exhausted_promo_hidden(self):
        from datetime import timedelta
        from django.utils import timezone
        Setting.set_setting('marketing_promo_code', 'DONZO10')
        promo = self._promo(expires_at=timezone.now() - timedelta(hours=1))
        self.assertIsNone(marketing_ads.active_promo())
        promo.expires_at = None
        promo.max_uses, promo.current_uses = 5, 5
        promo.save()
        self.assertIsNone(marketing_ads.active_promo())
        promo.is_active, promo.current_uses = False, 0
        promo.save()
        self.assertIsNone(marketing_ads.active_promo())

    def test_ticker_has_no_customer_data(self):
        Order.objects.create(service=self.pubg, package=self.p60, customer_name='Abdulloh',
                             customer_telegram='@abdulloh_tg', status=OrderStatus.COMPLETED,
                             field_values={'game_id': '5123456789'})
        caption, _, _ = marketing_ads.compose_ad(random.Random(0), mode='catalog')
        self.assertIn('🟢 PUBG Mobile · 60 UC —', caption)
        for secret in ('Abdulloh', 'abdulloh_tg', '5123456789'):
            self.assertNotIn(secret, caption)

    def test_old_orders_not_in_ticker(self):
        from datetime import timedelta
        from django.utils import timezone
        o = Order.objects.create(service=self.pubg, package=self.p60, customer_name='A',
                                 customer_telegram='@a', status=OrderStatus.COMPLETED)
        Order.objects.filter(pk=o.pk).update(updated_at=timezone.now() - timedelta(days=2))
        self.assertEqual(marketing_ads.ticker_lines(), [])

    def test_send_and_start_tracking_and_conversion(self):
        from apps.settings_app.models import AdStart, AdVariantStat
        from apps.users.models import Role, User
        _, payload = marketing_ads.ad_payload('-100', '')
        variant = marketing_ads.record_ad_sent(payload)
        self.assertTrue(variant)
        self.assertEqual(AdVariantStat.objects.get(variant=variant).sends, 1)

        self.assertEqual(marketing_ads.record_ad_start(f'ad_{variant}', 777), variant)
        marketing_ads.record_ad_start(f'ad_{variant}', 777)       # 24 soat ichida takror — sanalmaydi
        self.assertEqual(AdVariantStat.objects.get(variant=variant).starts, 1)
        self.assertEqual(AdStart.objects.count(), 1)

        user = User.objects.create_user(username='buyer', email='buyer@example.com',
                                        password='x-strong-pass-1', role=Role.CUSTOMER, telegram_id='777')
        Order.objects.create(service=self.pubg, package=self.p60, customer=user,
                             customer_name='B', customer_telegram='@b')
        row = next(r for r in marketing_ads.ad_stats() if r['variant'] == variant)
        self.assertEqual(row['orders'], 1)
        self.assertEqual(row['revenue'], 11000.0)
        self.assertEqual(row['start_rate'], 100.0)

    def test_bad_start_params_ignored(self):
        from apps.settings_app.models import AdStart
        for bad in ('ref_ABC', 'ad_', 'ad_<script>', 'ad_' + 'x' * 60):
            self.assertEqual(marketing_ads.record_ad_start(bad, 1), '')
        self.assertEqual(marketing_ads.record_ad_start('ad_c1', ''), '')
        self.assertEqual(AdStart.objects.count(), 0)

    def test_variant_labels(self):
        self.assertTrue(marketing_ads.variant_label('c1').startswith('Katalog: '))
        self.assertEqual(marketing_ads.variant_label('s-pubg-mobile'), 'Spotlight: pubg-mobile')

    def test_caption_always_within_limit(self):
        for i in range(30):
            Package.objects.create(service=self.pubg, name='Z' * 80 + str(i), price=1000 + i, order_index=5 + i)
        Setting.set_setting('marketing_promo_code', 'DONZO10')
        self._promo()
        for seed in range(6):
            caption, _, _ = marketing_ads.compose_ad(random.Random(seed))
            self.assertLessEqual(len(caption), marketing_ads.CAPTION_LIMIT)


class MarketingAdStatsEndpointTests(TestCase):
    def test_admin_only(self):
        from rest_framework.test import APIClient
        from apps.users.models import Role, User
        url = '/api/v1/admin/marketing-ads/'
        admin = User.objects.create_user(username='adm', email='adm@example.com',
                                         password='x-strong-pass-1', role=Role.ADMIN)
        cust = User.objects.create_user(username='cst', email='cst@example.com',
                                        password='x-strong-pass-1', role=Role.CUSTOMER)
        c = APIClient()
        c.force_authenticate(cust)
        self.assertEqual(c.get(url).status_code, 403)
        c.force_authenticate(admin)
        res = c.get(url)
        self.assertEqual(res.status_code, 200)
        self.assertIn('variants', res.data)
        self.assertEqual(res.data['attribution_days'], 7)
        self.assertFalse(res.data['promo']['active'])


class BroadcastHelperTests(TestCase):
    """/reklama va bir martalik reklama uchun umumiy yuboruvchi."""

    def test_sends_to_marketing_groups_and_tracks(self):
        from unittest import mock
        import bot
        from apps.settings_app.models import AdVariantStat, MarketingGroupStat
        Setting.set_setting('telegram_bot_token', 'fake:token')
        Setting.set_setting('payment_report_chat_id', '-100999')
        MarketingGroupStat.objects.create(chat_id='-100111', chat_title='Gamerlar')
        MarketingGroupStat.objects.create(chat_id='-100999', chat_title='Staff')
        calls = []

        def fake_api(token, method, payload):
            calls.append((method, payload['chat_id']))
            return {'ok': True}

        with mock.patch.object(bot, '_tg_api', side_effect=fake_api), \
             mock.patch.object(bot.time, 'sleep'):
            sent, failed, total = bot._broadcast_premium_ad_to_all_groups()
        self.assertEqual((sent, failed, total), (1, 0, 1))
        self.assertEqual(calls, [('sendPhoto', '-100111')])
        self.assertEqual(sum(v.sends for v in AdVariantStat.objects.all()), 1)


class SpotlightImageTests(TestCase):
    def setUp(self):
        Setting.clear_cache()
        Setting.set_setting('web_app_url', 'https://donzo-eight.vercel.app')
        Setting.set_setting('marketing_daily_image', '')

    def test_game_images(self):
        self.assertTrue(marketing_ads.spotlight_image('s-pubg-mobile').endswith('/ads/ad-pubg.jpg'))
        self.assertTrue(marketing_ads.spotlight_image('s-free-fire').endswith('/ads/ad-freefire.jpg'))
        self.assertTrue(marketing_ads.spotlight_image('s-mobile-legends').endswith('/ads/ad-mlbb.jpg'))
        self.assertTrue(marketing_ads.spotlight_image('s-telegram-premium').endswith('/ads/ad-premium.jpg'))
        self.assertEqual(marketing_ads.spotlight_image('s-roblox'), '')
        self.assertEqual(marketing_ads.spotlight_image('c1'), '')

    def test_payload_uses_game_image_unless_admin_set_one(self):
        from unittest import mock
        with mock.patch.object(marketing_ads, 'compose_ad',
                               return_value=('cap', marketing_ads.build_reply_markup('s-pubg-mobile'), 's-pubg-mobile')):
            _, payload = marketing_ads.ad_payload('-1', 'https://x/ads/ad-1.jpg')
            self.assertTrue(payload['photo'].endswith('/ads/ad-pubg.jpg'))
            Setting.set_setting('marketing_daily_image', 'https://cdn.example.com/own.png')
            _, payload = marketing_ads.ad_payload('-1', 'https://cdn.example.com/own.png')
            self.assertEqual(payload['photo'], 'https://cdn.example.com/own.png')

    def test_all_spotlight_images_exist(self):
        from pathlib import Path
        from django.conf import settings
        public = Path(settings.BASE_DIR).parent / 'frontend' / 'public' / 'ads'
        for _, name in marketing_ads.SPOTLIGHT_IMAGES:
            self.assertTrue((public / name).exists(), name)
        self.assertTrue((public / 'og.jpg').exists())
