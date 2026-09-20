from django.urls import path

from . import export_orders

urlpatterns = [
    # Header-autentifikatsiya (API mijozlar)
    path('orders/csv/', export_orders.export_orders_csv, name='export-orders-csv'),
    # Brauzer uchun qisqa muddatli imzolangan havola
    path('orders/link/', export_orders.export_orders_link, name='export-orders-link'),
    path('orders/csv/download/', export_orders.export_orders_csv_signed,
         name='export-orders-csv-download'),
]
