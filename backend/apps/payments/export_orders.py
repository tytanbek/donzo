"""
Buyurtmalarni CSV qilib eksport qilish.

Uchta xavfsiz yo'l (hammasi admin/super_admin uchun):

  1. GET  /api/v1/export/orders/csv/         — JWT `Authorization` header'da
                                               (API/skript mijozlar uchun)
  2. POST /api/v1/export/orders/link/        — 2 daqiqalik bir martalik
                                               imzolangan havola qaytaradi
  3. GET  /api/v1/export/orders/csv/download/?key=...  — o'sha havolani
                                               ishlatadi (brauzer yuklab olish)

MUHIM (xavfsizlik): avval brauzer `?token=<8 soatlik admin JWT>` bilan
yuklab olardi. URL manzillar brauzer tarixi, Referer header va proksi
loglariga tushadi — uzoq yashaydigan admin tokeni u yerda qolib ketishi
katta xavf. Endi havola faqat shu bitta eksport uchun ishlaydi, 2 daqiqada
o'ladi va foydalanuvchi o'sha paytda ham admin bo'lishi qayta tekshiriladi.
Ishlatish paytida token muddati o'tgan/buzilgan bo'lsa — toza JSON 401
(avval bu joy 500 berardi).
"""
import csv

from django.contrib.auth import get_user_model
from django.core import signing
from django.http import HttpResponse
from rest_framework import permissions
from rest_framework import status as drf_status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.orders.models import Order
from apps.users.permissions import IsAdmin

User = get_user_model()

# Imzolangan havola uchun "tuz" (salt) va umri.
EXPORT_LINK_SALT = 'donzo.orders-export'
EXPORT_LINK_MAX_AGE = 120  # sekund

CSV_HEADER = [
    'ID', 'Buyurtma Raqami', 'Mijoz', 'Xizmat', 'Paket',
    'Narx', 'Holat', "To'lov Holati", "To'lov Usuli",
    'Operator', 'Yaratilgan Sana',
]


def _filtered_orders(status_filter, date_from, date_to):
    queryset = Order.objects.select_related(
        'service', 'package', 'customer', 'assigned_operator'
    )
    if status_filter:
        queryset = queryset.filter(status=status_filter)
    if date_from:
        queryset = queryset.filter(created_at__date__gte=date_from)
    if date_to:
        queryset = queryset.filter(created_at__date__lte=date_to)
    return queryset.order_by('-created_at')


def _csv_response(queryset) -> HttpResponse:
    response = HttpResponse(content_type='text/csv; charset=utf-8')
    response['Content-Disposition'] = 'attachment; filename="buyurtmalar.csv"'
    response.write('\ufeff')  # Excel uchun BOM

    writer = csv.writer(response)
    writer.writerow(CSV_HEADER)
    for order in queryset:
        writer.writerow([
            order.id,
            order.order_number,
            order.customer_name,
            order.service.name if order.service else '',
            order.package.name if order.package else '',
            float(order.total_price),
            order.get_status_display(),
            order.get_payment_status_display(),
            order.payment_method or '',
            order.assigned_operator.username if order.assigned_operator else '',
            order.created_at.strftime('%Y-%m-%d %H:%M'),
        ])
    return response


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated, IsAdmin])
def export_orders_csv(request):
    """Header orqali autentifikatsiya qilingan CSV eksport (API mijozlar)."""
    queryset = _filtered_orders(
        request.query_params.get('status', ''),
        request.query_params.get('date_from', ''),
        request.query_params.get('date_to', ''),
    )
    return _csv_response(queryset)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated, IsAdmin])
def export_orders_link(request):
    """POST /api/v1/export/orders/link/ — brauzer yuklab olishi uchun havola.

    Body (ixtiyoriy): {"status": "...", "date_from": "...", "date_to": "..."}
    Qaytaradi: {"url": "/api/v1/export/orders/csv/download/?key=...", "expires_in": 120}
    """
    payload = {
        'user_id': request.user.pk,
        'status': str(request.data.get('status', '') or '')[:40],
        'date_from': str(request.data.get('date_from', '') or '')[:20],
        'date_to': str(request.data.get('date_to', '') or '')[:20],
    }
    key = signing.dumps(payload, salt=EXPORT_LINK_SALT, compress=True)
    # Yo'l API ildiziga nisbatan (frontend o'z `API_BASE` iga qo'shadi).
    return Response({
        'url': f'/export/orders/csv/download/?key={key}',
        'expires_in': EXPORT_LINK_MAX_AGE,
    })


@api_view(['GET'])
@permission_classes([])  # imzolangan kalitning o'zi "ruxsatnoma"
def export_orders_csv_signed(request):
    """Imzolangan (2 daqiqalik) havola orqali CSV yuklab olish."""
    key = request.query_params.get('key', '')
    if not key:
        return Response({'detail': 'Havola yaroqsiz'}, status=drf_status.HTTP_401_UNAUTHORIZED)
    try:
        payload = signing.loads(key, salt=EXPORT_LINK_SALT, max_age=EXPORT_LINK_MAX_AGE)
    except signing.SignatureExpired:
        return Response(
            {'detail': 'Havola muddati tugagan. Sahifani yangilab qayta urinib ko\'ring.'},
            status=drf_status.HTTP_401_UNAUTHORIZED,
        )
    except (signing.BadSignature, ValueError, TypeError):
        return Response({'detail': 'Havola yaroqsiz'}, status=drf_status.HTTP_401_UNAUTHORIZED)

    # Kalit berilgandan keyin ham huquq qayta tekshiriladi: akkaunt bloklangan
    # yoki roli olib qo'yilgan bo'lishi mumkin.
    try:
        user = User.objects.get(pk=payload.get('user_id'))
    except (User.DoesNotExist, ValueError, TypeError):
        return Response({'detail': 'Havola yaroqsiz'}, status=drf_status.HTTP_401_UNAUTHORIZED)

    if not user.is_active or user.role not in ('admin', 'super_admin'):
        return Response({'detail': "Ruxsat yo'q"}, status=drf_status.HTTP_403_FORBIDDEN)

    queryset = _filtered_orders(
        payload.get('status', ''),
        payload.get('date_from', ''),
        payload.get('date_to', ''),
    )
    return _csv_response(queryset)
