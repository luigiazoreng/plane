# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import random
import string
import json

# Django imports
from django.utils import timezone

# Third party imports
from rest_framework.response import Response
from rest_framework import status

# Module imports
from ..base import BaseViewSet, BaseAPIView
from plane.app.permissions import ProjectEntityPermission, allow_permission, ROLE
from plane.db.models import (
    Project,
    Estimate,
    EstimatePoint,
    EstimateProperty,
    Issue,
    IssueEstimatePropertyValue,
    NUMERIC_ESTIMATE_TYPES,
)
from plane.app.serializers import (
    EstimateSerializer,
    EstimatePointSerializer,
    EstimateReadSerializer,
)
from plane.utils.cache import invalidate_cache
from plane.bgtasks.issue_activities_task import issue_activity

# Mirrors packages/constants/src/estimates.ts's `estimateCount`
ESTIMATE_POINT_COUNT_MIN = 2
ESTIMATE_POINT_COUNT_MAX = 6


def generate_random_name(length=10):
    letters = string.ascii_lowercase
    return "".join(random.choice(letters) for i in range(length))


def _activate_numeric_estimate(project, estimate):
    """Enforce at most one active (last_used=True) numeric (points/time) estimate per
    project. Categories estimates are exempt since they're excluded from analytics.

    If the estimate being deactivated was the project's default, promote the newly
    activated estimate to default so `project.estimate` never points at an inactive row.
    """
    if estimate.type not in NUMERIC_ESTIMATE_TYPES:
        return
    conflicting = Estimate.objects.filter(
        workspace_id=project.workspace_id,
        project_id=project.id,
        last_used=True,
        type__in=NUMERIC_ESTIMATE_TYPES,
    ).exclude(pk=estimate.id)
    conflicting_ids = list(conflicting.values_list("id", flat=True))
    if not conflicting_ids:
        return
    conflicting.update(last_used=False)
    if project.estimate_id in conflicting_ids:
        project.estimate = estimate
        project.save(update_fields=["estimate", "updated_at"])


class ProjectEstimatePointEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def get(self, request, slug, project_id):
        project = Project.objects.get(workspace__slug=slug, pk=project_id)
        if project.estimate_id is not None:
            # Scope to the project's actual default estimate, not every active
            # estimate -- a project can have multiple active (last_used=True)
            # estimates of different types (see _activate_numeric_estimate).
            estimate_points = EstimatePoint.objects.filter(
                project_id=project_id,
                workspace__slug=slug,
                estimate_id=project.estimate_id,
            )
            serializer = EstimatePointSerializer(estimate_points, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response([], status=status.HTTP_200_OK)


class BulkEstimatePointEndpoint(BaseViewSet):
    permission_classes = [ProjectEntityPermission]
    model = Estimate
    serializer_class = EstimateSerializer

    def list(self, request, slug, project_id):
        estimates = (
            Estimate.objects.filter(workspace__slug=slug, project_id=project_id)
            .prefetch_related("points")
            .select_related("workspace", "project")
        )
        serializer = EstimateReadSerializer(estimates, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @invalidate_cache(path="/api/workspaces/:slug/estimates/", url_params=True, user=False)
    def create(self, request, slug, project_id):
        project = Project.objects.get(workspace__slug=slug, pk=project_id)
        estimate_payload = request.data.get("estimate") or {}
        estimate_name = (estimate_payload.get("name") or "").strip() or generate_random_name()
        estimate_points_data = request.data.get("estimate_points", [])

        if not (ESTIMATE_POINT_COUNT_MIN <= len(estimate_points_data) <= ESTIMATE_POINT_COUNT_MAX):
            return Response(
                {
                    "error": (
                        f"An estimate must have between {ESTIMATE_POINT_COUNT_MIN} and "
                        f"{ESTIMATE_POINT_COUNT_MAX} points"
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if Estimate.objects.filter(workspace__slug=slug, project_id=project_id, name=estimate_name).exists():
            return Response(
                {"error": "An estimate with this name already exists"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        estimate_serializer = EstimateSerializer(
            data={
                "name": estimate_name,
                "type": estimate_payload.get("type", "categories"),
                "last_used": estimate_payload.get("last_used", False),
            }
        )
        if not estimate_serializer.is_valid():
            return Response(estimate_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        estimate_type = estimate_serializer.validated_data.get("type")
        points_serializer = EstimatePointSerializer(
            data=estimate_points_data, many=True, context={"estimate_type": estimate_type}
        )
        if not points_serializer.is_valid():
            return Response(points_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        estimate = estimate_serializer.save(project_id=project_id)

        EstimatePoint.objects.bulk_create(
            [
                EstimatePoint(
                    estimate=estimate,
                    key=estimate_point.get("key", 0),
                    value=estimate_point.get("value", ""),
                    description=estimate_point.get("description", ""),
                    project_id=project_id,
                    workspace_id=estimate.workspace_id,
                    created_by=request.user,
                    updated_by=request.user,
                )
                for estimate_point in estimate_points_data
            ],
            batch_size=10,
            ignore_conflicts=True,
        )

        if project.estimate_id is None:
            project.estimate = estimate
            project.save(update_fields=["estimate", "updated_at"])
            if not estimate.last_used:
                estimate.last_used = True
                estimate.save(update_fields=["last_used", "updated_at"])

        if estimate.last_used:
            _activate_numeric_estimate(project, estimate)

        serializer = EstimateReadSerializer(estimate)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def retrieve(self, request, slug, project_id, estimate_id):
        estimate = Estimate.objects.get(pk=estimate_id, workspace__slug=slug, project_id=project_id)
        serializer = EstimateReadSerializer(estimate)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @invalidate_cache(path="/api/workspaces/:slug/estimates/", url_params=True, user=False)
    def partial_update(self, request, slug, project_id, estimate_id):
        estimate_payload = request.data.get("estimate") or {}
        estimate_points_data = request.data.get("estimate_points", [])

        if not estimate_payload and not estimate_points_data:
            return Response(
                {"error": "Estimate or estimate points are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        estimate = Estimate.objects.get(pk=estimate_id, workspace__slug=slug, project_id=project_id)
        project = Project.objects.get(workspace__slug=slug, pk=project_id)

        if estimate_payload:
            metadata = {}
            estimate_name = estimate_payload.get("name")
            if isinstance(estimate_name, str) and estimate_name.strip():
                metadata["name"] = estimate_name.strip()
            if "type" in estimate_payload:
                metadata["type"] = estimate_payload.get("type")
            if "last_used" in estimate_payload:
                metadata["last_used"] = bool(estimate_payload.get("last_used"))

            if metadata:
                estimate_serializer = EstimateSerializer(estimate, data=metadata, partial=True)
                if not estimate_serializer.is_valid():
                    return Response(estimate_serializer.errors, status=status.HTTP_400_BAD_REQUEST)
                estimate = estimate_serializer.save()

            if estimate.last_used and project.estimate_id is None:
                project.estimate = estimate
                project.save(update_fields=["estimate", "updated_at"])
            elif not estimate.last_used and project.estimate_id == estimate.id:
                replacement_estimate = (
                    Estimate.objects.filter(workspace__slug=slug, project_id=project_id, last_used=True)
                    .exclude(pk=estimate_id)
                    .order_by("-created_at")
                    .first()
                )
                project.estimate = replacement_estimate
                project.save(update_fields=["estimate", "updated_at"])

            if estimate.last_used:
                _activate_numeric_estimate(project, estimate)

        if not estimate_points_data:
            estimate_serializer = EstimateReadSerializer(estimate)
            return Response(estimate_serializer.data, status=status.HTTP_200_OK)

        estimate_points = EstimatePoint.objects.filter(
            pk__in=[estimate_point.get("id") for estimate_point in estimate_points_data],
            workspace__slug=slug,
            project_id=project_id,
            estimate_id=estimate_id,
        )

        points_serializer = EstimatePointSerializer(
            data=estimate_points_data, many=True, partial=True, context={"estimate_type": estimate.type}
        )
        if not points_serializer.is_valid():
            return Response(points_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        updated_estimate_points = []
        for estimate_point in estimate_points:
            # Find the data for that estimate point
            estimate_point_data = [point for point in estimate_points_data if point.get("id") == str(estimate_point.id)]
            if len(estimate_point_data):
                estimate_point.value = estimate_point_data[0].get("value", estimate_point.value)
                estimate_point.key = estimate_point_data[0].get("key", estimate_point.key)
                updated_estimate_points.append(estimate_point)

        EstimatePoint.objects.bulk_update(updated_estimate_points, ["key", "value"], batch_size=10)

        estimate_serializer = EstimateReadSerializer(estimate)
        return Response(estimate_serializer.data, status=status.HTTP_200_OK)

    @invalidate_cache(path="/api/workspaces/:slug/estimates/", url_params=True, user=False)
    def destroy(self, request, slug, project_id, estimate_id):
        estimate = Estimate.objects.get(pk=estimate_id, workspace__slug=slug, project_id=project_id)
        replacement_estimate = (
            Estimate.objects.filter(workspace__slug=slug, project_id=project_id, last_used=True)
            .exclude(pk=estimate_id)
            .order_by("-created_at")
            .first()
        )
        Project.objects.filter(pk=project_id, estimate_id=estimate_id).update(estimate=replacement_estimate)

        # Null out references synchronously rather than relying solely on the
        # async soft-delete cascade (soft_delete_related_objects) -- Estimate.
        # delete() is a soft delete, so Django's own on_delete=SET_NULL/CASCADE
        # collector never fires for it, and the user-visible effect shouldn't
        # depend on Celery being up.
        Issue.objects.filter(project_id=project_id, estimate_point__estimate_id=estimate_id).update(
            estimate_point=None
        )
        IssueEstimatePropertyValue.objects.filter(
            workspace__slug=slug, estimate_point__estimate_id=estimate_id
        ).update(estimate_point=None)
        # EstimateProperty.estimate is required (not nullable) -- a property
        # whose estimate was just deleted can't be repointed, so soft-delete it
        # too (covers both KPI-tagged and custom properties; the async cascade
        # would eventually do the same, this just makes it immediate).
        EstimateProperty.objects.filter(workspace__slug=slug, estimate_id=estimate_id).update(
            deleted_at=timezone.now()
        )

        estimate.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class EstimatePointEndpoint(BaseViewSet):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def create(self, request, slug, project_id, estimate_id):
        #  TODO: add a key validation if the same key already exists
        if not request.data.get("key") or not request.data.get("value"):
            return Response(
                {"error": "Key and value are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Ensure the estimate belongs to this project/workspace before attaching a point to it
        estimate = Estimate.objects.get(pk=estimate_id, project_id=project_id, workspace__slug=slug)

        serializer = EstimatePointSerializer(data=request.data, context={"estimate_type": estimate.type})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        key = serializer.validated_data.get("key", request.data.get("key", 0))
        value = serializer.validated_data.get("value", request.data.get("value", ""))
        estimate_point = EstimatePoint.objects.create(
            estimate_id=estimate_id, project_id=project_id, key=key, value=value
        )
        serializer = EstimatePointSerializer(estimate_point).data
        return Response(serializer, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def partial_update(self, request, slug, project_id, estimate_id, estimate_point_id):
        #  TODO: add a key validation if the same key already exists
        estimate_point = EstimatePoint.objects.get(
            pk=estimate_point_id,
            estimate_id=estimate_id,
            project_id=project_id,
            workspace__slug=slug,
        )
        serializer = EstimatePointSerializer(
            estimate_point, data=request.data, partial=True,
            context={"estimate_type": estimate_point.estimate.type},
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def destroy(self, request, slug, project_id, estimate_id, estimate_point_id):
        new_estimate_id = request.data.get("new_estimate_id", None)
        estimate_points = EstimatePoint.objects.filter(
            estimate_id=estimate_id, project_id=project_id, workspace__slug=slug
        )
        # Confirm the point actually belongs to this project/estimate/workspace
        # before doing anything else (404 for a mismatched id rather than a
        # confusing "must have at least N points" on an empty scoped queryset).
        if not estimate_points.filter(pk=estimate_point_id).exists():
            return Response(status=status.HTTP_404_NOT_FOUND, data={"error": "Estimate point not found"})
        if estimate_points.count() <= ESTIMATE_POINT_COUNT_MIN:
            return Response(
                {"error": f"An estimate must have at least {ESTIMATE_POINT_COUNT_MIN} points"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # update all the issues with the new estimate
        if new_estimate_id:
            issues = Issue.objects.filter(
                project_id=project_id,
                workspace__slug=slug,
                estimate_point_id=estimate_point_id,
            )
            for issue in issues:
                issue_activity.delay(
                    type="issue.activity.updated",
                    requested_data=json.dumps({"estimate_point": (str(new_estimate_id) if new_estimate_id else None)}),
                    actor_id=str(request.user.id),
                    issue_id=issue.id,
                    project_id=str(project_id),
                    current_instance=json.dumps(
                        {"estimate_point": (str(issue.estimate_point_id) if issue.estimate_point_id else None)}
                    ),
                    epoch=int(timezone.now().timestamp()),
                )
                issues.update(estimate_point_id=new_estimate_id)
        else:
            issues = Issue.objects.filter(
                project_id=project_id,
                workspace__slug=slug,
                estimate_point_id=estimate_point_id,
            )
            for issue in issues:
                issue_activity.delay(
                    type="issue.activity.updated",
                    requested_data=json.dumps({"estimate_point": None}),
                    actor_id=str(request.user.id),
                    issue_id=issue.id,
                    project_id=str(project_id),
                    current_instance=json.dumps(
                        {"estimate_point": (str(issue.estimate_point_id) if issue.estimate_point_id else None)}
                    ),
                    epoch=int(timezone.now().timestamp()),
                )

        # delete the estimate point
        old_estimate_point = EstimatePoint.objects.get(
            pk=estimate_point_id,
            estimate_id=estimate_id,
            project_id=project_id,
            workspace__slug=slug,
        )

        # rearrange the estimate points
        updated_estimate_points = []
        for estimate_point in estimate_points:
            if estimate_point.key > old_estimate_point.key:
                estimate_point.key -= 1
                updated_estimate_points.append(estimate_point)

        EstimatePoint.objects.bulk_update(updated_estimate_points, ["key"], batch_size=10)

        old_estimate_point.delete()

        return Response(
            EstimatePointSerializer(updated_estimate_points, many=True).data,
            status=status.HTTP_200_OK,
        )
