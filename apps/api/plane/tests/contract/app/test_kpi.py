# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for the KPI module (config, attributes, issue scoring, preview)."""

from datetime import date, datetime, timezone as dt_timezone

import pytest
from django.urls import reverse
from rest_framework import status

from plane.db.models import (
    Issue,
    KpiConfig,
    KpiIssueAttribute,
    Project,
    ProjectMember,
    State,
)


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(
        name="KPI Project",
        identifier="KPI",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.fixture
def state(project, workspace, create_user):
    return State.objects.create(
        name="Todo",
        color="#000000",
        group="unstarted",
        project=project,
        workspace=workspace,
        created_by=create_user,
    )


def _make_issue(project, workspace, state, create_user, **overrides):
    issue = Issue.objects.create(
        name=overrides.get("name", "Task"),
        project=project,
        workspace=workspace,
        state=state,
        priority=overrides.get("priority", "none"),
        created_by=create_user,
    )
    # Bypass Issue.save() side effects to set deterministic delivery values.
    Issue.objects.filter(id=issue.id).update(
        target_date=overrides.get("target_date"),
        completed_at=overrides.get("completed_at"),
    )
    issue.refresh_from_db()
    return issue


@pytest.mark.contract
@pytest.mark.django_db
class TestKpiConfig:
    def test_workspace_config_returns_seed_defaults(self, session_client, workspace):
        url = reverse("kpi-workspace-config", kwargs={"slug": workspace.slug})
        response = session_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] is None
        assert data["is_default_seed"] is True
        assert data["penalty_mode"] == "continuous"
        assert data["tables"]["difficulty"]["Hard-High"] == 50

    def test_project_config_put_and_get(self, session_client, workspace, project):
        url = reverse("kpi-project-config", kwargs={"slug": workspace.slug, "project_id": project.id})
        payload = {"penalty_mode": "dead_zone", "k": 0.25}
        put = session_client.put(url, payload, format="json")
        assert put.status_code == status.HTTP_200_OK
        assert put.json()["penalty_mode"] == "dead_zone"
        assert put.json()["is_default_seed"] is False

        get = session_client.get(url)
        assert get.json()["penalty_mode"] == "dead_zone"
        assert get.json()["k"] == 0.25
        assert get.json()["inherited"] is False

    def test_project_config_inherits_workspace_default(self, session_client, workspace, project):
        KpiConfig.objects.create(workspace=workspace, project=None, penalty_mode="dead_zone")
        url = reverse("kpi-project-config", kwargs={"slug": workspace.slug, "project_id": project.id})
        response = session_client.get(url)
        assert response.json()["penalty_mode"] == "dead_zone"
        assert response.json()["inherited"] is True

    def test_invalid_k_rejected(self, session_client, workspace, project):
        url = reverse("kpi-project-config", kwargs={"slug": workspace.slug, "project_id": project.id})
        response = session_client.put(url, {"k": 5}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.contract
@pytest.mark.django_db
class TestKpiIssueAttributes:
    def test_put_and_get_attributes(self, session_client, workspace, project, state, create_user):
        issue = _make_issue(project, workspace, state, create_user)
        url = reverse(
            "kpi-issue-attributes",
            kwargs={"slug": workspace.slug, "project_id": project.id, "issue_id": issue.id},
        )
        put = session_client.put(url, {"difficulty": "Hard-High", "importance": "High"}, format="json")
        assert put.status_code == status.HTTP_200_OK
        assert put.json()["difficulty"] == "Hard-High"

        get = session_client.get(url)
        assert get.json()["difficulty"] == "Hard-High"
        assert get.json()["importance"] == "High"

    def test_invalid_level_rejected(self, session_client, workspace, project, state, create_user):
        issue = _make_issue(project, workspace, state, create_user)
        url = reverse(
            "kpi-issue-attributes",
            kwargs={"slug": workspace.slug, "project_id": project.id, "issue_id": issue.id},
        )
        response = session_client.put(url, {"difficulty": "Nonexistent"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.contract
@pytest.mark.django_db
class TestKpiIssueList:
    def test_scoring_matches_spec_case(self, session_client, workspace, project, state, create_user):
        # Mirror the "atraso_leve" spec case: high priority (b=0.25, points 27),
        # Hard-Low (45) + importance High (20), d=2 -> Vp=92, p=0.5, Vf=46.
        issue = _make_issue(
            project, workspace, state, create_user,
            priority="high",
            target_date=date(2026, 1, 15),
            completed_at=datetime(2026, 1, 17, 12, 0, tzinfo=dt_timezone.utc),
        )
        KpiIssueAttribute.objects.create(
            workspace=workspace, project=project, issue=issue,
            difficulty="Hard-Low", importance="High",
        )

        url = reverse("kpi-issues", kwargs={"slug": workspace.slug, "project_id": project.id})
        response = session_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        body = response.json()
        row = next(r for r in body["results"] if r["id"] == str(issue.id))
        assert row["vp"] == 92
        assert row["d"] == 2
        assert row["p"] == pytest.approx(0.5)
        assert row["vf"] == pytest.approx(46)
        assert row["status"] == "late"
        assert body["aggregates"]["total"] == 1
        assert body["aggregates"]["counts"]["late"] == 1

    def test_open_task_is_pending(self, session_client, workspace, project, state, create_user):
        issue = _make_issue(project, workspace, state, create_user, priority="high", target_date=date(2026, 1, 15))
        url = reverse("kpi-issues", kwargs={"slug": workspace.slug, "project_id": project.id})
        response = session_client.get(url)
        row = next(r for r in response.json()["results"] if r["id"] == str(issue.id))
        assert row["status"] == "pending"
        assert row["vf"] is None


@pytest.mark.contract
@pytest.mark.django_db
class TestKpiPreview:
    def test_preview_returns_result_and_curve(self, session_client, workspace, project):
        url = reverse("kpi-preview", kwargs={"slug": workspace.slug, "project_id": project.id})
        payload = {
            "task": {
                "priority": "urgent",
                "difficulty": "Hard-High",
                "importance": "High",
                "due_date": "2026-01-15",
                "delivered_date": "2026-01-15",
            }
        }
        response = session_client.post(url, payload, format="json")
        assert response.status_code == status.HTTP_200_OK
        body = response.json()
        assert body["result"]["Vp"] == 100
        assert body["result"]["p"] == pytest.approx(1.0)
        assert len(body["curve"]) > 0
        assert body["b"] == pytest.approx(0.30)
