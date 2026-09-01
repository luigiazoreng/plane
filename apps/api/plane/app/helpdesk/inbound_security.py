# Python imports
import hmac
import logging
import os

# Module imports
from plane.license.utils.instance_value import get_configuration_value

logger = logging.getLogger("plane.worker")

# SendGrid's Inbound Parse cannot sign payloads nor send custom headers by
# itself (the ECDSA signature belongs to the Event Webhook, not to Inbound
# Parse). The shared secret therefore travels either in a header — when the
# provider/proxy is able to add one — or, as a fallback, in the query string
# of the configured Inbound Parse URL.
INBOUND_SECRET_HEADER = "HTTP_X_HELPDESK_INBOUND_SECRET"
INBOUND_SECRET_QUERY_PARAM = "token"


def get_inbound_secret():
    """Return the configured inbound webhook secret, or "" when unset.

    The explicit ``default`` matters: with ``SKIP_ENV_VAR=True`` (the
    self-hosted default) ``get_configuration_value`` ignores ``os.environ`` and
    reads only from ``InstanceConfiguration``. Without it, a missing row would
    resolve to ``None`` instead of falling back to the environment variable.
    """
    (secret,) = get_configuration_value(
        [
            {
                "key": "HELPDESK_INBOUND_WEBHOOK_SECRET",
                "default": os.environ.get("HELPDESK_INBOUND_WEBHOOK_SECRET", ""),
            }
        ]
    )
    return secret or ""


def _get_provided_secret(request):
    """Read the secret from the request: header first, query param as fallback.

    The header takes precedence even when it holds a wrong value, so that a
    misconfigured query string cannot be used to bypass a header-based setup.
    """
    provided = request.META.get(INBOUND_SECRET_HEADER, "") or ""
    if provided:
        return provided
    return request.GET.get(INBOUND_SECRET_QUERY_PARAM, "") or ""


def verify_inbound_secret(request):
    """Fail-closed verification of the inbound webhook shared secret."""
    expected = get_inbound_secret()
    if not expected:
        # Fail closed on purpose: silently accepting would let anyone forge
        # comments, and silently returning 200 would drop legitimate mail
        # without a trace. A constant 403 is loud and diagnosable.
        logger.warning("helpdesk inbound rejected: webhook secret is not configured")
        return False

    provided = _get_provided_secret(request)
    if not provided:
        return False

    # Compare as bytes: compare_digest on str only accepts pure ASCII and
    # would raise TypeError for a non-ASCII secret, which would surface as a
    # 500 and make the provider retry indefinitely.
    return hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8"))
