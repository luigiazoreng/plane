# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json

# Third party imports
from django.utils import timezone
from rest_framework.response import Response
from rest_framework import status

# Module imports
from ..base import BaseViewSet, BaseAPIView
from plane.app.permissions import ProjectEntityPermission, allow_permission, ROLE
from plane.db.models import Estimate, EstimateProperty, EstimatePropertyRole, Issue, IssueEstimatePropertyValue
from plane.app.serializers import EstimatePropertySerializer, IssueEstimatePropertyValueSerializer
from plane.bgtasks.issue_activities_task import issue_activity

# Mirrors the choices on EstimatePropertyRole
KPI_ROLE_LABELS = {
    EstimatePropertyRole.DIFFICULTY: "Difficulty",
    EstimatePropertyRole.REPETITIVE: "Repetitive",
}


class EstimatePropertyListCreateEndpoint(BaseViewSet):
    """List every estimate property for a project (active + inactive, ordered by
    sort_order), and create custom (non-KPI) ones."""

    permission_classes = [ProjectEntityPermission]
    model = EstimateProperty
    serializer_class = EstimatePropertySerializer

    def get_queryset(self):
        return EstimateProperty.objects.filter(
            workspace__slug=self.kwargs["slug"], project_id=self.kwargs["project_id"]
        ).select_related("estimate")

    def list(self, request, slug, project_id):
        serializer = EstimatePropertySerializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def create(self, request, slug, project_id):
        estimate_id = request.data.get("estimate")
        if not estimate_id:
            return Response({"error": "estimate is required"}, status=status.HTTP_400_BAD_REQUEST)
            
        estimate = Estimate.objects.filter(pk=estimate_id, project_id=project_id, workspace__slug=slug).first()
        if not estimate:
            return Response({"error": "Estimate not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = EstimatePropertySerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            
        serializer.save(
            project_id=project_id,
            workspace_id=estimate.workspace_id,
            estimate=estimate
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class EstimatePropertyDetailEndpoint(BaseViewSet):
    """Rename/reconfigure/toggle a single estimate property, or delete a custom one."""

    permission_classes = [ProjectEntityPermission]
    model = EstimateProperty
    serializer_class = EstimatePropertySerializer

    def get_queryset(self):
        return EstimateProperty.objects.filter(workspace__slug=self.kwargs["slug"], project_id=self.kwargs["project_id"])

    def partial_update(self, request, slug, project_id, property_id):
        estimate_property = self.get_queryset().filter(pk=property_id).first()
        if not estimate_property:
            return Response({"error": "Estimate property not found"}, status=status.HTTP_404_NOT_FOUND)

        allowed_fields = {"name", "is_active", "sort_order", "estimate"}
        filtered_data = {k: v for k, v in request.data.items() if k in allowed_fields}

        new_estimate_id = filtered_data.get("estimate")
        if new_estimate_id and str(new_estimate_id) != str(estimate_property.estimate_id):
            if estimate_property.is_estimate_default:
                return Response(
                    {"error": "Cannot change the estimate system of a default property."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            new_estimate = Estimate.objects.filter(pk=new_estimate_id, project_id=project_id, workspace__slug=slug).first()
            if not new_estimate:
                return Response({"error": "Estimate not found"}, status=status.HTTP_404_NOT_FOUND)
            
            # Changing the estimate system invalidates all existing points assigned to this property
            IssueEstimatePropertyValue.objects.filter(
                project_id=project_id, workspace__slug=slug, property=estimate_property
            ).update(estimate_point=None)

        serializer = EstimatePropertySerializer(estimate_property, data=filtered_data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    def destroy(self, request, slug, project_id, property_id):
        estimate_property = self.get_queryset().filter(pk=property_id).first()
        if not estimate_property:
            return Response({"error": "Estimate property not found"}, status=status.HTTP_404_NOT_FOUND)
        if estimate_property.is_estimate_default:
            return Response(
                {"error": "This is the default property for its estimate system and cannot be deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if estimate_property.kpi_role:
            return Response(
                {"error": "This property is used by KPI scoring and can't be deleted, only reconfigured."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        estimate_property.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class EstimatePropertyKpiRoleEndpoint(BaseAPIView):
    """Upsert the single reserved estimate property for a KPI role (Difficulty or
    Repetitive) on a project -- used by the KPI settings page's estimate picker so
    that flow doesn't need to know about EstimateProperty ids."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def put(self, request, slug, project_id, role):
        if role not in EstimatePropertyRole.values:
            return Response({"error": "Invalid KPI role"}, status=status.HTTP_400_BAD_REQUEST)

        estimate_id = request.data.get("estimate")
        if not estimate_id:
            # Clearing the role: drop the reserved property entirely so
            # "is Difficulty configured" goes back to false.
            EstimateProperty.objects.filter(workspace__slug=slug, project_id=project_id, kpi_role=role).delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        estimate = Estimate.objects.filter(pk=estimate_id, project_id=project_id, workspace__slug=slug).first()
        if not estimate:
            return Response({"error": "Estimate not found"}, status=status.HTTP_404_NOT_FOUND)

        # Note: update_or_create's lookup kwargs double as constructor kwargs when
        # creating, so they can't include relation-traversal lookups like
        # `workspace__slug` -- `project_id` + `kpi_role` is already sufficient
        # (the estimate lookup above already confirmed project/workspace/slug agree).
        estimate_property, _ = EstimateProperty.objects.update_or_create(
            project_id=project_id,
            kpi_role=role,
            defaults={
                "name": KPI_ROLE_LABELS[role],
                "estimate": estimate,
                "workspace_id": estimate.workspace_id,
                "is_active": True,
            },
        )
        serializer = EstimatePropertySerializer(estimate_property)
        return Response(serializer.data, status=status.HTTP_200_OK)


class IssueEstimatePropertyValueListEndpoint(BaseAPIView):
    """List every estimate property value set on a single issue, so the frontend
    can populate all active property rows (sidebar, create/edit modal) with one
    request instead of one per property."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        values = IssueEstimatePropertyValue.objects.filter(
            workspace__slug=slug, project_id=project_id, issue_id=issue_id
        )
        serializer = IssueEstimatePropertyValueSerializer(values, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class IssueEstimatePropertyValueEndpoint(BaseAPIView):
    """Set/clear the selected point for one (issue, estimate property) pair."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def put(self, request, slug, project_id, issue_id, property_id):
        estimate_property = EstimateProperty.objects.filter(
            pk=property_id, project_id=project_id, workspace__slug=slug
        ).first()
        if not estimate_property:
            return Response({"error": "Estimate property not found"}, status=status.HTTP_404_NOT_FOUND)

        issue = (
            Issue.objects.filter(pk=issue_id, project_id=project_id, workspace__slug=slug)
            .select_related("project")
            .first()
        )
        if not issue:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)

        estimate_point_id = request.data.get("estimate_point")

        value, _ = IssueEstimatePropertyValue.objects.get_or_create(
            issue=issue,
            property=estimate_property,
            defaults={"project_id": project_id, "workspace_id": estimate_property.workspace_id},
        )
        old_estimate_point_id = value.estimate_point_id

        if estimate_point_id in (None, ""):
            value.estimate_point = None
            value.save(update_fields=["estimate_point", "updated_at"])
            response_data = IssueEstimatePropertyValueSerializer(value).data
            new_estimate_point_id = None
        else:
            serializer = IssueEstimatePropertyValueSerializer(
                value, data={"estimate_point": estimate_point_id}, partial=True, context={"property": estimate_property}
            )
            if not serializer.is_valid():
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            serializer.save()
            response_data = serializer.data
            new_estimate_point_id = estimate_point_id

        old_estimate_point_str = str(old_estimate_point_id) if old_estimate_point_id else None
        new_estimate_point_str = str(new_estimate_point_id) if new_estimate_point_id else None
        if old_estimate_point_str != new_estimate_point_str:
            epoch = int(timezone.now().timestamp())
            # Precise per-system activity log (Step B6) -- fires for EVERY
            # property value change, system-default rows AND custom/KPI rows
            # alike.
            issue_activity.delay(
                type="estimate_property_value.activity.updated",
                requested_data=json.dumps(
                    {"property_id": str(property_id), "estimate_point": new_estimate_point_str}
                ),
                current_instance=json.dumps({"estimate_point": old_estimate_point_str}),
                issue_id=str(issue_id),
                actor_id=str(request.user.id),
                project_id=str(project_id),
                epoch=epoch,
            )

            # Legacy dual-write (Design Decision 2): keep Issue.estimate_point
            # in sync only when this change is to the DEFAULT property of the
            # project's DEFAULT estimate system -- preserves the public API /
            # filters / sort / export / activity log behavior that already
            # reads Issue.estimate_point, for free, via the existing
            # track_estimate_points tracker.
            if (
                estimate_property.is_estimate_default
                and estimate_property.estimate_id == issue.project.estimate_id
            ):
                issue.estimate_point_id = new_estimate_point_id
                issue.save(update_fields=["estimate_point", "updated_at"])
                issue_activity.delay(
                    type="issue.activity.updated",
                    requested_data=json.dumps({"estimate_point": new_estimate_point_str}),
                    current_instance=json.dumps({"estimate_point": old_estimate_point_str}),
                    issue_id=str(issue_id),
                    actor_id=str(request.user.id),
                    project_id=str(project_id),
                    epoch=epoch,
                )

        return Response(response_data, status=status.HTTP_200_OK)
