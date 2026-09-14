# -*- coding: utf-8 -*-
"""Birthday System views."""
import logging
import random
from datetime import date, timedelta
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from .models import BirthdayReward, BirthdayNotification
from .serializers import (
    BirthdayProfileSerializer, BirthdayRewardSerializer,
    BirthdayStatusSerializer, BirthdayAdminStatsSerializer,
)
logger = logging.getLogger(__name__)
_GROUP_MESSAGES = [
    "Bugun guruhimizdagi <b>{name}</b>ning tug'ilgan kuni! Tug'ilgan kuningiz muborak bo'lsin! Sizga mustahkam sog'liq, baxt, omad va barcha ezgu niyatlaringiz amalga oshishini tilaymiz. DONZO siz uchun maxsus sovg'a tayyorladi! Tug'ilgan kuningiz munosabati bilan xaridlaringizga 10% chegirma. Chegirma faqat 24 soat amal qiladi.",
    "<b>{name}</b>, bugun sizning maxsus kuningiz! Tug'ilgan kuningiz qutlug' bo'lsin! Sizga cheksiz baxt, sog'liq va omad tilaymiz! DONZO sizga 10% chegirma sovg'a qildi! Chegirma 24 soat amal qiladi. Bayramingiz muborak!",
    "Guruhimizda <b>{name}</b>ning tug'ilgan kuni! Sizga ko'p baxt, sog'liq va sevgi tilaymiz! DONZO maxsus sovg'a - 10% chegirma! 24 soat amal qiladi. Tabriklaymiz!",
]
_PRIVATE_MESSAGE = (
    "Tug'ilgan kuningiz muborak, {name}! Bugun sizning maxsus kuningiz. "
    "DONZO sizga kichik sovg'a tayyorladi: 10% CHEGIRMA. 24 soat amal qiladi."
)

def _get_user_name(user):
    return user.first_name or user.username or 'User#' + str(user.id)

def _send_telegram_message(bot_token, chat_id, text, parse_mode='HTML'):
    import requests
    try:
        resp = requests.post(
            'https://api.telegram.org/bot' + str(bot_token) + '/sendMessage',
            json={'chat_id': chat_id, 'text': text, 'parse_mode': parse_mode},
            timeout=15,
        )
        return resp.ok
    except Exception as e:
        logger.warning('Telegram message send failed: %s', e)
        return False

class BirthdayProfileView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response({
            'birthday_date': user.birthday_date,
            'birthday_year_hidden': user.birthday_year_hidden,
            'birthday_timezone': user.birthday_timezone,
        })

    def put(self, request):
        user = request.user
        ser = BirthdayProfileSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        if 'birthday_date' in ser.validated_data:
            user.birthday_date = ser.validated_data['birthday_date']
        if 'birthday_year_hidden' in ser.validated_data:
            user.birthday_year_hidden = ser.validated_data['birthday_year_hidden']
        if 'birthday_timezone' in ser.validated_data:
            user.birthday_timezone = ser.validated_data['birthday_timezone']
        user.save(update_fields=['birthday_date', 'birthday_year_hidden', 'birthday_timezone'])
        return Response({
            'birthday_date': user.birthday_date,
            'birthday_year_hidden': user.birthday_year_hidden,
            'birthday_timezone': user.birthday_timezone,
        })

class BirthdayStatusView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        today = date.today()
        has_birthday = user.birthday_date is not None
        is_today = False
        next_days = None
        next_date = None
        if has_birthday:
            bd = user.birthday_date
            this_year = date(today.year, bd.month, bd.day)
            if this_year == today:
                is_today = True
                next_days = 0
                next_date = today
            elif this_year > today:
                next_days = (this_year - today).days
                next_date = this_year
            else:
                next_year = date(today.year + 1, bd.month, bd.day)
                next_days = (next_year - today).days
                next_date = next_year
        active_reward = None
        if has_birthday:
            reward = BirthdayReward.objects.filter(
                user=user, status='ACTIVE', expires_at__gt=timezone.now(),
            ).first()
            if reward:
                active_reward = BirthdayRewardSerializer(reward).data
        if is_today and not active_reward and has_birthday:
            reward = BirthdayReward.create_for_user(user, user.birthday_date)
            if reward:
                active_reward = BirthdayRewardSerializer(reward).data
        return Response(BirthdayStatusSerializer({
            'has_birthday': has_birthday,
            'is_today': is_today,
            'next_birthday_days': next_days,
            'next_birthday_date': next_date,
            'active_reward': active_reward,
            'birthday_date': user.birthday_date,
        }).data)

def check_and_send_birthday_messages():
    from apps.settings_app.models import Setting
    from apps.users.models import User
    bot_token = (Setting.get_setting('telegram_bot_token', '') or '').strip()
    report_chat_id = (Setting.get_setting('payment_report_chat_id', '') or '').strip()
    today = date.today()
    year = today.year
    today_users = User.objects.filter(
        birthday_date__isnull=False,
        birthday_date__month=today.month,
        birthday_date__day=today.day,
        is_active=True,
    )
    if not today_users.exists():
        expired = BirthdayReward.expire_stale()
        return {'birthdays': 0, 'messages': 0, 'rewards': 0, 'expired': expired}
    messages_sent = 0
    rewards_created = 0
    for user in today_users:
        user_name = _get_user_name(user)
        if report_chat_id and bot_token:
            if not BirthdayNotification.already_sent(user, report_chat_id, year, 'group'):
                msg_text = random.choice(_GROUP_MESSAGES).format(name=user_name)
                ok = _send_telegram_message(bot_token, report_chat_id, msg_text)
                if ok:
                    BirthdayNotification.mark_sent(user, report_chat_id, year, 'group')
                    messages_sent += 1
        if bot_token and user.telegram_id:
            if not BirthdayNotification.already_sent(user, None, year, 'private'):
                private_text = _PRIVATE_MESSAGE.format(name=user_name)
                ok = _send_telegram_message(bot_token, user.telegram_id, private_text)
                if ok:
                    BirthdayNotification.mark_sent(user, None, year, 'private')
                    messages_sent += 1
        reward = BirthdayReward.create_for_user(user, today)
        if reward:
            rewards_created += 1
    expired = BirthdayReward.expire_stale()
    return {'birthdays': today_users.count(), 'messages': messages_sent, 'rewards': rewards_created, 'expired': expired}

@api_view(['GET'])
@permission_classes([permissions.IsAdminUser])
def admin_birthday_stats(request):
    today = date.today()
    year = today.year
    from apps.users.models import User
    from django.db.models import Sum
    today_count = User.objects.filter(
        birthday_date__month=today.month, birthday_date__day=today.day, is_active=True,
    ).count()
    messages = BirthdayNotification.objects.filter(year=year, status='sent').count()
    rewards = BirthdayReward.objects.filter(year=year)
    created = rewards.count()
    used = rewards.filter(status='USED').count()
    expired = rewards.filter(status='EXPIRED').count()
    return Response(BirthdayAdminStatsSerializer({
        'today_birthdays': today_count,
        'messages_sent': messages,
        'discounts_created': created,
        'discounts_used': used,
        'discount_revenue': 0,
        'discounts_expired': expired,
    }).data)

@api_view(['GET'])
@permission_classes([permissions.IsAdminUser])
def admin_birthday_list(request):
    from apps.users.models import User
    users_qs = User.objects.filter(
        birthday_date__isnull=False, is_active=True,
    ).order_by('birthday_date__month', 'birthday_date__day')
    today = date.today()
    result = []
    for u in users_qs:
        bd = u.birthday_date
        this_year = date(today.year, bd.month, bd.day)
        days_until = (this_year - today).days if this_year >= today else (date(today.year + 1, bd.month, bd.day) - today).days
        has_active_reward = BirthdayReward.objects.filter(
            user=u, status='ACTIVE', expires_at__gt=timezone.now(),
        ).exists()
        result.append({
            'id': u.id, 'username': u.username, 'first_name': u.first_name,
            'telegram_id': u.telegram_id, 'birthday_date': bd,
            'days_until': days_until, 'is_today': days_until == 0,
            'has_active_reward': has_active_reward,
        })
    return Response(result)
