"""
Keraksiz xizmat maydonlarini DB'dan o'chiradi:
  • nickname (ixtiyoriy) — 5 ta xizmatda (mobile-legends, pubg-mobile,
    free-fire, steam-wallet, standoff-2) — buyurtma uchun shart emas;
  • telegram-premium dagi 'duration' select — muddat paket nomida bor
    ('3 oy Premium'), qo'shimcha maydon takrori.

Ishlatish: python remove_unneeded_fields.py
Idempotent — maydon topilmasa ham xato bermaydi.
"""
import os
import sys
import django

sys.path.append(os.path.dirname(__file__))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.services.models import ServiceField

removed = 0

# 1) nickname — 5 ta xizmatda (ixtiyoriy, buyurtma uchun kerak emas)
nick_services = ['mobile-legends', 'pubg-mobile', 'free-fire', 'steam-wallet', 'standoff-2']
for slug in nick_services:
    deleted, _ = ServiceField.objects.filter(
        service__slug=slug, field_name='nickname'
    ).delete()
    if deleted:
        print(f"  removed 'nickname' from {slug} ({deleted})")
        removed += deleted

# 2) telegram-premium — duration select (muddat paket nomida)
deleted, _ = ServiceField.objects.filter(
    service__slug='telegram-premium', field_name='duration'
).delete()
if deleted:
    print(f"  removed 'duration' from telegram-premium ({deleted})")
    removed += deleted

print(f"\n[OK] {removed} ta keraksiz maydon o'chirildi")
print("\nQolgan maydonlar:")
from apps.services.models import Service
for s in Service.objects.filter(is_active=True).order_by('id'):
    fields = ServiceField.objects.filter(service=s).values_list('field_name', 'field_label', 'field_type', 'is_required')
    print(f"  {s.slug}: {list(fields)}")
