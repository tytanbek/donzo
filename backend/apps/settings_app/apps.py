from django.apps import AppConfig


class SettingsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.settings_app'
    verbose_name = 'Sozlamalar'

    def ready(self):
        # Narx o'zgarishini isbot kanaliga e'lon qilish navbati
        from . import growth
        growth.connect_signals()
