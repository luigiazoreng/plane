# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status

from plane.db.models import Estimate, EstimatePoint, Project, ProjectMember


def get_estimates_url(workspace_slug: str, project_id) -> str:
    return f"/api/workspaces/{workspace_slug}/projects/{project_id}/estimates/"


def get_estimate_point_create_url(workspace_slug: str, project_id, estimate_id) -> str:
    return f"/api/workspaces/{workspace_slug}/projects/{project_id}/estimates/{estimate_id}/estimate-points/"


def get_estimate_point_detail_url(workspace_slug: str, project_id, estimate_id, estimate_point_id) -> str:
    return (
        f"/api/workspaces/{workspace_slug}/projects/{project_id}/estimates/"
        f"{estimate_id}/estimate-points/{estimate_point_id}/"
    )


@pytest.mark.contract
class TestEstimateAppAPI:
    @pytest.mark.django_db
    def test_create_time_estimate_system(self, session_client, workspace, create_user):
        project = Project.objects.create(
            name="Estimate Project",
            identifier="EP",
            workspace=workspace,
            created_by=create_user,
            updated_by=create_user,
        )
        ProjectMember.objects.create(project=project, member=create_user, role=20)

        response = session_client.post(
            get_estimates_url(workspace.slug, project.id),
            {
                "estimate": {
                    "name": "Time",
                    "type": "time",
                    "last_used": True,
                },
                "estimate_points": [
                    {"key": 1, "value": "60"},
                    {"key": 2, "value": "90"},
                    {"key": 3, "value": "120"},
                ],
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["type"] == "time"
        assert response.data["last_used"] is True
        assert len(response.data["points"]) == 3
        assert sorted((point["value"] for point in response.data["points"]), key=int) == ["60", "90", "120"]

        estimate = Estimate.objects.get(project=project)
        assert estimate.type == "time"
        project.refresh_from_db()
        assert project.estimate_id == estimate.id

        estimate_points = list(
            EstimatePoint.objects.filter(estimate=estimate).order_by("key").values_list("value", flat=True)
        )
        assert estimate_points == ["60", "90", "120"]

    @pytest.mark.django_db
    def test_project_can_have_multiple_estimate_systems_with_single_active_project_estimate(
        self, session_client, workspace, create_user
    ):
        project = Project.objects.create(
            name="Estimate Project",
            identifier="EP",
            workspace=workspace,
            created_by=create_user,
            updated_by=create_user,
        )
        ProjectMember.objects.create(project=project, member=create_user, role=20)

        first = session_client.post(
            get_estimates_url(workspace.slug, project.id),
            {
                "estimate": {"name": "Points", "type": "points", "last_used": False},
                "estimate_points": [{"key": 1, "value": "1"}, {"key": 2, "value": "2"}],
            },
            format="json",
        )
        assert first.status_code == status.HTTP_200_OK
        first_id = first.data["id"]
        project.refresh_from_db()
        assert str(project.estimate_id) == first_id

        second = session_client.post(
            get_estimates_url(workspace.slug, project.id),
            {
                "estimate": {"name": "Categories", "type": "categories", "last_used": True},
                "estimate_points": [{"key": 1, "value": "Easy"}, {"key": 2, "value": "Hard"}],
            },
            format="json",
        )
        assert second.status_code == status.HTTP_200_OK
        second_id = second.data["id"]

        project.refresh_from_db()
        assert str(project.estimate_id) == first_id

        response = session_client.get(get_estimates_url(workspace.slug, project.id))
        assert response.status_code == status.HTTP_200_OK
        returned_ids = {row["id"] for row in response.data}
        assert {first_id, second_id}.issubset(returned_ids)

        project.estimate_id = second_id
        project.save(update_fields=["estimate"])
        assert str(Project.objects.get(id=project.id).estimate_id) == second_id

    @pytest.mark.django_db
    def test_activating_second_numeric_estimate_deactivates_first(self, session_client, workspace, create_user):
        project = Project.objects.create(
            name="Estimate Project",
            identifier="EP",
            workspace=workspace,
            created_by=create_user,
            updated_by=create_user,
        )
        ProjectMember.objects.create(project=project, member=create_user, role=20)

        first = session_client.post(
            get_estimates_url(workspace.slug, project.id),
            {
                "estimate": {"name": "Points", "type": "points", "last_used": True},
                "estimate_points": [{"key": 1, "value": "1"}, {"key": 2, "value": "2"}],
            },
            format="json",
        )
        assert first.status_code == status.HTTP_200_OK
        first_id = first.data["id"]

        second = session_client.post(
            get_estimates_url(workspace.slug, project.id),
            {
                "estimate": {"name": "Time", "type": "time", "last_used": True},
                "estimate_points": [{"key": 1, "value": "60"}, {"key": 2, "value": "120"}],
            },
            format="json",
        )
        assert second.status_code == status.HTTP_200_OK
        second_id = second.data["id"]

        # Only one numeric estimate can stay active; the second activation
        # deactivates the first and (since the first was the project default)
        # becomes the new default.
        assert Estimate.objects.get(pk=first_id).last_used is False
        assert Estimate.objects.get(pk=second_id).last_used is True
        project.refresh_from_db()
        assert str(project.estimate_id) == second_id

        # A Categories estimate is exempt from the single-active-numeric rule.
        third = session_client.post(
            get_estimates_url(workspace.slug, project.id),
            {
                "estimate": {"name": "Categories", "type": "categories", "last_used": True},
                "estimate_points": [{"key": 1, "value": "Easy"}, {"key": 2, "value": "Hard"}],
            },
            format="json",
        )
        assert third.status_code == status.HTTP_200_OK
        assert Estimate.objects.get(pk=second_id).last_used is True
        assert Estimate.objects.get(pk=third.data["id"]).last_used is True

    @pytest.mark.django_db
    def test_estimate_point_create_rejects_estimate_from_another_project(
        self, session_client, workspace, create_user
    ):
        project_a = Project.objects.create(
            name="Project A", identifier="PA", workspace=workspace, created_by=create_user, updated_by=create_user
        )
        project_b = Project.objects.create(
            name="Project B", identifier="PB", workspace=workspace, created_by=create_user, updated_by=create_user
        )
        ProjectMember.objects.create(project=project_a, member=create_user, role=20)
        ProjectMember.objects.create(project=project_b, member=create_user, role=20)

        estimate_a = Estimate.objects.create(name="A Points", project=project_a, type="points", created_by=create_user)

        # Attempt to attach a point to project A's estimate via project B's URL.
        response = session_client.post(
            get_estimate_point_create_url(workspace.slug, project_b.id, estimate_a.id),
            {"key": 1, "value": "1"},
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert not EstimatePoint.objects.filter(estimate=estimate_a).exists()

    @pytest.mark.django_db
    def test_estimate_point_destroy_rejects_point_from_another_project(
        self, session_client, workspace, create_user
    ):
        project_a = Project.objects.create(
            name="Project A", identifier="PA", workspace=workspace, created_by=create_user, updated_by=create_user
        )
        project_b = Project.objects.create(
            name="Project B", identifier="PB", workspace=workspace, created_by=create_user, updated_by=create_user
        )
        ProjectMember.objects.create(project=project_a, member=create_user, role=20)
        ProjectMember.objects.create(project=project_b, member=create_user, role=20)

        estimate_a = Estimate.objects.create(name="A Points", project=project_a, type="points", created_by=create_user)
        point_a = EstimatePoint.objects.create(estimate=estimate_a, project=project_a, key=1, value="1")

        # Attempt to delete project A's point via project B's URL.
        response = session_client.delete(
            get_estimate_point_detail_url(workspace.slug, project_b.id, estimate_a.id, point_a.id)
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert EstimatePoint.objects.filter(pk=point_a.id).exists()

    @pytest.mark.django_db
    def test_create_rejects_non_numeric_value_for_points_estimate(self, session_client, workspace, create_user):
        project = Project.objects.create(
            name="Estimate Project",
            identifier="EP",
            workspace=workspace,
            created_by=create_user,
            updated_by=create_user,
        )
        ProjectMember.objects.create(project=project, member=create_user, role=20)

        response = session_client.post(
            get_estimates_url(workspace.slug, project.id),
            {
                "estimate": {"name": "Points", "type": "points", "last_used": True},
                "estimate_points": [{"key": 1, "value": "1"}, {"key": 2, "value": "XS"}],
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not Estimate.objects.filter(project=project, name="Points").exists()

    @pytest.mark.django_db
    def test_create_rejects_point_count_outside_bounds(self, session_client, workspace, create_user):
        project = Project.objects.create(
            name="Estimate Project",
            identifier="EP",
            workspace=workspace,
            created_by=create_user,
            updated_by=create_user,
        )
        ProjectMember.objects.create(project=project, member=create_user, role=20)

        too_few = session_client.post(
            get_estimates_url(workspace.slug, project.id),
            {
                "estimate": {"name": "Points", "type": "points", "last_used": True},
                "estimate_points": [{"key": 1, "value": "1"}],
            },
            format="json",
        )
        assert too_few.status_code == status.HTTP_400_BAD_REQUEST

        too_many = session_client.post(
            get_estimates_url(workspace.slug, project.id),
            {
                "estimate": {"name": "Points", "type": "points", "last_used": True},
                "estimate_points": [{"key": i, "value": str(i)} for i in range(1, 8)],
            },
            format="json",
        )
        assert too_many.status_code == status.HTTP_400_BAD_REQUEST
        assert not Estimate.objects.filter(project=project, name="Points").exists()
