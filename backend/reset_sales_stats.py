"""
TOPUP HUB — Savdo statistikasini 0 ga keltirish skripti.

Nimani tozalaydi:
  • Orders (buyurtmalar)
  • Payments (to'lovlar)
  • BalanceTransaction (balans tranzaksiyalar — topup/purchase/cashback)
  • AuditLog (faoliyat tarixi)

Nimaga TEGMAYDI:
  • Userlar, xizmatlar, paketlar, kategoryalar
  • Admin sozlamalari (Kalitlar), promokodlar, bannerlar
  • Foydalanuvchi balanslari (qo'lda qaytarish mumkin emas — xavfsizlik)

Run:  python reset_sales_stats.py   (backend/ dan)
"""
import os
import sys

sys.path.append(os.path.dirname(__file__))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django
django.setup()

from apps.orders.models import Order
from apps.payments.models import Payment, BalanceTransaction
from apps.audit_log.models import AuditLog
from apps.ws.metrics import metrics


def main():
    counts = {}
    counts['Orders'] = Order.objects.count()
    counts['Payments'] = Payment.objects.count()
    counts['BalanceTransactions'] = BalanceTransaction.objects.count()
    counts['AuditLogs'] = AuditLog.objects.count()

    print("=== Savdo statistikasini 0 ga keltirish ===")
    for name, count in counts.items():
        print(f"  Tozalanadi: {name} = {count}")

    # In-memory WebSocket live counters (total_events, EPM, latest event)
    # — har doim nollanadi, jadval bo'sh bo'lsa ham.
    metrics.reset()

    if sum(counts.values()) == 0:
        print("\nHammasi allaqachon bo'sh — hech narsa qilinmadi.")
        return

    # Delete in FK-safe order: payments first (order FK), then orders,
    # then balance transactions, then audit logs.
    Payment.objects.all().delete()
    Order.objects.all().delete()
    BalanceTransaction.objects.all().delete()
    AuditLog.objects.all().delete()

    print("\n=== Natija ===")
    print(f"  Orders: {Order.objects.count()}")
    print(f"  Payments: {Payment.objects.count()}")
    print(f"  BalanceTransactions: {BalanceTransaction.objects.count()}")
    print(f"  AuditLogs: {AuditLog.objects.count()}")
    print("\n[OK] Savdo statistikasi 0 ga keltirildi.")


if __name__ == '__main__':
    main()
