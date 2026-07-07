# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.api.views import (
    AIAgentRunApprovalEndpoint,
)


urlpatterns = [
    path(
        "workspaces/<str:slug>/ai/runs/<uuid:run_id>/approval/",
        AIAgentRunApprovalEndpoint.as_view(http_method_names=["post"]),
        name="ai-agent-run-approval",
    ),
]
