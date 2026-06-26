# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status

from plane.db.models import Estimate, EstimatePoint, Project, ProjectMember


def get_estimates_url(workspace_slug: str, project_id) -> str:
    return f"/api/workspaces/{workspace_slug}/projects/{project_id}/estimates/"


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
                "estimate_points": [{"key": 1, "value": "1"}],
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
                "estimate_points": [{"key": 1, "value": "Easy"}],
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
