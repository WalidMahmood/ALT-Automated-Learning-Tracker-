from django.apps import AppConfig


class LndBridgeConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.lnd_bridge'
    verbose_name = 'LND Data Bridge'
