# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import WorkspaceKpiAccessSerializer
from plane.app.views.base import BaseAPIView
from plane.db.models import Workspace, WorkspaceKpiAccess, WorkspaceMember


class WorkspaceKpiAccessEndpoint(BaseAPIView):
    """Manage who, besides workspace admins, may open the workspace KPI panels.

    Admin-only in every direction, including the read: the list names people who
    can see performance data, which is itself information about the team.
    Mirrors HelpdeskMemberViewSet, minus the role ladder.
    """

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        grants = (
            WorkspaceKpiAccess.objects.filter(
                workspace__slug=slug, is_active=True, deleted_at__isnull=True
            )
            .select_related("member", "workspace")
            .order_by("member__display_name")
        )
        return Response(WorkspaceKpiAccessSerializer(grants, many=True).data)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        member_ids = request.data.get("members", [])
        if not member_ids:
            return Response(
                {"error": "Provide at least one member."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        workspace = Workspace.objects.get(slug=slug)

        # A grant only means something for someone already in the workspace;
        # accepting an arbitrary id would leave rows that never resolve.
        valid_ids = set(
            str(member_id)
            for member_id in WorkspaceMember.objects.filter(
                workspace=workspace, member_id__in=member_ids, is_active=True
            ).values_list("member_id", flat=True)
        )
        unknown = [str(member_id) for member_id in member_ids if str(member_id) not in valid_ids]
        if unknown:
            return Response(
                {"error": f"Not active members of this workspace: {', '.join(unknown)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        to_create = []
        for member_id in valid_ids:
            # A revoked grant is a soft-deleted row that unique_together still
            # matches, so reviving beats inserting a duplicate.
            existing = WorkspaceKpiAccess.objects.filter(workspace=workspace, member_id=member_id).first()
            if existing:
                existing.is_active = True
                existing.deleted_at = None
                existing.save(update_fields=["is_active", "deleted_at"])
            else:
                to_create.append(WorkspaceKpiAccess(workspace=workspace, member_id=member_id))

        if to_create:
            WorkspaceKpiAccess.objects.bulk_create(to_create, batch_size=10, ignore_conflicts=True)

        granted = (
            WorkspaceKpiAccess.objects.filter(workspace=workspace, member_id__in=valid_ids, is_active=True)
            .select_related("member", "workspace")
            .order_by("member__display_name")
        )
        return Response(
            WorkspaceKpiAccessSerializer(granted, many=True).data,
            status=status.HTTP_201_CREATED,
        )


class WorkspaceKpiAccessDetailEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug, pk):
        grant = WorkspaceKpiAccess.objects.filter(pk=pk, workspace__slug=slug, is_active=True).first()
        if not grant:
            return Response({"error": "Grant not found."}, status=status.HTTP_404_NOT_FOUND)

        grant.is_active = False
        grant.save(update_fields=["is_active"])
        return Response(status=status.HTTP_204_NO_CONTENT)
