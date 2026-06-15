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

        estimate_points = list(
            EstimatePoint.objects.filter(estimate=estimate).order_by("key").values_list("value", flat=True)
        )
        assert estimate_points == ["60", "90", "120"]
