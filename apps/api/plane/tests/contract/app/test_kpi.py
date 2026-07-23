# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for the KPI module (config, attributes, issue scoring, preview)."""

from datetime import date, datetime, time, timedelta, timezone as dt_timezone

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from plane.db.models import (
    Estimate,
    EstimatePoint,
    EstimateProperty,
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
        # Difficulty/Repetitive are EstimateProperty rows tagged kpi_role,
        # independent of the project's native estimate. Updating them must not
        # overwrite Issue.estimate_point.
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
        difficulty_property = EstimateProperty.objects.create(
            name="Difficulty", estimate=difficulty_estimate, project=project, workspace=workspace, kpi_role="difficulty"
        )
        repetitive_property = EstimateProperty.objects.create(
            name="Repetitive", estimate=repetitive_estimate, project=project, workspace=workspace, kpi_role="repetitive"
        )

        # tables['difficulty']/['repetitive'] are keyed by EstimatePoint id, not
        # value (see migration 0145_kpi_difficulty_rekey_by_point_id).
        tables = default_kpi_tables()
        tables["difficulty"] = {str(difficulty_point.id): 8}
        tables["repetitive"] = {str(repetitive_point.id): 4}
        KpiConfig.objects.create(workspace=workspace, project=project, tables=tables)

        issue = _make_issue(
            project, workspace, state, create_user,
            priority="none",
            target_date=date(2026, 1, 15),
            completed_at=datetime(2026, 1, 15, 12, 0, tzinfo=dt_timezone.utc),
        )

        est_url = reverse(
            "issue-estimate-property-value",
            kwargs={
                "slug": workspace.slug,
                "project_id": project.id,
                "issue_id": issue.id,
                "property_id": difficulty_property.id,
            },
        )
        put = session_client.put(est_url, {"estimate_point": str(difficulty_point.id)}, format="json")
        assert put.status_code == status.HTTP_200_OK
        assert put.json()["estimate_point"] == str(difficulty_point.id)

        repetitive_url = reverse(
            "issue-estimate-property-value",
            kwargs={
                "slug": workspace.slug,
                "project_id": project.id,
                "issue_id": issue.id,
                "property_id": repetitive_property.id,
            },
        )
        rep_put = session_client.put(repetitive_url, {"estimate_point": str(repetitive_point.id)}, format="json")
        assert rep_put.status_code == status.HTTP_200_OK
        assert rep_put.json()["estimate_point"] == str(repetitive_point.id)

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
        difficulty_property = EstimateProperty.objects.create(
            name="Difficulty",
            estimate=configured_estimate,
            project=project,
            workspace=workspace,
            kpi_role="difficulty",
        )
        issue = _make_issue(project, workspace, state, create_user)

        est_url = reverse(
            "issue-estimate-property-value",
            kwargs={
                "slug": workspace.slug,
                "project_id": project.id,
                "issue_id": issue.id,
                "property_id": difficulty_property.id,
            },
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
        second_user = User.objects.create(username="second", email="second@plane.so", first_name="Second", last_name="User")
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
        # Create two projects with the KPI panel enabled
        project1 = Project.objects.create(
            name="Project 1", identifier="P1", workspace=workspace, created_by=create_user, kpi_view=True
        )
        ProjectMember.objects.create(project=project1, member=create_user, role=20, is_active=True)

        project2 = Project.objects.create(
            name="Project 2", identifier="P2", workspace=workspace, created_by=create_user, kpi_view=True
        )
        ProjectMember.objects.create(project=project2, member=create_user, role=20, is_active=True)

        state1 = State.objects.create(
            name="Todo", color="#000", group="unstarted", project=project1, workspace=workspace, created_by=create_user
        )
        state2 = State.objects.create(
            name="Todo", color="#000", group="unstarted", project=project2, workspace=workspace, created_by=create_user
        )

        # Create user
        second_user = User.objects.create(username="second2", email="second2@plane.so", first_name="Second", last_name="User")

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

    def test_project_with_kpi_disabled_is_excluded(self, session_client, workspace, create_user):
        """A project whose KPI panel is off must not feed the workspace ranking."""
        project = Project.objects.create(
            name="Disabled", identifier="DIS", workspace=workspace, created_by=create_user, kpi_view=False
        )
        ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
        state = State.objects.create(
            name="Todo", color="#000", group="unstarted", project=project, workspace=workspace, created_by=create_user
        )
        issue = _make_issue(
            project, workspace, state, create_user,
            priority="high",
            target_date=date(2026, 1, 15),
            completed_at=datetime(2026, 1, 15, 12, 0, tzinfo=dt_timezone.utc),
        )
        IssueAssignee.objects.create(issue=issue, assignee=create_user, project=project, workspace=workspace)

        url = reverse("workspace-kpi-member-aggregates", kwargs={"slug": workspace.slug})
        body = session_client.get(url).json()
        assert body["results"] == []
        assert body["unassigned_count"] == 0

    def test_project_the_requester_does_not_belong_to_is_excluded(self, session_client, workspace, create_user):
        """KPI-enabled but without membership -> its scores stay invisible."""
        outsider = User.objects.create(username="outsider", email="outsider@plane.so", first_name="Out", last_name="Sider")
        project = Project.objects.create(
            name="Foreign", identifier="FOR", workspace=workspace, created_by=outsider, kpi_view=True
        )
        ProjectMember.objects.create(project=project, member=outsider, role=20, is_active=True)
        state = State.objects.create(
            name="Todo", color="#000", group="unstarted", project=project, workspace=workspace, created_by=outsider
        )
        issue = _make_issue(
            project, workspace, state, outsider,
            priority="high",
            target_date=date(2026, 1, 15),
            completed_at=datetime(2026, 1, 15, 12, 0, tzinfo=dt_timezone.utc),
        )
        IssueAssignee.objects.create(issue=issue, assignee=outsider, project=project, workspace=workspace)

        url = reverse("workspace-kpi-member-aggregates", kwargs={"slug": workspace.slug})
        body = session_client.get(url).json()
        assert body["results"] == []


def _kpi_project(workspace, user, name, identifier, kpi_view=True):
    project = Project.objects.create(
        name=name, identifier=identifier, workspace=workspace, created_by=user, kpi_view=kpi_view
    )
    ProjectMember.objects.create(project=project, member=user, role=20, is_active=True)
    state = State.objects.create(
        name="Todo", color="#000", group="unstarted", project=project, workspace=workspace, created_by=user
    )
    return project, state


def _delivered(days_ago, late_by=0):
    """(target_date, completed_at) for an item delivered ``days_ago``, ``late_by`` days late.

    Noon UTC keeps the ``__date`` lookup and the engine's day math on the
    intended calendar day regardless of the configured timezone.
    """
    delivered_on = timezone.now().date() - timedelta(days=days_ago)
    return delivered_on - timedelta(days=late_by), datetime.combine(
        delivered_on, time(12, 0), tzinfo=dt_timezone.utc
    )


@pytest.mark.contract
@pytest.mark.django_db
class TestKpiWorkspaceOverview:
    """The consolidated workspace panel: unified KPI + per-project + per-member."""

    def _url(self, workspace):
        return reverse("workspace-kpi-overview", kwargs={"slug": workspace.slug})

    def test_unified_kpi_is_weighted_by_scored_item_count(self, session_client, workspace, create_user):
        """KPI = Σ(eff_p × n_p) / Σ n_p -- NOT the raw ΣVf/ΣVp.

        Project A: 3 urgent items (30 pts, b=0.30) -> 2 on time (Vf 30 each) and
        1 late by 1 day (p=0.70 -> Vf 21). ΣVp=90, ΣVf=81 -> eff 0.9, n=3.
        Project B: 1 high item (27 pts, b=0.25) late by 2 days (p=0.50 -> Vf
        13.5). ΣVp=27, ΣVf=13.5 -> eff 0.5, n=1.

        Weighted: (0.9·3 + 0.5·1) / 4 = 0.80.
        Raw ΣVf/ΣVp would be 94.5/117 = 0.8077 -- the assertion below fails if
        the endpoint ever falls back to summing mixed-scale points.
        """
        project_a, state_a = _kpi_project(workspace, create_user, "Alpha", "ALP")
        project_b, state_b = _kpi_project(workspace, create_user, "Bravo", "BRA")

        for late_by in (0, 0, 1):
            target, completed = _delivered(days_ago=10, late_by=late_by)
            _make_issue(
                project_a, workspace, state_a, create_user,
                priority="urgent", target_date=target, completed_at=completed,
            )

        target, completed = _delivered(days_ago=10, late_by=2)
        _make_issue(
            project_b, workspace, state_b, create_user,
            priority="high", target_date=target, completed_at=completed,
        )

        response = session_client.get(self._url(workspace))
        assert response.status_code == status.HTTP_200_OK
        body = response.json()

        rows = {row["identifier"]: row for row in body["projects"]}
        assert rows["ALP"]["sum_vp"] == pytest.approx(90)
        assert rows["ALP"]["sum_vf"] == pytest.approx(81)
        assert rows["ALP"]["efficiency"] == pytest.approx(0.9)
        assert rows["ALP"]["scored_items"] == 3
        assert rows["BRA"]["efficiency"] == pytest.approx(0.5)
        assert rows["BRA"]["scored_items"] == 1

        unified = body["unified"]
        assert unified["kpi"] == pytest.approx(0.80)
        assert unified["method"] == "item_weighted_efficiency"
        assert unified["scored_items"] == 4
        assert unified["project_count"] == 2
        assert unified["projects_in_average"] == 2
        # Raw sums stay available, but must not be what `kpi` is built from.
        assert unified["sum_vp_raw"] == pytest.approx(117)
        assert unified["sum_vf_raw"] == pytest.approx(94.5)
        assert unified["kpi"] != pytest.approx(94.5 / 117)

        # Contributions decompose the unified KPI exactly.
        assert rows["ALP"]["contribution"] == pytest.approx(0.675)
        assert rows["BRA"]["contribution"] == pytest.approx(0.125)
        assert sum(row["contribution"] for row in body["projects"]) == pytest.approx(unified["kpi"])

    def test_project_with_kpi_disabled_is_excluded(self, session_client, workspace, create_user):
        enabled, state_enabled = _kpi_project(workspace, create_user, "Enabled", "ENA")
        disabled, state_disabled = _kpi_project(workspace, create_user, "Disabled", "DIS", kpi_view=False)

        for project, state in ((enabled, state_enabled), (disabled, state_disabled)):
            target, completed = _delivered(days_ago=5)
            _make_issue(
                project, workspace, state, create_user,
                priority="urgent", target_date=target, completed_at=completed,
            )

        body = session_client.get(self._url(workspace)).json()
        assert [row["identifier"] for row in body["projects"]] == ["ENA"]
        assert body["unified"]["project_count"] == 1
        assert body["unified"]["scored_items"] == 1

    def test_archived_project_is_excluded(self, session_client, workspace, create_user):
        live, state_live = _kpi_project(workspace, create_user, "Live", "LIV")
        archived, state_archived = _kpi_project(workspace, create_user, "Archived", "ARC")
        Project.objects.filter(id=archived.id).update(archived_at=timezone.now())

        for project, state in ((live, state_live), (archived, state_archived)):
            target, completed = _delivered(days_ago=5)
            _make_issue(
                project, workspace, state, create_user,
                priority="urgent", target_date=target, completed_at=completed,
            )

        body = session_client.get(self._url(workspace)).json()
        assert [row["identifier"] for row in body["projects"]] == ["LIV"]
        assert body["unified"]["scored_items"] == 1

    def test_project_without_membership_is_excluded(self, session_client, workspace, create_user):
        outsider = User.objects.create(username="outsider-ov", email="outsider-ov@plane.so", first_name="Out", last_name="Sider")
        mine, state_mine = _kpi_project(workspace, create_user, "Mine", "MIN")
        theirs, state_theirs = _kpi_project(workspace, outsider, "Theirs", "THE")

        for project, state, author in ((mine, state_mine, create_user), (theirs, state_theirs, outsider)):
            target, completed = _delivered(days_ago=5)
            _make_issue(
                project, workspace, state, author,
                priority="urgent", target_date=target, completed_at=completed,
            )

        body = session_client.get(self._url(workspace)).json()
        assert [row["identifier"] for row in body["projects"]] == ["MIN"]

    def test_project_without_scored_items_is_listed_but_stays_out_of_the_average(
        self, session_client, workspace, create_user
    ):
        scored, state_scored = _kpi_project(workspace, create_user, "Scored", "SCO")
        pending, state_pending = _kpi_project(workspace, create_user, "Pending", "PEN")

        target, completed = _delivered(days_ago=5)
        _make_issue(
            scored, workspace, state_scored, create_user,
            priority="urgent", target_date=target, completed_at=completed,
        )
        # Open item: due inside the window, never delivered -> no multiplier.
        _make_issue(
            pending, workspace, state_pending, create_user,
            priority="urgent", target_date=timezone.now().date() - timedelta(days=5),
        )

        body = session_client.get(self._url(workspace)).json()
        rows = {row["identifier"]: row for row in body["projects"]}

        assert rows["PEN"]["efficiency"] is None
        assert rows["PEN"]["contribution"] is None
        assert rows["PEN"]["scored_items"] == 0
        assert rows["PEN"]["counts"]["pending"] == 1

        assert body["unified"]["project_count"] == 2
        assert body["unified"]["projects_in_average"] == 1
        # An undelivered item must not drag the KPI toward zero.
        assert body["unified"]["kpi"] == pytest.approx(1.0)
        assert body["unified"]["counts"]["pending"] == 1
        assert body["unified"]["counts"]["on_time"] == 1

    def test_default_window_drops_older_items_and_period_all_restores_them(
        self, session_client, workspace, create_user
    ):
        project, state = _kpi_project(workspace, create_user, "Alpha", "ALP")

        target_recent, completed_recent = _delivered(days_ago=10)
        _make_issue(
            project, workspace, state, create_user,
            priority="urgent", target_date=target_recent, completed_at=completed_recent,
        )
        target_old, completed_old = _delivered(days_ago=200)
        _make_issue(
            project, workspace, state, create_user,
            priority="urgent", target_date=target_old, completed_at=completed_old,
        )

        default_body = session_client.get(self._url(workspace)).json()
        assert default_body["period"]["key"] == "90d"
        assert default_body["unified"]["scored_items"] == 1

        all_body = session_client.get(self._url(workspace), {"period": "all"}).json()
        assert all_body["period"]["key"] == "all"
        assert all_body["period"]["start"] is None
        assert all_body["unified"]["scored_items"] == 2

    def test_explicit_date_range_is_honoured(self, session_client, workspace, create_user):
        project, state = _kpi_project(workspace, create_user, "Alpha", "ALP")
        target, completed = _delivered(days_ago=200)
        _make_issue(
            project, workspace, state, create_user,
            priority="urgent", target_date=target, completed_at=completed,
        )

        delivered_on = timezone.now().date() - timedelta(days=200)
        response = session_client.get(
            self._url(workspace),
            {
                "start": (delivered_on - timedelta(days=1)).isoformat(),
                "end": (delivered_on + timedelta(days=1)).isoformat(),
            },
        )
        body = response.json()
        assert body["period"]["key"] == "custom"
        assert body["unified"]["scored_items"] == 1

    def test_invalid_period_is_rejected(self, session_client, workspace):
        response = session_client.get(self._url(workspace), {"period": "7y"})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_inverted_date_range_is_rejected(self, session_client, workspace):
        response = session_client.get(self._url(workspace), {"start": "2026-05-01", "end": "2026-04-01"})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_members_block_splits_scores_and_counts_unassigned(self, session_client, workspace, create_user):
        second_user = User.objects.create(username="second-ov", email="second-ov@plane.so", first_name="Second", last_name="User")
        project, state = _kpi_project(workspace, create_user, "Alpha", "ALP")

        target, completed = _delivered(days_ago=10, late_by=2)
        shared = _make_issue(
            project, workspace, state, create_user,
            priority="high", target_date=target, completed_at=completed,
        )
        IssueAssignee.objects.create(issue=shared, assignee=create_user, project=project, workspace=workspace)
        IssueAssignee.objects.create(issue=shared, assignee=second_user, project=project, workspace=workspace)

        target, completed = _delivered(days_ago=10)
        _make_issue(
            project, workspace, state, create_user,
            priority="urgent", target_date=target, completed_at=completed,
        )

        body = session_client.get(self._url(workspace)).json()
        assert body["unassigned_count"] == 1
        assert len(body["members"]) == 2
        for row in body["members"]:
            # high -> Vp 27, late by 2 -> p 0.5 -> Vf 13.5, split in half.
            assert row["sum_vp"] == pytest.approx(13.5)
            assert row["sum_vf"] == pytest.approx(6.75)
            assert row["counts"]["late"] == 1

    def test_empty_workspace_returns_null_kpi_not_an_error(self, session_client, workspace):
        response = session_client.get(self._url(workspace))
        assert response.status_code == status.HTTP_200_OK
        body = response.json()
        assert body["projects"] == []
        assert body["members"] == []
        assert body["unified"]["kpi"] is None
        assert body["unified"]["scored_items"] == 0
        assert body["unified"]["project_count"] == 0
