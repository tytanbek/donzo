"""PUBG Mobile UC paketlari va narxlarini yangilash (2026-11).

Yangi narxlar = tannarx + 2%, mingtalikka yaxlitlangan.
Jadvaldan tashqaridagi UC paketlari o'chirilmaydi — ularga eski buyurtmalar
bog'langan — faqat is_active=False qilinadi. Royale Pass tegilmaydi.
"""
from decimal import Decimal

from django.db import migrations

SERVICE_SLUG = 'pubg-mobile'

# (nom, label, narx so'm, tartib)
NEW_PACKAGES = [
    ('60 UC', 'Unknown Cash 60', 11000, 0),
    ('325 UC', 'Unknown Cash 325', 55000, 1),
    ('660 UC', 'Unknown Cash 660', 110000, 2),
    ('1800 UC', 'Unknown Cash 1800', 274000, 3),
    ('3850 UC', 'Unknown Cash 3850', 548000, 4),
    ('8100 UC', 'Unknown Cash 8100', 1095000, 5),
    ('16200 UC', 'Unknown Cash 16200', 2190000, 6),
]
ROYALE_PASS_ORDER = 7


def apply_prices(apps, schema_editor):
    Service = apps.get_model('services', 'Service')
    Package = apps.get_model('services', 'Package')
    svc = Service.objects.filter(slug=SERVICE_SLUG).first()
    if svc is None:
        return  # yangi o'rnatish — seed_data.py yangi narxlar bilan yaratadi
    for name, label, price, order in NEW_PACKAGES:
        Package.objects.update_or_create(
            service=svc, name=name,
            defaults={
                'amount_label': label,
                'price': Decimal(price),
                'currency': 'UZS',
                'is_active': True,
                'order_index': order,
            },
        )
    # Jadvalda bo'lmagan barcha boshqa UC paketlari (eski 300/600/... va admin
    # qo'shgan 120/180/385/... UC) yashiriladi. O'chirilmaydi — qaytarish oson.
    new_names = [n for n, *_ in NEW_PACKAGES]
    (Package.objects.filter(service=svc, name__iendswith='UC')
        .exclude(name__in=new_names).update(is_active=False))
    Package.objects.filter(service=svc, name='Royale Pass').update(order_index=ROYALE_PASS_ORDER)


class Migration(migrations.Migration):
    dependencies = [
        ('services', '0003_servicefield_options'),
    ]

    operations = [
        migrations.RunPython(apply_prices, migrations.RunPython.noop),
    ]
