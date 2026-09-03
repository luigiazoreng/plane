# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path
from plane.app.views import (
    AIAgentConversationDetailEndpoint,
    AIAgentConversationEndpoint,
    AIAgentRunApprovalEndpoint,
    AIAgentRunDetailEndpoint,
    AIAgentRunEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/ai/runs/",
        AIAgentRunEndpoint.as_view(),
        name="ai-agent-runs",
    ),
    path(
        "workspaces/<str:slug>/ai/runs/<uuid:run_id>/",
        AIAgentRunDetailEndpoint.as_view(),
        name="ai-agent-run-detail",
    ),
    path(
        "workspaces/<str:slug>/ai/runs/<uuid:run_id>/approval/",
        AIAgentRunApprovalEndpoint.as_view(),
        name="ai-agent-run-approval",
    ),
    path(
        "workspaces/<str:slug>/ai/conversations/",
        AIAgentConversationEndpoint.as_view(),
        name="ai-agent-conversations",
    ),
    path(
        "workspaces/<str:slug>/ai/conversations/<uuid:conversation_id>/",
        AIAgentConversationDetailEndpoint.as_view(),
        name="ai-agent-conversation-detail",
    ),
]
