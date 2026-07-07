# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import requests
import logging

from celery import shared_task
from django.conf import settings


logger = logging.getLogger("plane")


@shared_task
def dispatch_ai_event(workspace_id, event_type, payload):
    """
    Dispatches a webhook event to the internal plane-ai-service
    for automation or mention processing.
    Runs asynchronously via Celery to avoid blocking the main request thread.
    """
    if not getattr(settings, "AI_AGENT_ENABLED", False):
        return

    ai_service_url = getattr(
        settings, "AI_SERVICE_WEBHOOK_URL", "http://localhost:3000/api/webhooks"
    )

    try:
        response = requests.post(
            ai_service_url,
            json={
                "workspace_id": str(workspace_id),
                "event_type": event_type,
                "payload": payload,
            },
            timeout=5,
        )
        response.raise_for_status()
    except Exception as e:
        logger.error(f"Failed to dispatch AI event: {e}")
