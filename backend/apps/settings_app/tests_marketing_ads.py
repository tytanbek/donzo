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
        self.assertEqual(markup['inline_keyboard'][0][0]['url'], 'https://t.me/DONZOROBOT?start=ad')

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
