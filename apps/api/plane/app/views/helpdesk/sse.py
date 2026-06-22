import secrets

from django.conf import settings
from django.contrib.auth import get_user_model
from django.http import HttpResponse, StreamingHttpResponse
from django.views import View
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.authentication import SessionAuthentication
from django_redis import get_redis_connection

from plane.app.helpdesk import sse_broker


class CsrfExemptSessionAuthentication(SessionAuthentication):
    def enforce_csrf(self, request):
        return

_SSE_TOKEN_PREFIX = "helpdesk:sse_token:"
_SSE_TOKEN_TTL = 60  # seconds


def _resolve_user(request):
    """Cookie auth (prod) or ?token= one-time Redis token (dev cross-origin)."""
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
    redis.delete(key)  # one-time use

    if isinstance(user_id, bytes):
        user_id = user_id.decode()

    User = get_user_model()
    try:
        return User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return None


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


def _cors_headers(request, response):
    origin = request.META.get("HTTP_ORIGIN", "")
    allowed = getattr(settings, "CORS_ALLOWED_ORIGINS", [])
    allow_all = getattr(settings, "CORS_ALLOW_ALL_ORIGINS", False)
    if allow_all or origin in allowed:
        response["Access-Control-Allow-Origin"] = origin or "*"
        response["Access-Control-Allow-Credentials"] = "true"
        response["Vary"] = "Origin"
    return response


class HelpdeskSSEView(View):
    def get(self, request, slug):
        user = _resolve_user(request)
        if not user:
            return HttpResponse(status=401)

        sub = sse_broker.subscribe(slug)

        def stream():
            try:
                yield from sub.events()
            finally:
                sse_broker.unsubscribe(slug, sub)

        response = StreamingHttpResponse(stream(), content_type="text/event-stream")
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        response["Content-Encoding"] = "identity"
        _cors_headers(request, response)
        return response
