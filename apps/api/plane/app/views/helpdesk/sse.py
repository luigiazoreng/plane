import asyncio
import secrets

from django.conf import settings
from django.contrib.auth import get_user_model
from django.http import HttpResponse, StreamingHttpResponse
from django.views import View
from rest_framework.authentication import SessionAuthentication
from rest_framework.response import Response
from rest_framework.views import APIView
from django_redis import get_redis_connection

from plane.app.helpdesk import sse_broker


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
    async def get(self, request, slug):
        # Auth runs sync (ORM) — Django wraps sync views in a thread by default,
        # but we declared this as async so we call sync helpers via sync_to_async.
        from asgiref.sync import sync_to_async

        user = await sync_to_async(_resolve_user_sync)(request)
        if not user:
            return HttpResponse(status=401)

        q = await sse_broker.subscribe(slug)

        async def stream():
            try:
                while True:
                    try:
                        payload = await asyncio.wait_for(q.get(), timeout=20.0)
                    except asyncio.TimeoutError:
                        yield ": heartbeat\n\n"
                        continue

                    if payload is None:  # unsubscribe sentinel
                        return

                    yield f"data: {payload}\n\n"
            except asyncio.CancelledError:
                pass
            finally:
                await sse_broker.unsubscribe(slug, q)

        response = StreamingHttpResponse(stream(), content_type="text/event-stream")
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        _cors_headers(request, response)
        return response
