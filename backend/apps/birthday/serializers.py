# -*- coding: utf-8 -*-
from rest_framework import serializers
from .models import BirthdayReward, BirthdayNotification


class BirthdayProfileSerializer(serializers.Serializer):
    """Foydalanuvchi birthday ma'lumotlarini o'qish/yozish."""
    birthday_date = serializers.DateField(required=False, allow_null=True)
    birthday_year_hidden = serializers.BooleanField(required=False)
    birthday_timezone = serializers.CharField(required=False, allow_blank=True)

    def validate_birthday_date(self, value):
        if value is None:
            return value
        from datetime import date
        # Faqat oy-kun muhim (yil hisobga olinmaydi)
        today = date.today()
        if value.year < 1900 or value.year > today.year:
            raise serializers.ValidationError("Yil 1900-2026 orasida bo'lishi kerak")
        return value


class BirthdayRewardSerializer(serializers.ModelSerializer):
    """Birthday reward ma'lumotlari."""
    is_valid = serializers.BooleanField(read_only=True)
    remaining_seconds = serializers.IntegerField(read_only=True)

    class Meta:
        model = BirthdayReward
        fields = [
            'id', 'coupon_code', 'discount_percent', 'status',
            'issued_at', 'expires_at', 'used_at', 'is_valid', 'remaining_seconds',
        ]
        read_only_fields = fields


class BirthdayStatusSerializer(serializers.Serializer):
    """Birthday bo'limi uchun holat."""
    has_birthday = serializers.BooleanField()
    is_today = serializers.BooleanField()
    next_birthday_days = serializers.IntegerField(allow_null=True)
    next_birthday_date = serializers.DateField(allow_null=True)
    active_reward = BirthdayRewardSerializer(allow_null=True)
    birthday_date = serializers.DateField(allow_null=True)


class BirthdayAdminStatsSerializer(serializers.Serializer):
    """Admin panel uchun birthday statistika."""
    today_birthdays = serializers.IntegerField()
    messages_sent = serializers.IntegerField()
    discounts_created = serializers.IntegerField()
    discounts_used = serializers.IntegerField()
    discount_revenue = serializers.DecimalField(max_digits=15, decimal_places=2)
    discounts_expired = serializers.IntegerField()
