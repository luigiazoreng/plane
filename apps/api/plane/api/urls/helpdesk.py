# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.api.views.helpdesk import (
    HelpdeskPriorityListAPIEndpoint,
    HelpdeskRequestDetailAPIEndpoint,
    HelpdeskRequestListCreateAPIEndpoint,
    HelpdeskRequestRecurrenceAPIEndpoint,
    HelpdeskSLAPolicyDetailAPIEndpoint,
    HelpdeskSLAPolicyListCreateAPIEndpoint,
    HelpdeskSLASummaryAPIEndpoint,
    HelpdeskStatusListAPIEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/helpdesk/requests/",
        HelpdeskRequestListCreateAPIEndpoint.as_view(http_method_names=["get", "post"]),
        name="helpdesk-requests",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/requests/<uuid:request_id>/",
        HelpdeskRequestDetailAPIEndpoint.as_view(http_method_names=["get", "patch", "delete"]),
        name="helpdesk-requests",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/requests/<uuid:request_id>/recurrence/",
        HelpdeskRequestRecurrenceAPIEndpoint.as_view(http_method_names=["get", "post"]),
        name="helpdesk-request-recurrence",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/priorities/",
        HelpdeskPriorityListAPIEndpoint.as_view(http_method_names=["get"]),
        name="helpdesk-priorities",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/statuses/",
        HelpdeskStatusListAPIEndpoint.as_view(http_method_names=["get"]),
        name="helpdesk-statuses",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/sla-policies/",
        HelpdeskSLAPolicyListCreateAPIEndpoint.as_view(http_method_names=["get", "post"]),
        name="helpdesk-sla-policies",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/sla-policies/<uuid:policy_id>/",
        HelpdeskSLAPolicyDetailAPIEndpoint.as_view(http_method_names=["get", "patch", "delete"]),
        name="helpdesk-sla-policies",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/sla/summary/",
        HelpdeskSLASummaryAPIEndpoint.as_view(http_method_names=["get"]),
        name="helpdesk-sla-summary",
    ),
]
