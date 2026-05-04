"""
LND Proxy View — Reverse proxy to LND FastAPI sidecar.

Routes all /api/lnd/* requests to http://127.0.0.1:8001/api/v1/*
Only accessible by authenticated admin users.

Design decisions:
- Uses httpx for async HTTP forwarding (sync wrapper via AsyncToSync for DRF compat)
- Generates a short-lived sidecar JWT so the sidecar's auth middleware passes
- Follows redirects (FastAPI 307 trailing-slash redirects)
- Returns 503 if the LND sidecar is unreachable (ALTS continues working)
"""
import httpx
import logging
from datetime import datetime, timedelta, timezone
from django.http import HttpResponse, JsonResponse
from django.conf import settings as django_settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

logger = logging.getLogger(__name__)

# LND Sidecar base URL
LND_SIDECAR_URL = "http://127.0.0.1:8001/api/v1"

# Headers that should NOT be forwarded (hop-by-hop)
HOP_BY_HOP_HEADERS = frozenset([
    'connection', 'keep-alive', 'proxy-authenticate',
    'proxy-authorization', 'te', 'trailers',
    'transfer-encoding', 'upgrade', 'host',
    'content-length', 'content-encoding',
])

# ── Sidecar JWT generation ──────────────────────────────────
# Read the sidecar's .env to get its SECRET_KEY and ADMIN_EMAIL
_sidecar_config = {}


def _load_sidecar_config():
    """Lazy-load sidecar .env settings (SECRET_KEY, ADMIN_EMAIL)."""
    global _sidecar_config
    if _sidecar_config:
        return _sidecar_config

    import os
    from pathlib import Path

    env_path = Path(django_settings.BASE_DIR) / 'lnd_sidecar' / '.env'
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, _, value = line.partition('=')
                _sidecar_config[key.strip()] = value.strip()

    return _sidecar_config


def _get_sidecar_token():
    """Generate a short-lived JWT that the sidecar's verify_token will accept."""
    try:
        from jose import jwt as jose_jwt

        config = _load_sidecar_config()
        secret = config.get('SECRET_KEY', 'lnd-sidecar-secret-key-change-this')
        algorithm = config.get('ALGORITHM', 'HS256')
        admin_email = config.get('ADMIN_EMAIL', 'admin@brainstation-23.com')

        expire = datetime.now(timezone.utc) + timedelta(minutes=5)
        payload = {
            "sub": admin_email,
            "exp": int(expire.timestamp()),
            "role": "admin",
        }
        return jose_jwt.encode(payload, secret, algorithm=algorithm)
    except Exception as e:
        logger.error("Failed to generate sidecar JWT: %s", e)
        return None


def _is_admin(user):
    """Check if user is an admin."""
    return user.is_authenticated and getattr(user, 'role', None) == 'admin'


@api_view(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'])
@permission_classes([IsAuthenticated])
def lnd_proxy_view(request, path=''):
    """
    Reverse proxy: forwards the request to the LND FastAPI sidecar.

    Only admin users can access LND endpoints.
    Django handles auth (JWT), then we generate a short-lived sidecar token.
    """
    # Admin gate
    if not _is_admin(request.user):
        return JsonResponse(
            {'detail': 'Only admin users can access L&D features.'},
            status=403
        )

    # Build target URL (ensure trailing slash to avoid 307 redirects)
    target_url = f"{LND_SIDECAR_URL}/{path}"
    if not target_url.endswith('/') and '?' not in target_url and '.' not in path.split('/')[-1]:
        target_url += '/'

    # Forward query parameters
    if request.META.get('QUERY_STRING'):
        if '?' in target_url:
            target_url += f"&{request.META['QUERY_STRING']}"
        else:
            target_url += f"?{request.META['QUERY_STRING']}"

    # Build headers to forward (skip hop-by-hop)
    forward_headers = {}
    for key, value in request.headers.items():
        if key.lower() not in HOP_BY_HOP_HEADERS:
            forward_headers[key] = value

    # Replace Django's auth header with a sidecar JWT
    forward_headers.pop('Authorization', None)
    forward_headers.pop('authorization', None)

    sidecar_token = _get_sidecar_token()
    if sidecar_token:
        forward_headers['Authorization'] = f'Bearer {sidecar_token}'

    # Add internal identifier so LND knows this is a proxied request
    forward_headers['X-Forwarded-By'] = 'ALTS-Django-Proxy'
    forward_headers['X-ALTS-User'] = request.user.email

    try:
        with httpx.Client(timeout=60.0, follow_redirects=True) as client:
            # Forward the request
            response = client.request(
                method=request.method,
                url=target_url,
                headers=forward_headers,
                content=request.body if request.body else None,
            )

        # Build Django response from httpx response
        django_response = HttpResponse(
            content=response.content,
            status=response.status_code,
            content_type=response.headers.get('content-type', 'application/json'),
        )

        # Forward response headers (skip hop-by-hop)
        for key, value in response.headers.items():
            if key.lower() not in HOP_BY_HOP_HEADERS:
                django_response[key] = value

        return django_response

    except httpx.ConnectError:
        logger.warning("LND sidecar is not reachable at %s", LND_SIDECAR_URL)
        return JsonResponse(
            {
                'detail': 'L&D service is currently unavailable. Please ensure the LND sidecar is running on port 8001.',
                'service': 'lnd_sidecar',
                'status': 'offline'
            },
            status=503
        )
    except httpx.TimeoutException:
        logger.error("LND sidecar request timed out: %s %s", request.method, target_url)
        return JsonResponse(
            {'detail': 'L&D service request timed out. Please try again.'},
            status=504
        )
    except Exception as e:
        logger.exception("LND proxy error: %s", str(e))
        return JsonResponse(
            {'detail': 'An error occurred communicating with the L&D service.'},
            status=502
        )
