"""
SSE broker — Redis pub/sub, fully async.

publish()   — sync, safe to call from DRF views (uses redis-py sync client).
subscribe() — async, returns an AsyncSubscriber; used by the async SSE view.

Each uvicorn worker process keeps its own set of in-process asyncio.Queue
subscribers. A per-slug asyncio Task listens on the Redis channel and fans
messages out to all local queues.
"""
import asyncio
import json
import os
import threading
from collections import defaultdict

import redis as _redis_lib

_redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/")


def _channel(slug: str) -> str:
    return f"helpdesk:sse:{slug}"


# ---------------------------------------------------------------------------
# Sync Redis client — for publish() called from DRF views (sync context)
# ---------------------------------------------------------------------------
_pub_client: _redis_lib.Redis | None = None
_pub_lock = threading.Lock()


def _get_pub() -> _redis_lib.Redis:
    global _pub_client
    if _pub_client is None:
        with _pub_lock:
            if _pub_client is None:
                _pub_client = _redis_lib.from_url(_redis_url, decode_responses=True)
    return _pub_client


# ---------------------------------------------------------------------------
# Async subscriber registry — per event-loop (one per uvicorn worker)
# ---------------------------------------------------------------------------
# slug → set of asyncio.Queue
_subscribers: dict[str, set] = defaultdict(set)
# slug → asyncio.Task that reads from Redis and fans out
_listener_tasks: dict[str, asyncio.Task] = {}
_registry_lock = asyncio.Lock()  # created lazily in async context


async def _get_lock() -> asyncio.Lock:
    global _registry_lock
    # Each event-loop needs its own Lock; recreate if the loop changed.
    try:
        _registry_lock.locked()
    except RuntimeError:
        _registry_lock = asyncio.Lock()
    return _registry_lock


async def _listener_task(slug: str):
    """Async task: subscribe to Redis channel, fan out to local queues."""
    loop = asyncio.get_running_loop()
    # Run blocking redis pubsub in a thread so we don't block the event loop.
    queue: asyncio.Queue = asyncio.Queue()

    def _redis_thread():
        r = _redis_lib.from_url(_redis_url, decode_responses=True)
        ps = r.pubsub(ignore_subscribe_messages=True)
        ps.subscribe(_channel(slug))
        try:
            for msg in ps.listen():
                if msg["type"] != "message":
                    continue
                payload = msg["data"]
                loop.call_soon_threadsafe(queue.put_nowait, payload)
                # Stop if no local subscribers remain
                if not _subscribers.get(slug):
                    break
        finally:
            ps.unsubscribe(_channel(slug))
            r.close()

    thread = threading.Thread(target=_redis_thread, daemon=True, name=f"sse:{slug}")
    thread.start()

    try:
        while True:
            payload = await queue.get()
            subs = list(_subscribers.get(slug, []))
            for sub_q in subs:
                try:
                    sub_q.put_nowait(payload)
                except asyncio.QueueFull:
                    pass
    except asyncio.CancelledError:
        pass


async def subscribe(slug: str) -> "asyncio.Queue[str | None]":
    lock = await _get_lock()
    async with lock:
        q: asyncio.Queue = asyncio.Queue(maxsize=50)
        _subscribers[slug].add(q)

        task = _listener_tasks.get(slug)
        if task is None or task.done():
            _listener_tasks[slug] = asyncio.create_task(_listener_task(slug))

        return q


async def unsubscribe(slug: str, q: "asyncio.Queue"):
    lock = await _get_lock()
    async with lock:
        _subscribers[slug].discard(q)
        # Signal the consumer that the stream is done
        await q.put(None)


def publish(slug: str, event: dict):
    """Synchronous — safe to call from DRF views."""
    payload = json.dumps(event)
    try:
        _get_pub().publish(_channel(slug), payload)
        print(f"[SSE] published to '{slug}': {payload}", flush=True)
    except Exception as exc:
        print(f"[SSE] Redis publish error: {exc}", flush=True)
