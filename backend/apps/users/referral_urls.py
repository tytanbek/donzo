from django.urls import path
from . import referral_views

urlpatterns = [
    path('referrals/', referral_views.my_referrals, name='my-referrals'),
    path('referrals/stats/', referral_views.referral_stats, name='referral-stats'),
    path('referrals/claim-bonus/', referral_views.claim_referral_bonus, name='claim-referral-bonus'),
    path('referrals/apply-code/', referral_views.apply_referral_code, name='apply-referral-code'),
    path('referrals/share-content/', referral_views.referral_share_content, name='referral-share-content'),
    path('referrals/banner/', referral_views.referral_banner, name='referral-banner'),
    path('referrals/premium-codes/', referral_views.my_premium_codes, name='my-premium-codes'),
    path('referrals/premium-codes/activate/', referral_views.activate_premium_code, name='activate-premium-code'),
]
