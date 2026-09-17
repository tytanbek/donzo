# -*- coding: utf-8 -*-
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='BirthdayReward',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('birthday_date', models.DateField(help_text='Tugilgan kun sanasi (yilsiz)')),
                ('year', models.PositiveIntegerField(help_text='Chegirma yaratilgan yil')),
                ('discount_percent', models.DecimalField(decimal_places=2, default=10, max_digits=5)),
                ('coupon_code', models.CharField(db_index=True, help_text='Unique coupon code: BD-<random>', max_length=20, unique=True)),
                ('status', models.CharField(choices=[('ACTIVE', 'Faol'), ('USED', 'Ishlatilgan'), ('EXPIRED', "Muddati o'tgan"), ('CANCELLED', 'Bekor qilingan')], default='ACTIVE', max_length=20)),
                ('issued_at', models.DateTimeField(auto_now_add=True)),
                ('expires_at', models.DateTimeField(help_text='24 soat')),
                ('used_at', models.DateTimeField(blank=True, null=True)),
                ('used_in_order_id', models.PositiveIntegerField(blank=True, null=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='birthday_rewards', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'birthday_rewards',
                'ordering': ['-issued_at'],
                'unique_together': {('user', 'year')},
            },
        ),
        migrations.CreateModel(
            name='BirthdayNotification',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('group_chat_id', models.CharField(blank=True, db_index=True, max_length=100, null=True)),
                ('notification_type', models.CharField(choices=[('group', 'Guruh tabrigi'), ('private', 'Shaxsiy tabrik')], max_length=20)),
                ('birthday_date', models.DateField()),
                ('year', models.PositiveIntegerField()),
                ('sent_at', models.DateTimeField(auto_now_add=True)),
                ('status', models.CharField(choices=[('sent', 'Yuborildi'), ('failed', 'Xatolik'), ('skipped', 'Otkazildi')], default='sent', max_length=20)),
                ('error_detail', models.CharField(blank=True, default='', max_length=300)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='birthday_notifications', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'birthday_notifications',
                'ordering': ['-sent_at'],
                'unique_together': {('user', 'group_chat_id', 'year', 'notification_type')},
            },
        ),
    ]
