# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework.throttling import AnonRateThrottle


class HelpdeskInboundThrottle(AnonRateThrottle):
    """Rate limit for the helpdesk inbound email webhook.

    The endpoint is anonymous, so without this it inherits the global
    ``anon`` rate of 30/minute. All SendGrid traffic arrives from the same
    pool of IPs, so a legitimate burst of inbound email would produce 429s,
    which in turn make SendGrid retry -- amplifying the duplicate-comment
    problem instead of containing it.

    Deliberately per-IP (inherited from AnonRateThrottle) rather than a single
    global bucket: throttling runs in ``initial()``, before the handler and
    therefore before the shared-secret check. A global bucket would let any
    anonymous caller exhaust the quota and deny service to real inbound mail.
    """

    scope = "helpdesk_inbound"


class HelpdeskPublicAssetThrottle(AnonRateThrottle):
    """Rate limit for attachment uploads from the public customer portal.

    Portal customers are not Plane users, so this endpoint cannot sit behind
    the normal authenticated asset flow -- on an open portal it accepts uploads
    from anyone with the URL. Without a dedicated bucket it is free storage for
    the internet.

    Lower than the inbound rate on purpose: a human picking files in a browser
    has no legitimate reason to exceed this, whereas a mail provider batching
    deliveries does.
    """

    scope = "helpdesk_public_asset"


class HelpdeskPublicAuthThrottle(AnonRateThrottle):
    """Rate limit for public customer authentication and password reset endpoints.

    Limits abuse, email flooding, and brute-force attempts on public portal auth.
    """

    scope = "helpdesk_public_auth"

