# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Thin client for the Mailpit REST API.

Mailpit (``docker-compose-local.yml``) is a real SMTP server that accepts mail
and exposes it over HTTP instead of relaying it. That is what makes it useful
here: the unit suite runs on ``locmem``, which never performs an SMTP
transaction, so anything that only manifests on the wire is invisible to it --
TLS/SSL negotiation, MIME assembly, and the exact headers as delivered.

Host resolution: inside the compose network the service is reachable as
``mailpit``; from the host it is ``localhost`` with the published ports. Both
are overridable so the suite can point at another instance.
"""

# Python imports
import os

# Third-party imports
import requests

SMTP_HOST = os.environ.get("MAILPIT_SMTP_HOST", "mailpit")
SMTP_PORT = int(os.environ.get("MAILPIT_SMTP_PORT", "1025"))
API_URL = os.environ.get("MAILPIT_API_URL", "http://mailpit:8025")

_TIMEOUT = 5


def is_available():
    """Return True when the Mailpit API answers, so the suite can skip cleanly."""
    try:
        response = requests.get(f"{API_URL}/api/v1/info", timeout=_TIMEOUT)
        return response.status_code == 200
    except requests.RequestException:
        return False


def clear():
    """Delete every stored message. Call in setUp -- Mailpit state is global."""
    requests.delete(f"{API_URL}/api/v1/messages", timeout=_TIMEOUT).raise_for_status()


def list_messages():
    """Return the message summaries, newest first."""
    response = requests.get(f"{API_URL}/api/v1/messages", timeout=_TIMEOUT)
    response.raise_for_status()
    return response.json()["messages"]


def count():
    """Return how many messages Mailpit currently holds."""
    response = requests.get(f"{API_URL}/api/v1/messages", timeout=_TIMEOUT)
    response.raise_for_status()
    return response.json()["total"]


def get_message(message_id):
    """Return the full message body (``Text``, ``HTML``, ``Subject``, ...)."""
    response = requests.get(f"{API_URL}/api/v1/message/{message_id}", timeout=_TIMEOUT)
    response.raise_for_status()
    return response.json()


def get_headers(message_id):
    """Return the delivered headers as ``{name: [values]}``.

    Header names come back with the casing Mailpit normalises to (``Message-Id``,
    not ``Message-ID``), so callers should not assume the casing they sent.
    """
    response = requests.get(
        f"{API_URL}/api/v1/message/{message_id}/headers", timeout=_TIMEOUT
    )
    response.raise_for_status()
    return response.json()


def header(message_id, name):
    """Return the first value of a header, case-insensitively, or None."""
    headers = get_headers(message_id)
    for key, values in headers.items():
        if key.lower() == name.lower() and values:
            return values[0]
    return None


def only_message():
    """Return the single stored message, asserting there is exactly one.

    Guards against a test passing on mail left over from another test.
    """
    messages = list_messages()
    if len(messages) != 1:
        raise AssertionError(f"expected exactly 1 message in Mailpit, found {len(messages)}")
    return messages[0]
