"""
SSE broker — Redis pub/sub backend so events cross process/worker boundaries.

publish() is synchronous (called from DRF views).
subscribe()/unsubscribe() are synchronous; each subscriber holds a
threading.Condition that is notified by a per-workspace Redis listener thread.
"""
import json
import os
import threading
import time
from collections import defaultdict

import redis as _redis_lib

_redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/")


def _channel(slug: str) -> str:
    return f"helpdesk:sse:{slug}"


# ---------------------------------------------------------------------------
# Sync redis client for publish
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
# Subscriber
# ---------------------------------------------------------------------------

class _Subscriber:
    def __init__(self):
        self._cond = threading.Condition()
        self._queue: list = []
        self._closed = False

    def put(self, payload: str):
        with self._cond:
            self._queue.append(payload)
            self._cond.notify_all()

    def close(self):
        with self._cond:
            self._closed = True
            self._cond.notify_all()

    def events(self, heartbeat_interval: float = 20.0):
        while True:
            with self._cond:
                deadline = time.monotonic() + heartbeat_interval
                while not self._queue and not self._closed:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        break
                    self._cond.wait(timeout=remaining)

                if self._closed:
                    return

                if self._queue:
                    items = list(self._queue)
                    self._queue.clear()
                else:
                    yield ": heartbeat\n\n"
                    continue

            for item in items:
                yield f"data: {item}\n\n"


# ---------------------------------------------------------------------------
# Per-process subscriber registry + Redis listener threads
# ---------------------------------------------------------------------------
_sub_lock = threading.Lock()
_subscribers: dict[str, set] = defaultdict(set)
_listener_threads: dict[str, threading.Thread] = {}
_listener_lock = threading.Lock()


def _start_listener(slug: str):
    with _listener_lock:
        t = _listener_threads.get(slug)
        if t and t.is_alive():
            return

        def _run():
            r = _redis_lib.from_url(_redis_url, decode_responses=True)
            ps = r.pubsub(ignore_subscribe_messages=True)
            ps.subscribe(_channel(slug))
            try:
                for msg in ps.listen():
                    if msg["type"] != "message":
                        continue
                    payload = msg["data"]
                    with _sub_lock:
                        subs = list(_subscribers.get(slug, []))
                    if not subs:
                        break
                    for sub in subs:
                        sub.put(payload)
            finally:
                ps.unsubscribe(_channel(slug))
                r.close()
                with _listener_lock:
                    _listener_threads.pop(slug, None)

        t = threading.Thread(target=_run, daemon=True, name=f"sse:{slug}")
        _listener_threads[slug] = t
        t.start()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def subscribe(slug: str) -> _Subscriber:
    sub = _Subscriber()
    with _sub_lock:
        _subscribers[slug].add(sub)
    _start_listener(slug)
    return sub


def unsubscribe(slug: str, sub: _Subscriber):
    with _sub_lock:
        _subscribers[slug].discard(sub)
    sub.close()


def publish(slug: str, event: dict):
    payload = json.dumps(event)
    try:
        _get_pub().publish(_channel(slug), payload)
        print(f"[SSE] published to '{slug}': {payload}", flush=True)
    except Exception as exc:
        print(f"[SSE] Redis publish error: {exc}", flush=True)
