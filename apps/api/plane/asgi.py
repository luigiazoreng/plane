# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import asyncio
import logging
import os

from channels.routing import ProtocolTypeRouter
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "plane.settings.production")
# Initialize Django ASGI application early to ensure the AppRegistry
# is populated before importing code that may import ORM models.

django_asgi_app = get_asgi_application()

logger = logging.getLogger("plane.helpdesk.sse")

# Heartbeat keeps the connection (and any intermediate proxy) alive while idle.
_SSE_HEARTBEAT_SECONDS = 20.0


class SSEMiddleware:
    """
    ASGI middleware that streams /helpdesk/events/ directly via the raw
    scope/receive/send protocol.

    Django's StreamingHttpResponse cannot keep an async-generator response open
    under ASGI — the handler drains the generator and closes the request in
    milliseconds. Talking ASGI directly lets us hold the stream open, emit
    heartbeats, and react to client disconnects cleanly.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or "/helpdesk/events/" not in scope.get("path", ""):
            await self.app(scope, receive, send)
            return

        # Imported here to avoid circular imports at module load time.
        from asgiref.sync import sync_to_async

        from plane.app.helpdesk import sse_broker
        from plane.app.views.helpdesk.sse import (
            _build_request_user_sync,
            _resolve_user_sync,
        )

        path = scope["path"]

        # Build a minimal Django request and resolve the user — fully sync, in a thread.
        def _auth():
            request = _build_request_user_sync(scope)
            return _resolve_user_sync(request)

        user = await sync_to_async(_auth)()

        if not user:
            await send({"type": "http.response.start", "status": 401, "headers": []})
            await send({"type": "http.response.body", "body": b"", "more_body": False})
            return

        # Extract workspace slug from /api/workspaces/<slug>/helpdesk/events/
        parts = path.strip("/").split("/")
        try:
            slug = parts[parts.index("workspaces") + 1]
        except (ValueError, IndexError):
            slug = "unknown"

        # CORS: echo the origin back when it's allowed (cookies require credentials).
        from django.conf import settings

        origin = dict(scope.get("headers", [])).get(b"origin", b"").decode()
        allowed = getattr(settings, "CORS_ALLOWED_ORIGINS", [])
        allow_all = getattr(settings, "CORS_ALLOW_ALL_ORIGINS", False)
        cors_headers = []
        if allow_all or origin in allowed:
            cors_headers = [
                (b"access-control-allow-origin", (origin or "*").encode()),
                (b"access-control-allow-credentials", b"true"),
                (b"vary", b"Origin"),
            ]

        await send({
            "type": "http.response.start",
            "status": 200,
            "headers": [
                (b"content-type", b"text/event-stream"),
                (b"cache-control", b"no-cache"),
                (b"x-accel-buffering", b"no"),
                *cors_headers,
            ],
        })

        q = await sse_broker.subscribe(slug)

        # Watch for client disconnect so we can tear the stream down promptly.
        disconnect_event = asyncio.Event()

        async def watch_disconnect():
            while True:
                msg = await receive()
                if msg["type"] == "http.disconnect":
                    disconnect_event.set()
                    break

        disconnect_task = asyncio.create_task(watch_disconnect())

        try:
            while not disconnect_event.is_set():
                try:
                    payload = await asyncio.wait_for(
                        asyncio.shield(q.get()), timeout=_SSE_HEARTBEAT_SECONDS
                    )
                except asyncio.TimeoutError:
                    await send({
                        "type": "http.response.body",
                        "body": b": heartbeat\n\n",
                        "more_body": True,
                    })
                    continue

                if payload is None:  # unsubscribe sentinel
                    break

                await send({
                    "type": "http.response.body",
                    "body": f"data: {payload}\n\n".encode(),
                    "more_body": True,
                })
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("SSE stream error for slug=%s", slug)
        finally:
            disconnect_task.cancel()
            await sse_broker.unsubscribe(slug, q)
            try:
                await send({"type": "http.response.body", "body": b"", "more_body": False})
            except Exception:
                pass


application = SSEMiddleware(ProtocolTypeRouter({"http": django_asgi_app}))
