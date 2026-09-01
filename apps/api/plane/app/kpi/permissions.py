# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Access control for the workspace-level KPI panels.

Mirrors plane.app.helpdesk.permissions, with one difference: helpdesk has a role
ladder, this has none. The panels are read-only, so the question is only whether
someone may open them.
"""

from functools import wraps

from rest_framework import status
from rest_framework.response import Response

from plane.db.models import WorkspaceKpiAccess, WorkspaceMember

ADMIN = 20


def has_workspace_kpi_access(user, workspace_slug) -> bool:
    """Whether the user may open the workspace KPI and Executive panels.

    Workspace admins always may. Every other role needs an explicit grant, which
    an admin manages from workspace settings. Returns False for non-members, so
    callers do not need a separate membership check.
    """
    workspace_member = WorkspaceMember.objects.filter(
        member=user, workspace__slug=workspace_slug, is_active=True
    ).first()
    if not workspace_member:
        return False
    if workspace_member.role == ADMIN:
        return True
    return WorkspaceKpiAccess.objects.filter(
        member=user,
        workspace__slug=workspace_slug,
        is_active=True,
        deleted_at__isnull=True,
    ).exists()


def require_workspace_kpi_access(view_func):
    """Gate a workspace-level KPI endpoint.

    Replaces @allow_permission rather than stacking with it: has_workspace_kpi_access
    already rejects anyone who is not an active member of the workspace.
    """

    @wraps(view_func)
    def _wrapped_view(instance, request, *args, **kwargs):
        if not has_workspace_kpi_access(request.user, kwargs["slug"]):
            return Response(
                {"error": "You don't have the required permissions."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return view_func(instance, request, *args, **kwargs)

    return _wrapped_view
