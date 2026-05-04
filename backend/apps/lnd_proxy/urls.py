"""
URL Configuration for LND Proxy

All /api/lnd/* requests are forwarded to the LND FastAPI sidecar on port 8001.
Only authenticated admin users can access these endpoints.
"""
from django.urls import re_path
from . import views

urlpatterns = [
    # Catch-all: forwards any /api/lnd/<path> to FastAPI's /api/v1/<path>
    re_path(r'^(?P<path>.*)$', views.lnd_proxy_view, name='lnd_proxy'),
]
