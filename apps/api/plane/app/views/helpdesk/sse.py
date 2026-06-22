import asyncio
import io
import secrets

from django.conf import settings
from django.contrib.auth import get_user_model
from django.http import HttpResponse
from django.views import View
from rest_framework.authentication import SessionAuthentication
from rest_framework.response import Response
from rest_framework.views import APIView
from django_redis import get_redis_connection

from plane.app.helpdesk import sse_broker


def _build_request_user_sync(scope):
    """Build a minimal Django request and resolve its user — fully sync, run in executor."""
    from django.core.handlers.asgi import ASGIRequest
    from importlib import import_module
    from django.contrib.auth.middleware import get_user

    body_file = io.BytesIO()
    request = ASGIRequest(scope, body_file)

    engine = import_module(settings.SESSION_ENGINE)
    session_key = request.COOKIES.get(settings.SESSION_COOKIE_NAME)
    request.session = engine.SessionStore(session_key)

    # get_user reads request.session and returns the User (or AnonymousUser)
    request.user = get_user(request)
    return request


class CsrfExemptSessionAuthentication(SessionAuthentication):
    def enforce_csrf(self, request):
        return


_SSE_TOKEN_PREFIX = "helpdesk:sse_token:"
_SSE_TOKEN_TTL = 60


def _resolve_user_sync(request):
    """Cookie auth or ?token= one-time Redis token."""
    if request.user and request.user.is_authenticated:
        return request.user

    token = request.GET.get("token")
    if not token:
        return None

    redis = get_redis_connection("default")
    key = f"{_SSE_TOKEN_PREFIX}{token}"
    user_id = redis.get(key)
    if not user_id:
        return None
    redis.delete(key)

    if isinstance(user_id, bytes):
        user_id = user_id.decode()

    User = get_user_model()
    try:
        return User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return None


def _cors_headers(request, response):
    origin = request.META.get("HTTP_ORIGIN", "")
    allowed = getattr(settings, "CORS_ALLOWED_ORIGINS", [])
    allow_all = getattr(settings, "CORS_ALLOW_ALL_ORIGINS", False)
    if allow_all or origin in allowed:
        response["Access-Control-Allow-Origin"] = origin or "*"
        response["Access-Control-Allow-Credentials"] = "true"
        response["Vary"] = "Origin"
    return response


class HelpdeskSSETokenView(APIView):
    """POST — exchange session cookie for a short-lived SSE token."""

    authentication_classes = [CsrfExemptSessionAuthentication]

    def post(self, request, slug):
        if not request.user or not request.user.is_authenticated:
            return Response(status=401)
        token = secrets.token_urlsafe(32)
        redis = get_redis_connection("default")
        redis.setex(f"{_SSE_TOKEN_PREFIX}{token}", _SSE_TOKEN_TTL, str(request.user.id))
        return Response({"token": token})


class HelpdeskSSEView(View):
    """
    This view is registered in URLs but the actual SSE handling happens in
    SSEMiddleware in asgi.py — that middleware intercepts /helpdesk/events/
    before Django's request/response cycle, which cannot keep async generators
    streaming. This class is a fallback only.
    """

    async def get(self, request, slug):
        # Should never be reached when running under SSEMiddleware in asgi.py
        return HttpResponse(
            "SSE middleware not active — check asgi.py",
            status=503,
            content_type="text/plain",
        )
