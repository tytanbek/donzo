from django.apps import AppConfig


class OrdersConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.orders'
    verbose_name = 'Buyurtmalar'

    def ready(self):
        # Bajarilgan buyurtmalarni isbot kanaliga yuboruvchi signallar
        from . import proof_channel  # noqa: F401
