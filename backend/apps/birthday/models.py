# -*- coding: utf-8 -*-
"""
Birthday System — DONZO tug'ilgan kun tizimi.
"""
import uuid
from datetime import date, timedelta
from django.conf import settings
from django.db import models
from django.utils import timezone


class BirthdayReward(models.Model):
    STATUS_CHOICES = [
        ('ACTIVE', 'Faol'),
        ('USED', 'Ishlatilgan'),
        ('EXPIRED', "Muddati o'tgan"),
        ('CANCELLED', 'Bekor qilingan'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='birthday_rewards',
    )
    birthday_date = models.DateField(help_text='Tugilgan kun sanasi (yilsiz)')
    year = models.PositiveIntegerField(help_text='Chegirma yaratilgan yil')
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=10)
    coupon_code = models.CharField(max_length=20, unique=True, db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ACTIVE')
    issued_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(help_text='24 soat')
    used_at = models.DateTimeField(null=True, blank=True)
    used_in_order_id = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        db_table = 'birthday_rewards'
        ordering = ['-issued_at']
        unique_together = [('user', 'year')]

    def __str__(self):
        return f"Birthday {self.user_id} year={self.year} {self.status}"

    @property
    def is_valid(self):
        return self.status == 'ACTIVE' and timezone.now() < self.expires_at

    @property
    def remaining_seconds(self):
        if not self.is_valid:
            return 0
        delta = self.expires_at - timezone.now()
        return max(0, int(delta.total_seconds()))

    @staticmethod
    def generate_coupon_code(user_id):
        short_id = hex(user_id)[2:].upper()[-4:]
        rand = uuid.uuid4().hex[:6].upper()
        return f"BD-{short_id}-{rand}"

    @classmethod
    def create_for_user(cls, user, birthday_date):
        now = timezone.now()
        year = now.year
        if cls.objects.filter(user=user, year=year).exists():
            return None
        expires_at = now + timedelta(hours=24)
        return cls.objects.create(
            user=user, birthday_date=birthday_date, year=year,
            coupon_code=cls.generate_coupon_code(user.id), expires_at=expires_at,
        )

    def mark_used(self, order_id=None):
        self.status = 'USED'
        self.used_at = timezone.now()
        self.used_in_order_id = order_id
        self.save(update_fields=['status', 'used_at', 'used_in_order_id'])

    def expire(self):
        self.status = 'EXPIRED'
        self.save(update_fields=['status'])

    @classmethod
    def expire_stale(cls):
        now = timezone.now()
        return cls.objects.filter(status='ACTIVE', expires_at__lt=now).update(status='EXPIRED')


class BirthdayNotification(models.Model):
    NOTIFICATION_TYPES = [
        ('group', 'Guruh tabrigi'),
        ('private', 'Shaxsiy tabrik'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='birthday_notifications',
    )
    group_chat_id = models.CharField(max_length=100, blank=True, null=True, db_index=True)
    notification_type = models.CharField(max_length=20, choices=NOTIFICATION_TYPES)
    birthday_date = models.DateField()
    year = models.PositiveIntegerField()
    sent_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, default='sent',
        choices=[('sent', 'Yuborildi'), ('failed', 'Xatolik'), ('skipped', 'Otkazildi')])
    error_detail = models.CharField(max_length=300, blank=True, default='')

    class Meta:
        db_table = 'birthday_notifications'
        ordering = ['-sent_at']
        unique_together = [('user', 'group_chat_id', 'year', 'notification_type')]

    def __str__(self):
        return f"Birthday notify {self.user_id} type={self.notification_type} year={self.year}"

    @classmethod
    def already_sent(cls, user, group_chat_id, year, notification_type):
        return cls.objects.filter(
            user=user, group_chat_id=group_chat_id or '',
            year=year, notification_type=notification_type,
        ).exists()

    @classmethod
    def mark_sent(cls, user, group_chat_id, year, notification_type):
        obj, created = cls.objects.get_or_create(
            user=user, group_chat_id=group_chat_id or '',
            year=year, notification_type=notification_type,
            defaults={'status': 'sent'},
        )
        if not created and obj.status != 'sent':
            obj.status = 'sent'
            obj.save(update_fields=['status'])
        return obj
