# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for the KPI module (config, attributes, issue scoring, preview)."""

from datetime import date, datetime, timezone as dt_timezone

import pytest
from django.urls import reverse
from rest_framework import status

from plane.db.models import (
    Estimate,
    EstimatePoint,
    Issue,
    IssueAssignee,
    KpiConfig,
    KpiIssueAttribute,
    Project,
    ProjectMember,
    State,
    User,
)
from plane.db.models.kpi import default_kpi_tables


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
        # Difficulty is now driven by the project's estimate; the seed mapping
        # starts empty (configured per project against its estimate points).
        assert data["tables"]["difficulty"] == {}
        # Importance is now the native priority -> no separate importance table.
        assert "importance" not in data["tables"]

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
        put = session_client.put(url, {"repetitive": "High"}, format="json")
        assert put.status_code == status.HTTP_200_OK
        assert put.json()["repetitive"] == "High"

        get = session_client.get(url)
        assert get.json()["repetitive"] == "High"

    def test_invalid_level_rejected(self, session_client, workspace, project, state, create_user):
        issue = _make_issue(project, workspace, state, create_user)
        url = reverse(
            "kpi-issue-attributes",
            kwargs={"slug": workspace.slug, "project_id": project.id, "issue_id": issue.id},
        )
        response = session_client.put(url, {"repetitive": "Nonexistent"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.contract
@pytest.mark.django_db
class TestKpiIssueList:
    def test_scoring_matches_spec_case(self, session_client, workspace, project, state, create_user):
        # Difficulty comes from the issue's estimate (mapped point -> 45);
        # Importance is the native priority (high -> points 27). With high
        # priority (b=0.25), d=2 -> Vp = 45 + 27 = 72, p=0.5, Vf=36.
        estimate = Estimate.objects.create(name="Points", project=project, type="points", created_by=create_user)
        point = EstimatePoint.objects.create(
            estimate=estimate, project=project, key=0, value="Hard-Low", created_by=create_user
        )

        # tables['difficulty'] is keyed by EstimatePoint id, not value (see
        # migration 0145_kpi_difficulty_rekey_by_point_id).
        tables = default_kpi_tables()
        tables["difficulty"] = {str(point.id): 45}
        KpiConfig.objects.create(workspace=workspace, project=project, tables=tables)

        issue = _make_issue(
            project, workspace, state, create_user,
            priority="high",
            target_date=date(2026, 1, 15),
            completed_at=datetime(2026, 1, 17, 12, 0, tzinfo=dt_timezone.utc),
        )
        Issue.objects.filter(id=issue.id).update(estimate_point=point)

        url = reverse("kpi-issues", kwargs={"slug": workspace.slug, "project_id": project.id})
        response = session_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        body = response.json()
        row = next(r for r in body["results"] if r["id"] == str(issue.id))
        assert row["vp"] == 72
        assert row["d"] == 2
        assert row["p"] == pytest.approx(0.5)
        assert row["vf"] == pytest.approx(36)
        assert row["status"] == "late"
        assert row["estimate_point"] == str(point.id)
        assert row["difficulty"] == "Hard-Low"
        assert body["aggregates"]["total"] == 1
        assert body["aggregates"]["counts"]["late"] == 1

    def test_set_issue_priority_updates_importance(self, session_client, workspace, project, state, create_user):
        # Importance = native priority. Setting priority via the KPI priority
        # endpoint changes the Importance contribution (priority.points) to Vp.
        issue = _make_issue(
            project, workspace, state, create_user,
            priority="none",
            target_date=date(2026, 1, 15),
            completed_at=datetime(2026, 1, 15, 12, 0, tzinfo=dt_timezone.utc),
        )
        prio_url = reverse(
            "kpi-issue-priority",
            kwargs={"slug": workspace.slug, "project_id": project.id, "issue_id": issue.id},
        )
        put = session_client.put(prio_url, {"priority": "urgent"}, format="json")
        assert put.status_code == status.HTTP_200_OK
        assert put.json()["priority"] == "urgent"

        list_url = reverse("kpi-issues", kwargs={"slug": workspace.slug, "project_id": project.id})
        row = next(r for r in session_client.get(list_url).json()["results"] if r["id"] == str(issue.id))
        # No difficulty/estimate -> Vp = priority urgent points (30).
        assert row["vp"] == 30
        assert row["priority"] == "urgent"

        bad = session_client.put(prio_url, {"priority": "nope"}, format="json")
        assert bad.status_code == status.HTTP_400_BAD_REQUEST

    def test_set_issue_estimates_update_kpi_fields_without_native_estimate(
        self, session_client, workspace, project, state, create_user
    ):
        # KPI Difficulty/Repetitive use their own configured estimate systems.
        # Updating them must not overwrite Issue.estimate_point.
        difficulty_estimate = Estimate.objects.create(
            name="Difficulty", project=project, type="points", created_by=create_user
        )
        difficulty_point = EstimatePoint.objects.create(
            estimate=difficulty_estimate, project=project, key=0, value="8", created_by=create_user
        )
        repetitive_estimate = Estimate.objects.create(
            name="Repetitive", project=project, type="categories", created_by=create_user
        )
        repetitive_point = EstimatePoint.objects.create(
            estimate=repetitive_estimate, project=project, key=0, value="High", created_by=create_user
        )

        # tables['difficulty']/['repetitive'] are keyed by EstimatePoint id, not
        # value (see migration 0145_kpi_difficulty_rekey_by_point_id).
        tables = default_kpi_tables()
        tables["difficulty"] = {str(difficulty_point.id): 8}
        tables["repetitive"] = {str(repetitive_point.id): 4}
        KpiConfig.objects.create(
            workspace=workspace,
            project=project,
            tables=tables,
            difficulty_estimate=difficulty_estimate,
            repetitive_estimate=repetitive_estimate,
        )

        issue = _make_issue(
            project, workspace, state, create_user,
            priority="none",
            target_date=date(2026, 1, 15),
            completed_at=datetime(2026, 1, 15, 12, 0, tzinfo=dt_timezone.utc),
        )

        est_url = reverse(
            "kpi-issue-estimate",
            kwargs={"slug": workspace.slug, "project_id": project.id, "issue_id": issue.id},
        )
        put = session_client.put(est_url, {"estimate_point": str(difficulty_point.id)}, format="json")
        assert put.status_code == status.HTTP_200_OK
        assert put.json()["difficulty_estimate_point"] == str(difficulty_point.id)

        repetitive_url = reverse(
            "kpi-issue-repetitive-estimate",
            kwargs={"slug": workspace.slug, "project_id": project.id, "issue_id": issue.id},
        )
        rep_put = session_client.put(repetitive_url, {"estimate_point": str(repetitive_point.id)}, format="json")
        assert rep_put.status_code == status.HTTP_200_OK
        assert rep_put.json()["repetitive_estimate_point"] == str(repetitive_point.id)

        issue.refresh_from_db()
        assert issue.estimate_point_id is None

        list_url = reverse("kpi-issues", kwargs={"slug": workspace.slug, "project_id": project.id})
        row = next(r for r in session_client.get(list_url).json()["results"] if r["id"] == str(issue.id))
        # priority none points (12) + difficulty 8 + repetitive 4 = 24.
        assert row["vp"] == 24
        assert row["estimate_point"] is None
        assert row["difficulty_estimate_point"] == str(difficulty_point.id)
        assert row["repetitive_estimate_point"] == str(repetitive_point.id)

        # Clearing the KPI difficulty estimate drops only the KPI contribution.
        clear = session_client.put(est_url, {"estimate_point": None}, format="json")
        assert clear.status_code == status.HTTP_200_OK
        row = next(r for r in session_client.get(list_url).json()["results"] if r["id"] == str(issue.id))
        assert row["vp"] == 16
        assert row["estimate_point"] is None
        assert row["difficulty_estimate_point"] is None

    def test_rejects_estimate_point_from_unconfigured_estimate(
        self, session_client, workspace, project, state, create_user
    ):
        configured_estimate = Estimate.objects.create(
            name="Configured", project=project, type="points", created_by=create_user
        )
        other_estimate = Estimate.objects.create(name="Other", project=project, type="points", created_by=create_user)
        other_point = EstimatePoint.objects.create(
            estimate=other_estimate, project=project, key=0, value="13", created_by=create_user
        )
        KpiConfig.objects.create(workspace=workspace, project=project, difficulty_estimate=configured_estimate)
        issue = _make_issue(project, workspace, state, create_user)

        est_url = reverse(
            "kpi-issue-estimate",
            kwargs={"slug": workspace.slug, "project_id": project.id, "issue_id": issue.id},
        )
        response = session_client.put(est_url, {"estimate_point": str(other_point.id)}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_legacy_fallbacks_use_native_estimate_and_repetitive_text(
        self, session_client, workspace, project, state, create_user
    ):
        estimate = Estimate.objects.create(name="Legacy", project=project, type="points", created_by=create_user)
        point = EstimatePoint.objects.create(estimate=estimate, project=project, key=0, value="5", created_by=create_user)

        # tables['difficulty'] is keyed by EstimatePoint id, not value (see
        # migration 0145_kpi_difficulty_rekey_by_point_id). 'repetitive' stays
        # value-keyed here since this test exercises the legacy free-text
        # fallback (no repetitive_estimate configured), not a point-based one.
        tables = default_kpi_tables()
        tables["difficulty"] = {str(point.id): 5}
        tables["repetitive"] = {"High": 4}
        KpiConfig.objects.create(workspace=workspace, project=project, tables=tables)

        issue = _make_issue(project, workspace, state, create_user, priority="none")
        Issue.objects.filter(id=issue.id).update(estimate_point=point)
        KpiIssueAttribute.objects.create(workspace=workspace, project=project, issue=issue, repetitive="High")

        list_url = reverse("kpi-issues", kwargs={"slug": workspace.slug, "project_id": project.id})
        row = next(r for r in session_client.get(list_url).json()["results"] if r["id"] == str(issue.id))
        # priority none points (12) + native estimate fallback 5 + legacy repetitive fallback 4.
        assert row["vp"] == 21
        assert row["difficulty"] == "5"
        assert row["repetitive"] == "High"

    def test_open_task_is_pending(self, session_client, workspace, project, state, create_user):
        issue = _make_issue(project, workspace, state, create_user, priority="high", target_date=date(2026, 1, 15))
        url = reverse("kpi-issues", kwargs={"slug": workspace.slug, "project_id": project.id})
        response = session_client.get(url)
        row = next(r for r in response.json()["results"] if r["id"] == str(issue.id))
        assert row["status"] == "pending"
        assert row["vf"] is None


@pytest.mark.contract
@pytest.mark.django_db
class TestKpiMemberAggregates:
    def test_split_equally_between_two_assignees(self, session_client, workspace, project, state, create_user):
        # priority=high, no difficulty/repetitive configured -> Vp = 27 (Importance
        # only). d=2 late -> p=0.5 -> Vf=13.5. Two assignees -> 13.5/6.75 each.
        second_user = User.objects.create(email="second@plane.so", first_name="Second", last_name="User")
        issue = _make_issue(
            project, workspace, state, create_user,
            priority="high",
            target_date=date(2026, 1, 15),
            completed_at=datetime(2026, 1, 17, 12, 0, tzinfo=dt_timezone.utc),
        )
        IssueAssignee.objects.create(issue=issue, assignee=create_user, project=project, workspace=workspace)
        IssueAssignee.objects.create(issue=issue, assignee=second_user, project=project, workspace=workspace)

        url = reverse("kpi-member-aggregates", kwargs={"slug": workspace.slug, "project_id": project.id})
        response = session_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        body = response.json()
        assert body["unassigned_count"] == 0
        assert len(body["results"]) == 2
        for row in body["results"]:
            assert row["sum_vp"] == pytest.approx(13.5)
            assert row["sum_vf"] == pytest.approx(6.75)
            assert row["counts"]["late"] == 1

        total_vf = sum(r["sum_vf"] for r in body["results"])
        assert total_vf == pytest.approx(13.5)

    def test_issue_without_assignee_is_omitted_but_counted(
        self, session_client, workspace, project, state, create_user
    ):
        _make_issue(
            project, workspace, state, create_user,
            priority="none",
            target_date=date(2026, 1, 15),
            completed_at=datetime(2026, 1, 15, 12, 0, tzinfo=dt_timezone.utc),
        )
        url = reverse("kpi-member-aggregates", kwargs={"slug": workspace.slug, "project_id": project.id})
        response = session_client.get(url)
        body = response.json()
        assert body["results"] == []
        assert body["unassigned_count"] == 1

    def test_pending_issue_counts_vp_not_vf(self, session_client, workspace, project, state, create_user):
        issue = _make_issue(project, workspace, state, create_user, priority="high", target_date=date(2026, 1, 15))
        IssueAssignee.objects.create(issue=issue, assignee=create_user, project=project, workspace=workspace)

        url = reverse("kpi-member-aggregates", kwargs={"slug": workspace.slug, "project_id": project.id})
        response = session_client.get(url)
        body = response.json()
        assert len(body["results"]) == 1
        row = body["results"][0]
        assert row["sum_vp"] == pytest.approx(27)
        assert row["sum_vf"] == 0
        assert row["counts"]["pending"] == 1


@pytest.mark.contract
@pytest.mark.django_db
class TestKpiPreview:
    def test_preview_returns_result_and_curve(self, session_client, workspace, project):
        url = reverse("kpi-preview", kwargs={"slug": workspace.slug, "project_id": project.id})
        payload = {
            "task": {
                "priority": "urgent",
                "due_date": "2026-01-15",
                "delivered_date": "2026-01-15",
            }
        }
        response = session_client.post(url, payload, format="json")
        assert response.status_code == status.HTTP_200_OK
        body = response.json()
        # Seed difficulty mapping is empty and Importance = priority points,
        # so Vp = priority urgent points (30).
        assert body["result"]["Vp"] == 30
        assert body["result"]["p"] == pytest.approx(1.0)
        assert len(body["curve"]) > 0
        assert body["b"] == pytest.approx(0.30)


@pytest.mark.contract
@pytest.mark.django_db
class TestWorkspaceKpiMemberAggregates:
    def test_aggregates_across_all_projects_in_workspace(self, session_client, workspace, create_user):
        # Create two projects
        project1 = Project.objects.create(
            name="Project 1", identifier="P1", workspace=workspace, created_by=create_user
        )
        ProjectMember.objects.create(project=project1, member=create_user, role=20, is_active=True)
        
        project2 = Project.objects.create(
            name="Project 2", identifier="P2", workspace=workspace, created_by=create_user
        )
        ProjectMember.objects.create(project=project2, member=create_user, role=20, is_active=True)

        state1 = State.objects.create(
            name="Todo", color="#000", group="unstarted", project=project1, workspace=workspace, created_by=create_user
        )
        state2 = State.objects.create(
            name="Todo", color="#000", group="unstarted", project=project2, workspace=workspace, created_by=create_user
        )

        # Create user
        second_user = User.objects.create(email="second2@plane.so", first_name="Second", last_name="User")

        # Project 1 issue (priority=high -> Vp=27. late by 2 days -> p=0.5 -> Vf=13.5)
        issue1 = _make_issue(
            project1, workspace, state1, create_user,
            priority="high",
            target_date=date(2026, 1, 15),
            completed_at=datetime(2026, 1, 17, 12, 0, tzinfo=dt_timezone.utc),
        )
        IssueAssignee.objects.create(issue=issue1, assignee=create_user, project=project1, workspace=workspace)

        # Project 2 issue (priority=urgent -> Vp=30. on time -> p=1.0 -> Vf=30)
        issue2 = _make_issue(
            project2, workspace, state2, create_user,
            priority="urgent",
            target_date=date(2026, 1, 15),
            completed_at=datetime(2026, 1, 15, 12, 0, tzinfo=dt_timezone.utc),
        )
        IssueAssignee.objects.create(issue=issue2, assignee=create_user, project=project2, workspace=workspace)
        IssueAssignee.objects.create(issue=issue2, assignee=second_user, project=project2, workspace=workspace)

        url = reverse("workspace-kpi-member-aggregates", kwargs={"slug": workspace.slug})
        response = session_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        
        body = response.json()
        assert body["unassigned_count"] == 0
        assert len(body["results"]) == 2
        
        # create_user should have 13.5 (from issue1) + 15 (from issue2) = 28.5 Vf
        create_user_row = next(r for r in body["results"] if r["user_id"] == str(create_user.id))
        assert create_user_row["sum_vp"] == pytest.approx(27 + 15)  # 42
        assert create_user_row["sum_vf"] == pytest.approx(13.5 + 15) # 28.5
        assert create_user_row["counts"]["late"] == 1
        assert create_user_row["counts"]["on_time"] == 1
        
        # second_user should have 15 Vf (from issue2)
        second_user_row = next(r for r in body["results"] if r["user_id"] == str(second_user.id))
        assert second_user_row["sum_vp"] == pytest.approx(15)
        assert second_user_row["sum_vf"] == pytest.approx(15)
        assert second_user_row["counts"]["late"] == 0
        assert second_user_row["counts"]["on_time"] == 1
