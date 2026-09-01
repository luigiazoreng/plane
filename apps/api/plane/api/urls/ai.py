# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.api.views import (
    AIAgentRunEndpoint,
    AIAgentRunDetailEndpoint,
    AIAgentRunApprovalEndpoint,
    AIAgentConversationEndpoint,
    AIAgentConversationDetailEndpoint,
)


urlpatterns = [
    path(
        "workspaces/<str:slug>/ai/runs/",
        AIAgentRunEndpoint.as_view(http_method_names=["get", "post"]),
        name="ai-agent-run-list-create",
    ),
    path(
        "workspaces/<str:slug>/ai/runs/<uuid:run_id>/",
        AIAgentRunDetailEndpoint.as_view(http_method_names=["get"]),
        name="ai-agent-run-detail",
    ),
    path(
        "workspaces/<str:slug>/ai/runs/<uuid:run_id>/approval/",
        AIAgentRunApprovalEndpoint.as_view(http_method_names=["post"]),
        name="ai-agent-run-approval",
    ),
    path(
        "workspaces/<str:slug>/ai/conversations/",
        AIAgentConversationEndpoint.as_view(http_method_names=["get", "post"]),
        name="ai-agent-conversation-list-create",
    ),
    path(
        "workspaces/<str:slug>/ai/conversations/<uuid:conversation_id>/",
        AIAgentConversationDetailEndpoint.as_view(http_method_names=["get", "delete"]),
        name="ai-agent-conversation-detail",
    ),
]
