"""
Referral System Views for DONZO.
"""
import logging
import uuid
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum, Count, Q
from django.utils import timezone
from datetime import timedelta

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes

from .models import User, ReferralReward, PremiumActivationCode
from apps.settings_app.models import Setting

logger = logging.getLogger(__name__)

REFERRAL_BONUS_PERCENT = Decimal("5")
MIN_ORDER_FOR_REFERRAL = Decimal("10000")


def _cashback_txs(user):
    from apps.payments.models import BalanceTransaction
    return BalanceTransaction.objects.filter(
        user=user, tx_type="cashback", status="completed"
    )


def _sum_cashback_txs(qs):
    return qs.aggregate(total=Sum("amount"))["total"] or Decimal("0")


def _batch_referral_spent(referral_ids):
    if not referral_ids:
        return {}
    from apps.orders.models import Order
    rows = (
        Order.objects
        .filter(customer_id__in=referral_ids, payment_status="paid")
        .values("customer_id")
        .annotate(total=Sum("total_price"))
    )
    return {r["customer_id"]: float(r["total"] or 0) for r in rows}


def _batch_referral_earned(user, referral_ids):
    if not referral_ids:
        return {}
    from apps.orders.models import Order
    paid_orders = (
        Order.objects
        .filter(customer_id__in=referral_ids, payment_status="paid")
        .values_list("order_number", "customer_id")
    )
    prefix_map = {}
    for on, cid in paid_orders:
        prefix_map[f"REF:{on}"] = cid
    if not prefix_map:
        return {}
    txs = (
        _cashback_txs(user)
        .filter(provider_transaction_id__in=list(prefix_map.keys()))
        .values_list("provider_transaction_id", "amount")
    )
    earned = {}
    for pid, amt in txs:
        cid = prefix_map.get(pid)
        if cid:
            earned[cid] = earned.get(cid, Decimal("0")) + amt
    return {k: float(v) for k, v in earned.items()}


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def my_referrals(request):
    """GET /api/v1/referrals/ — batch-optimized."""
    user = request.user
    referral_list = list(
        User.objects.filter(referred_by=user).order_by("-created_at")
        .values("id", "username", "created_at")
    )
    referral_ids = [r["id"] for r in referral_list]
    spent_map = _batch_referral_spent(referral_ids)
    earned_map = _batch_referral_earned(user, referral_ids)
    results = []
    for r in referral_list:
        cid = r["id"]
        results.append({
            "id": cid,
            "username": r["username"],
            "registered_at": r["created_at"].isoformat(),
            "total_spent": spent_map.get(cid, 0),
            "earned_cashback": earned_map.get(cid, 0),
        })
    return Response({"count": len(results), "results": results})


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def referral_stats(request):
    """GET /api/v1/referrals/stats/

    TEZLIK: grant_referral_milestone_rewards faqat referal bog'langanda
    yoki buyurtma to'langanda chaqiriladi — har GET so'rovda emas.
    Bu endpoint faqat statistikani qaytaradi (read-only).
    """
    user = request.user

    total_referrals = User.objects.filter(referred_by=user).count()
    total_cashback_earned = _sum_cashback_txs(_cashback_txs(user))

    from apps.orders.models import Order
    referred_ids = list(User.objects.filter(referred_by=user).values_list("id", flat=True))
    total_referred_spent = Order.objects.filter(
        customer_id__in=referred_ids, payment_status="paid"
    ).aggregate(total=Sum("total_price"))["total"] or Decimal("0")

    rewards_granted = ReferralReward.objects.filter(referrer=user, status="granted").count()
    next_milestone = ReferralReward.MILESTONE_EVERY * (rewards_granted + 1)
    milestone_progress = max(0, total_referrals - ReferralReward.MILESTONE_EVERY * rewards_granted)
    active_codes = PremiumActivationCode.objects.filter(referrer=user, status="active").count()

    # Telegram bot deep link — Telegram'dan ochilganda avtomatik referal qo'llaniladi
    bot_username = Setting.get_setting('telegram_bot_username', 'DONZOROBOT') or 'DONZOROBOT'
    deep_link = f"https://t.me/{bot_username.lstrip('@')}?start=ref_{user.referral_code}"
    # Web app link (fallback)
    site_url = request.build_absolute_uri("/").rstrip("/")
    web_link = f"{site_url}/?ref={user.referral_code}"

    return Response({
        "referral_code": user.referral_code,
        "referral_link": web_link,
        "deep_link": deep_link,
        "total_referrals": total_referrals,
        "total_cashback_earned": float(total_cashback_earned),
        "available_cashback": float(user.cashback_balance or 0),
        "current_balance": float(user.balance or 0),
        "bonus_percent": float(REFERRAL_BONUS_PERCENT),
        "min_order_for_referral": float(MIN_ORDER_FOR_REFERRAL),
        "total_referred_spent": float(total_referred_spent),
        "milestone_every": ReferralReward.MILESTONE_EVERY,
        "milestone_progress": milestone_progress,
        "next_milestone": next_milestone,
        "rewards_granted": rewards_granted,
        "reward_label": ReferralReward.REWARD_LABEL_1M_PREMIUM,
        "active_premium_codes": active_codes,
    })


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def claim_referral_bonus(request):
    """POST /api/v1/referrals/claim-bonus/"""
    user = request.user
    cashback = user.cashback_balance or Decimal("0")
    if cashback < Decimal("1000"):
        return Response(
            {"detail": f"Minimal cashback 1,000 so'm. Sizda: {float(cashback):,.0f} so'm"},
            status=status.HTTP_400_BAD_REQUEST
        )
    from apps.payments.models import BalanceTransaction
    from apps.audit_log.models import AuditLog
    with transaction.atomic():
        user = User.objects.select_for_update().get(pk=user.pk)
        cashback = user.cashback_balance or Decimal("0")
        if cashback < Decimal("1000"):
            return Response(
                {"detail": f"Minimal cashback 1,000 so'm. Sizda: {float(cashback):,.0f} so'm"},
                status=status.HTTP_400_BAD_REQUEST
            )
        balance_before = user.balance or Decimal("0")
        user.balance = balance_before + cashback
        user.cashback_balance = Decimal("0")
        user.save(update_fields=["balance", "cashback_balance"])
        BalanceTransaction.objects.create(
            user=user, tx_type="cashback_claim", amount=cashback,
            balance_before=balance_before, balance_after=user.balance,
            status="completed", provider="referral",
            description=f"Referal cashback balansga o'tkazildi: {cashback} so'm",
        )
        AuditLog.objects.create(
            user=user, action="referral_cashback_claim",
            target_type="User", target_id=user.id,
            description=f"@{user.username} {cashback} so'm cashbackni balansga o'tkazdi",
        )
    return Response({
        "detail": f"{float(cashback):,.0f} so'm cashback balansga o'tkazildi",
        "new_balance": float(user.balance), "new_cashback": 0,
    })


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def apply_referral_code(request):
    """POST /api/v1/referrals/apply-code/"""
    from rest_framework import serializers
    class RefCodeSerializer(serializers.Serializer):
        referral_code = serializers.CharField(max_length=50)
    serializer = RefCodeSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    code = serializer.validated_data["referral_code"].strip().upper()
    if not request.user.is_authenticated:
        return Response({"detail": "Foydalanuvchi tizimga kirmagan"}, status=status.HTTP_401_UNAUTHORIZED)
    user = request.user
    if user.referral_code == code:
        return Response({"detail": "O'zingizni referral kodingizni ishlata olmaysiz"}, status=status.HTTP_400_BAD_REQUEST)
    if user.referred_by:
        return Response({"detail": "Siz allaqachon referal tizimiga ulangansiz"}, status=status.HTTP_400_BAD_REQUEST)
    try:
        referrer = User.objects.get(referral_code=code, is_active=True)
    except User.DoesNotExist:
        return Response({"detail": "Referral kod topilmadi"}, status=status.HTTP_404_NOT_FOUND)
    STAFF_ROLES = ["admin", "super_admin", "senior_operator", "operator", "support"]
    if referrer.role in STAFF_ROLES or user.role in STAFF_ROLES:
        return Response({"detail": "Xodim hisoblari referal tizimiga ulanmaydi"}, status=status.HTTP_400_BAD_REQUEST)
    user.referred_by = referrer
    user.save(update_fields=["referred_by"])
    from apps.audit_log.models import AuditLog
    AuditLog.objects.create(
        user=user, action="referral_linked", target_type="User", target_id=user.id,
        description=f"@{user.username} @{referrer.username} tomonidan taklif qilindi",
    )
    from .referral_service import grant_referral_milestone_rewards
    grant_referral_milestone_rewards(referrer)
    return Response({"detail": f"Siz @{referrer.username} tomonidan taklif qilingansiz", "referrer_username": referrer.username})


# === SHARE CONTENT ===

@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def referral_share_content(request):
    """GET /api/v1/referrals/share-content/"""
    user = request.user
    code = user.referral_code
    site_url = request.build_absolute_uri("/").rstrip("/")
    link = f"{site_url}/?ref={code}"
    bot_username = "DONZOROBOT"
    deep_link = f"https://t.me/{bot_username}?start=ref_{code}"
    message_text = (
        f"🎮 DONZO — o'yinlar va xizmatlarga tez va xavfsiz top-up!\n\n"
        f"⚡ 5 daqiqada yetkazish\n"
        f"🛡️ 100% xavfsiz to'lov\n"
        f"💰 Har bir buyurtmadan 5% cashback\n"
        f"🎁 30 ta do'st taklif qilsang — Telegram Premium bepul!\n\n"
        f"🔗 Mening taklif havolam:\n{deep_link}\n\n"
        f"Taklif kod: {code}"
    )
    return Response({
        "referral_code": code, "link": link, "deep_link": deep_link,
        "message": message_text, "bot_username": bot_username,
    })


# === BANNER ===

@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def referral_banner(request):
    """GET /api/v1/referrals/banner/"""
    banner = {
        "title": "🎁 Do'stlarni taklif qiling!",
        "subtitle": "Har bir do'sting uchun 5% cashback, 30 ta do'st — Telegram Premium bepul!",
        "image_url": "/images/donzo.png",
        "link": "/profile",
    }
    if request.user.is_authenticated:
        user = request.user
        total_referrals = User.objects.filter(referred_by=user).count()
        granted = ReferralReward.objects.filter(referrer=user, status="granted").count()
        milestone = ReferralReward.MILESTONE_EVERY * (granted + 1)
        progress = max(0, total_referrals - ReferralReward.MILESTONE_EVERY * granted)
        banner["user_stats"] = {
            "total_referrals": total_referrals,
            "milestone_progress": progress,
            "milestone_target": ReferralReward.MILESTONE_EVERY,
            "next_milestone": milestone,
            "rewards_granted": granted,
            "referral_code": user.referral_code,
        }
        banner["personalized"] = True
    else:
        banner["personalized"] = False
    return Response(banner)


# === PREMIUM CODES (user) ===

@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def my_premium_codes(request):
    """GET /api/v1/referrals/premium-codes/"""
    user = request.user
    codes = list(
        PremiumActivationCode.objects.filter(referrer=user)
        .values("code", "status", "milestone", "created_at", "expires_at", "activated_at")
    )
    return Response({"count": len(codes), "results": codes})


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def activate_premium_code(request):
    """POST /api/v1/referrals/premium-codes/activate/"""
    user = request.user
    code = (request.data.get("code") or "").strip().upper()
    if not code:
        return Response({"detail": "Kodni kiriting"}, status=status.HTTP_400_BAD_REQUEST)
    try:
        pc = PremiumActivationCode.objects.get(code=code, status="active")
    except PremiumActivationCode.DoesNotExist:
        return Response({"detail": "Kod topilmadi yoki ishlatilgan"}, status=status.HTTP_404_NOT_FOUND)
    if pc.expires_at < timezone.now():
        pc.status = "expired"
        pc.save(update_fields=["status"])
        return Response({"detail": "Kodning muddati o'tgan"}, status=status.HTTP_400_BAD_REQUEST)
    if pc.referrer_id == user.pk:
        return Response({"detail": "O'zingizning kodingizni faollashtira olmaysiz"}, status=status.HTTP_400_BAD_REQUEST)
    with transaction.atomic():
        pc = PremiumActivationCode.objects.select_for_update().get(pk=pc.pk)
        if pc.status != "active":
            return Response({"detail": "Kod allaqachon ishlatilgan"}, status=status.HTTP_400_BAD_REQUEST)
        from apps.payments.models import BalanceTransaction
        premium_amount = Decimal("45000")
        balance_before = user.balance or Decimal("0")
        user.balance = balance_before + premium_amount
        user.save(update_fields=["balance"])
        BalanceTransaction.objects.create(
            user=user, tx_type="referral_gift", amount=premium_amount,
            balance_before=balance_before, balance_after=user.balance,
            status="completed", provider="referral",
            description=f"Premium aktivlashtirish kodi: {code}",
        )
        pc.status = "used"
        pc.activated_by = user
        pc.activated_at = timezone.now()
        pc.save(update_fields=["status", "activated_by", "activated_at"])
        from apps.audit_log.models import AuditLog
        AuditLog.objects.create(
            user=user, action="premium_code_activated",
            target_type="User", target_id=user.id,
            description=f"@{user.username} premium kodni aktivlashtirdi: {code}",
        )
    return Response({
        "detail": f"Premium {premium_amount:,.0f} so'm balansingizga qo'shildi",
        "new_balance": float(user.balance),
    })


# === ADMIN REFERRAL MANAGEMENT ===

@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def admin_referral_stats(request):
    """GET /api/v1/admin/referrals/stats/"""
    from apps.users.permissions import IsAdmin
    if not IsAdmin().has_permission(request, None):
        return Response({"detail": "Ruxsat yo'q"}, status=status.HTTP_403_FORBIDDEN)
    total_users_with_referrer = User.objects.filter(referred_by__isnull=False).count()
    total_users_with_code = User.objects.exclude(referral_code__isnull=True).count()
    total_referrers = User.objects.filter(
        id__in=User.objects.filter(referred_by__isnull=False).values_list("referred_by", flat=True)
    ).count()
    top_referrers = list(
        User.objects.filter(referred_by__isnull=False)
        .values("referred_by__username", "referred_by__id")
        .annotate(count=Count("id"))
        .order_by("-count")[:10]
    )
    from apps.orders.models import Order
    total_referral_revenue = Order.objects.filter(
        customer__referred_by__isnull=False, payment_status="paid"
    ).aggregate(total=Sum("total_price"))["total"] or Decimal("0")
    from apps.payments.models import BalanceTransaction
    actual_cashback = BalanceTransaction.objects.filter(
        tx_type="cashback", status="completed"
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0")
    total_premium_codes = PremiumActivationCode.objects.count()
    active_premium_codes = PremiumActivationCode.objects.filter(status="active").count()
    used_premium_codes = PremiumActivationCode.objects.filter(status="used").count()
    return Response({
        "total_users_with_referrer": total_users_with_referrer,
        "total_users_with_code": total_users_with_code,
        "total_referrers": total_referrers,
        "total_referral_revenue": float(total_referral_revenue),
        "estimated_cashback_paid": float(actual_cashback),
        "total_premium_codes": total_premium_codes,
        "active_premium_codes": active_premium_codes,
        "used_premium_codes": used_premium_codes,
        "top_referrers": [
            {"username": r["referred_by__username"], "id": r["referred_by__id"], "referrals_count": r["count"]}
            for r in top_referrers
        ],
    })


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def admin_all_referrals(request):
    """GET /api/v1/admin/referrals/all/"""
    from apps.users.permissions import IsAdmin
    if not IsAdmin().has_permission(request, None):
        return Response({"detail": "Ruxsat yo'q"}, status=status.HTTP_403_FORBIDDEN)
    referrers = list(
        User.objects.filter(referrals__isnull=False)
        .annotate(ref_count=Count("referrals", distinct=True))
        .order_by("-ref_count")
    )
    results = []
    for ref in referrers:
        rewards = ReferralReward.objects.filter(referrer=ref, status="granted").count()
        codes = list(PremiumActivationCode.objects.filter(referrer=ref).values(
            "code", "status", "milestone", "created_at", "expires_at",
        ))
        referred_users = list(
            User.objects.filter(referred_by=ref)
            .values("id", "username", "created_at")
            .order_by("-created_at")[:20]
        )
        cashback_earned = _sum_cashback_txs(_cashback_txs(ref))
        results.append({
            "id": ref.id, "username": ref.username, "telegram_id": ref.telegram_id,
            "referral_code": ref.referral_code, "ref_count": ref.ref_count,
            "cashback_earned": float(cashback_earned), "rewards_granted": rewards,
            "next_milestone": ReferralReward.MILESTONE_EVERY * (rewards + 1),
            "milestone_progress": max(0, ref.ref_count - ReferralReward.MILESTONE_EVERY * rewards),
            "codes": codes, "referred_users": referred_users,
        })
    return Response({"count": len(results), "results": results})


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def admin_activate_premium_code(request):
    """POST /api/v1/admin/referrals/activate-code/"""
    from apps.users.permissions import IsAdmin
    if not IsAdmin().has_permission(request, None):
        return Response({"detail": "Ruxsat yo'q"}, status=status.HTTP_403_FORBIDDEN)
    code = (request.data.get("code") or "").strip().upper()
    target_username = (request.data.get("username") or "").strip().lstrip("@")
    if not code or not target_username:
        return Response({"detail": "Kod va foydalanuvchi nomi shart"}, status=status.HTTP_400_BAD_REQUEST)
    try:
        pc = PremiumActivationCode.objects.get(code=code, status="active")
    except PremiumActivationCode.DoesNotExist:
        return Response({"detail": "Kod topilmadi yoki ishlatilgan"}, status=status.HTTP_404_NOT_FOUND)
    try:
        target = User.objects.get(username__iexact=target_username)
    except User.DoesNotExist:
        return Response({"detail": "Foydalanuvchi topilmadi"}, status=status.HTTP_404_NOT_FOUND)
    if pc.expires_at < timezone.now():
        pc.status = "expired"
        pc.save(update_fields=["status"])
        return Response({"detail": "Kodning muddati o'tgan"}, status=status.HTTP_400_BAD_REQUEST)
    with transaction.atomic():
        pc = PremiumActivationCode.objects.select_for_update().get(pk=pc.pk)
        if pc.status != "active":
            return Response({"detail": "Kod allaqachon ishlatilgan"}, status=status.HTTP_400_BAD_REQUEST)
        from apps.payments.models import BalanceTransaction
        premium_amount = Decimal("45000")
        balance_before = target.balance or Decimal("0")
        target.balance = balance_before + premium_amount
        target.save(update_fields=["balance"])
        BalanceTransaction.objects.create(
            user=target, tx_type="referral_gift", amount=premium_amount,
            balance_before=balance_before, balance_after=target.balance,
            status="completed", provider="referral",
            description=f"Admin tomonidan premium kod aktivlashtirildi: {code}",
        )
        pc.status = "used"
        pc.activated_by = target
        pc.activated_at = timezone.now()
        pc.save(update_fields=["status", "activated_by", "activated_at"])
        from apps.audit_log.models import AuditLog
        AuditLog.objects.create(
            user=request.user, action="admin_premium_code_activated",
            target_type="User", target_id=target.id,
            description=f"Admin @{request.user.username} kodni aktivlashtirdi: {code} -> @{target.username}",
        )
    return Response({"detail": f"Kod aktivlashtirildi: @{target.username} ga {premium_amount:,.0f} so'm qo'shildi"})


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def admin_create_premium_code(request):
    """POST /api/v1/admin/referrals/create-code/"""
    from apps.users.permissions import IsAdmin
    if not IsAdmin().has_permission(request, None):
        return Response({"detail": "Ruxsat yo'q"}, status=status.HTTP_403_FORBIDDEN)
    target_username = (request.data.get("username") or "").strip().lstrip("@")
    if not target_username:
        return Response({"detail": "Foydalanuvchi nomi shart"}, status=status.HTTP_400_BAD_REQUEST)
    try:
        referrer = User.objects.get(username__iexact=target_username)
    except User.DoesNotExist:
        return Response({"detail": "Foydalanuvchi topilmadi"}, status=status.HTTP_404_NOT_FOUND)
    code = f"DZ{uuid.uuid4().hex[:8].upper()}"
    pc = PremiumActivationCode.objects.create(
        code=code, referrer=referrer, milestone=0,
        expires_at=timezone.now() + timedelta(days=30),
    )
    return Response({"detail": f"Kod yaratildi: {code}", "code": code, "expires_at": pc.expires_at.isoformat()})
