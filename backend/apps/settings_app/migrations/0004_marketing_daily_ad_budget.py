"""Kunlik reklama limiti hisobi: har guruh uchun bugungi reklama soni.

`marketing_ads_per_day` (default 2) shu ustunlarga tayanadi — guruh bir kunda
ko'pi bilan shuncha reklama ko'radi, qaysi yo'l bilan yuborilganidan qat'i nazar.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('settings_app', '0003_marketing_group_members'),
    ]

    operations = [
        migrations.AddField(
            model_name='marketinggroupstat',
            name='ads_today',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='marketinggroupstat',
            name='ads_today_day',
            field=models.DateField(blank=True, null=True),
        ),
    ]
