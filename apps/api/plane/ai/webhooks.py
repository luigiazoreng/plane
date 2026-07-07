# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import requests
from django.conf import settings

def dispatch_ai_event(workspace_id, event_type, payload):
    """
    Dispatches a webhook event to the internal plane-ai-service 
    for automation or mention processing.
    """
    if not getattr(settings, 'AI_AGENT_ENABLED', False):
        return

    ai_service_url = getattr(settings, 'AI_SERVICE_WEBHOOK_URL', 'http://localhost:3000/api/webhooks')
    
    try:
        # Fire-and-forget or async task in production
        requests.post(ai_service_url, json={
            "workspace_id": str(workspace_id),
            "event_type": event_type,
            "payload": payload
        }, timeout=2)
    except Exception as e:
        # Log failure, we don't want to break the main application flow
        print(f"Failed to dispatch AI event: {e}")
