"""Yangi premium reklamani barcha marketing guruhlariga BIR MARTA yuborish so'rovi.

Bot `_send_requested_broadcast()` (har daqiqa) `marketing_broadcast_request`ni
`marketing_broadcast_done` bilan solishtiradi va farq bo'lsa yuboradi.
Migratsiya faqat bir marta qo'llanadi, bot esa so'rovni bir martadan ortiq
bajarmaydi — reklama takrorlanmaydi.
"""
from django.db import migrations

REQUEST_ID = 'premium-ad-2026-11-14'


def request_broadcast(apps, schema_editor):
    Setting = apps.get_model('settings_app', 'Setting')
    Setting.objects.update_or_create(
        key='marketing_broadcast_request',
        defaults={
            'value': REQUEST_ID,
            'is_encrypted': False,
            'description': "Bir martalik reklama so'rovi (bot bajaradi)",
        },
    )


class Migration(migrations.Migration):
    dependencies = [
        ('settings_app', '0004_marketing_daily_ad_budget'),
    ]

    operations = [
        migrations.RunPython(request_broadcast, migrations.RunPython.noop),
    ]
