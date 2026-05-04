from django.apps import AppConfig


class LndProxyConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.lnd_proxy'
    verbose_name = 'LND Sidecar Proxy'
