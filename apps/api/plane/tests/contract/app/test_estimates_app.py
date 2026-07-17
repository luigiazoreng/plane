# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status

from plane.db.models import Estimate, EstimatePoint, EstimateProperty, Project, ProjectMember


def get_estimates_url(workspace_slug: str, project_id) -> str:
    return f"/api/workspaces/{workspace_slug}/projects/{project_id}/estimates/"


def get_estimate_detail_url(workspace_slug: str, project_id, estimate_id) -> str:
    return f"/api/workspaces/{workspace_slug}/projects/{project_id}/estimates/{estimate_id}/"


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
    def test_creating_second_numeric_estimate_inactive_does_not_disturb_active_default(
        self, session_client, workspace, create_user
    ):
        """A second Points/Time estimate created for e.g. KPI-only use (last_used
        omitted/False, matching the frontend's create-estimate default) must not
        deactivate or replace the project's existing active numeric estimate --
        only an explicit activation should trigger that. KpiConfig.difficulty_
        estimate/repetitive_estimate don't require last_used=True to work, so an
        inactive estimate must remain fully usable."""
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
                "estimate": {"name": "Story Points", "type": "points", "last_used": True},
                "estimate_points": [{"key": 1, "value": "1"}, {"key": 2, "value": "2"}],
            },
            format="json",
        )
        assert first.status_code == status.HTTP_200_OK
        first_id = first.data["id"]

        second = session_client.post(
            get_estimates_url(workspace.slug, project.id),
            {
                "estimate": {"name": "KPI Difficulty Scale", "type": "points", "last_used": False},
                "estimate_points": [{"key": 1, "value": "1"}, {"key": 2, "value": "10"}],
            },
            format="json",
        )
        assert second.status_code == status.HTTP_200_OK
        second_id = second.data["id"]

        assert Estimate.objects.get(pk=first_id).last_used is True
        assert Estimate.objects.get(pk=second_id).last_used is False
        project.refresh_from_db()
        assert str(project.estimate_id) == first_id

        # Still fully usable (e.g. as a KPI difficulty/repetitive source) despite
        # being inactive -- its points remain intact and retrievable.
        response = session_client.get(get_estimates_url(workspace.slug, project.id))
        second_row = next(row for row in response.data if row["id"] == second_id)
        assert len(second_row["points"]) == 2

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


@pytest.mark.contract
class TestEstimatePropertyDefaultAutoCreation:
    """Step B4: a default EstimateProperty (is_estimate_default=True) is
    auto-created for every Estimate that becomes active (last_used=True),
    whether it's the project's first estimate (create) or a secondary system
    activated later (partial_update)."""

    @pytest.mark.django_db
    def test_creating_first_estimate_for_project_creates_default_property(
        self, session_client, workspace, create_user
    ):
        project = Project.objects.create(
            name="Estimate Project", identifier="EP", workspace=workspace, created_by=create_user, updated_by=create_user
        )
        ProjectMember.objects.create(project=project, member=create_user, role=20)

        response = session_client.post(
            get_estimates_url(workspace.slug, project.id),
            {
                "estimate": {"name": "Points", "type": "points", "last_used": False},
                "estimate_points": [{"key": 1, "value": "1"}, {"key": 2, "value": "2"}],
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        estimate_id = response.data["id"]

        # First estimate for a project is force-activated (project.estimate_id
        # was None), so a default property must exist for it afterward.
        assert EstimateProperty.objects.filter(
            project=project, estimate_id=estimate_id, is_estimate_default=True
        ).exists()

    @pytest.mark.django_db
    def test_activating_secondary_estimate_creates_its_own_default_property(
        self, session_client, workspace, create_user
    ):
        project = Project.objects.create(
            name="Estimate Project", identifier="EP", workspace=workspace, created_by=create_user, updated_by=create_user
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

        second = session_client.post(
            get_estimates_url(workspace.slug, project.id),
            {
                "estimate": {"name": "Categories", "type": "categories", "last_used": False},
                "estimate_points": [{"key": 1, "value": "Easy"}, {"key": 2, "value": "Hard"}],
            },
            format="json",
        )
        assert second.status_code == status.HTTP_200_OK
        second_id = second.data["id"]

        # Not yet active -> no default property for the secondary system yet.
        assert not EstimateProperty.objects.filter(
            project=project, estimate_id=second_id, is_estimate_default=True
        ).exists()

        activate = session_client.patch(
            get_estimate_detail_url(workspace.slug, project.id, second_id),
            {"estimate": {"last_used": True}},
            format="json",
        )
        assert activate.status_code == status.HTTP_200_OK

        # Categories is exempt from the single-active-numeric rule, so both
        # systems are now active simultaneously -- each with its own default
        # property; the project's default (Project.estimate) is untouched.
        assert EstimateProperty.objects.filter(
            project=project, estimate_id=second_id, is_estimate_default=True
        ).exists()
        assert EstimateProperty.objects.filter(
            project=project, estimate_id=first.data["id"], is_estimate_default=True
        ).exists()
        project.refresh_from_db()
        assert project.estimate_id == first.data["id"]

    @pytest.mark.django_db
    def test_deactivating_estimate_does_not_delete_its_default_property(
        self, session_client, workspace, create_user
    ):
        project = Project.objects.create(
            name="Estimate Project", identifier="EP", workspace=workspace, created_by=create_user, updated_by=create_user
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
        estimate_id = first.data["id"]
        assert EstimateProperty.objects.filter(
            project=project, estimate_id=estimate_id, is_estimate_default=True
        ).exists()

        # Activate a second numeric estimate, which deactivates the first
        # (single-active-numeric rule) -- the first's default property row
        # must be left in place, not deleted.
        session_client.post(
            get_estimates_url(workspace.slug, project.id),
            {
                "estimate": {"name": "Time", "type": "time", "last_used": True},
                "estimate_points": [{"key": 1, "value": "60"}, {"key": 2, "value": "120"}],
            },
            format="json",
        )
        assert Estimate.objects.get(pk=estimate_id).last_used is False
        assert EstimateProperty.objects.filter(
            project=project, estimate_id=estimate_id, is_estimate_default=True
        ).exists()

    @pytest.mark.django_db
    def test_activating_same_estimate_twice_does_not_duplicate_default_property(
        self, session_client, workspace, create_user
    ):
        project = Project.objects.create(
            name="Estimate Project", identifier="EP", workspace=workspace, created_by=create_user, updated_by=create_user
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
        estimate_id = first.data["id"]

        # Re-PATCH the same estimate with last_used: true again (idempotent
        # activation) -- must not raise IntegrityError or create a duplicate.
        again = session_client.patch(
            get_estimate_detail_url(workspace.slug, project.id, estimate_id),
            {"estimate": {"last_used": True}},
            format="json",
        )
        assert again.status_code == status.HTTP_200_OK
        assert EstimateProperty.objects.filter(
            project=project, estimate_id=estimate_id, is_estimate_default=True
        ).count() == 1


@pytest.mark.contract
class TestEstimatePropertyIsEstimateDefaultReadOnly:
    """Step B7: is_estimate_default is system-managed -- read-only on the
    general create/update endpoint, same rationale as kpi_role."""

    def _property_detail_url(self, workspace_slug, project_id, property_id):
        return f"/api/workspaces/{workspace_slug}/projects/{project_id}/estimate-properties/{property_id}/"

    def _properties_list_url(self, workspace_slug, project_id):
        return f"/api/workspaces/{workspace_slug}/projects/{project_id}/estimate-properties/"

    @pytest.mark.django_db
    def test_patch_with_is_estimate_default_true_is_silently_ignored(
        self, session_client, workspace, create_user
    ):
        project = Project.objects.create(
            name="Estimate Project", identifier="EP", workspace=workspace, created_by=create_user, updated_by=create_user
        )
        ProjectMember.objects.create(project=project, member=create_user, role=20)
        estimate = Estimate.objects.create(name="Points", project=project, workspace=workspace, type="points", created_by=create_user)
        custom_property = EstimateProperty.objects.create(
            name="Custom", estimate=estimate, project=project, workspace=workspace, is_estimate_default=False
        )

        response = session_client.patch(
            self._property_detail_url(workspace.slug, project.id, custom_property.id),
            {"is_estimate_default": True, "name": "Renamed"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

        custom_property.refresh_from_db()
        assert custom_property.is_estimate_default is False
        assert custom_property.name == "Renamed"

    @pytest.mark.django_db
    def test_get_and_post_responses_include_is_estimate_default(
        self, session_client, workspace, create_user
    ):
        project = Project.objects.create(
            name="Estimate Project", identifier="EP", workspace=workspace, created_by=create_user, updated_by=create_user
        )
        ProjectMember.objects.create(project=project, member=create_user, role=20)
        estimate = Estimate.objects.create(name="Points", project=project, workspace=workspace, type="points", created_by=create_user)

        post_response = session_client.post(
            self._properties_list_url(workspace.slug, project.id),
            {"name": "Custom", "estimate": str(estimate.id)},
            format="json",
        )
        assert post_response.status_code == status.HTTP_201_CREATED
        assert post_response.data["is_estimate_default"] is False

        get_response = session_client.get(self._properties_list_url(workspace.slug, project.id))
        assert get_response.status_code == status.HTTP_200_OK
        assert all("is_estimate_default" in row for row in get_response.data)


@pytest.mark.contract
class TestBulkResyncIssueEstimatePointOnDefaultPromotion:
    """Step B8: closes the Phase 3 review blocker -- when the project's
    default estimate system is promoted/reassigned, every issue's legacy
    Issue.estimate_point must be resynced from the newly-promoted system's
    own per-issue IssueEstimatePropertyValue, not left pointing at the OLD
    default's stale value."""

    def _property_value_url(self, workspace_slug, project_id, issue_id, property_id):
        from django.urls import reverse

        return reverse(
            "issue-estimate-property-value",
            kwargs={"slug": workspace_slug, "project_id": project_id, "issue_id": issue_id, "property_id": property_id},
        )

    @pytest.mark.django_db
    def test_deactivating_default_estimate_resyncs_issues_to_the_promoted_systems_values(
        self, session_client, workspace, create_user
    ):
        from plane.db.models import EstimateProperty, Issue, State

        project = Project.objects.create(
            name="Estimate Project", identifier="EP", workspace=workspace, created_by=create_user, updated_by=create_user
        )
        ProjectMember.objects.create(project=project, member=create_user, role=20)
        state = State.objects.create(
            name="Todo", color="#000", group="unstarted", project=project, workspace=workspace, created_by=create_user
        )

        # System A (Categories) -- project default. System B (also Categories,
        # so both can be last_used=True simultaneously without triggering the
        # single-active-numeric rule).
        system_a = session_client.post(
            get_estimates_url(workspace.slug, project.id),
            {
                "estimate": {"name": "System A", "type": "categories", "last_used": True},
                "estimate_points": [{"key": 1, "value": "Easy A"}, {"key": 2, "value": "Hard A"}],
            },
            format="json",
        ).data
        system_b = session_client.post(
            get_estimates_url(workspace.slug, project.id),
            {
                "estimate": {"name": "System B", "type": "categories", "last_used": True},
                "estimate_points": [{"key": 1, "value": "Easy B"}, {"key": 2, "value": "Hard B"}],
            },
            format="json",
        ).data

        project.refresh_from_db()
        assert project.estimate_id == system_a["id"]

        property_a = EstimateProperty.objects.get(project=project, estimate_id=system_a["id"], is_estimate_default=True)
        property_b = EstimateProperty.objects.get(project=project, estimate_id=system_b["id"], is_estimate_default=True)
        point_a_hard = next(p for p in system_a["points"] if p["value"] == "Hard A")
        point_b_easy = next(p for p in system_b["points"] if p["value"] == "Easy B")

        # Issue 1 has values under BOTH systems.
        issue_1 = Issue.objects.create(name="Both", project=project, workspace=workspace, state=state, created_by=create_user)
        session_client.put(
            self._property_value_url(workspace.slug, project.id, issue_1.id, property_a.id),
            {"estimate_point": point_a_hard["id"]},
            format="json",
        )
        session_client.put(
            self._property_value_url(workspace.slug, project.id, issue_1.id, property_b.id),
            {"estimate_point": point_b_easy["id"]},
            format="json",
        )
        issue_1.refresh_from_db()
        assert issue_1.estimate_point_id == point_a_hard["id"]

        # Issue 2 has a value under A only (no value under B).
        issue_2 = Issue.objects.create(name="OnlyA", project=project, workspace=workspace, state=state, created_by=create_user)
        session_client.put(
            self._property_value_url(workspace.slug, project.id, issue_2.id, property_a.id),
            {"estimate_point": point_a_hard["id"]},
            format="json",
        )
        issue_2.refresh_from_db()
        assert issue_2.estimate_point_id == point_a_hard["id"]

        # Deactivate System A -- promotes System B to project default.
        deactivate = session_client.patch(
            get_estimate_detail_url(workspace.slug, project.id, system_a["id"]),
            {"estimate": {"last_used": False}},
            format="json",
        )
        assert deactivate.status_code == status.HTTP_200_OK
        project.refresh_from_db()
        assert project.estimate_id == system_b["id"]

        # Issue 1: resynced to match its value under B (Easy B), not A's stale Hard A.
        issue_1.refresh_from_db()
        assert issue_1.estimate_point_id == point_b_easy["id"]

        # Issue 2: no value under B -> resynced to None, not left stale at A's value.
        issue_2.refresh_from_db()
        assert issue_2.estimate_point_id is None

    @pytest.mark.django_db
    def test_numeric_estimate_conflict_promotion_triggers_same_resync(
        self, session_client, workspace, create_user
    ):
        from plane.db.models import EstimateProperty, Issue, State

        project = Project.objects.create(
            name="Estimate Project", identifier="EP", workspace=workspace, created_by=create_user, updated_by=create_user
        )
        ProjectMember.objects.create(project=project, member=create_user, role=20)
        state = State.objects.create(
            name="Todo", color="#000", group="unstarted", project=project, workspace=workspace, created_by=create_user
        )

        first = session_client.post(
            get_estimates_url(workspace.slug, project.id),
            {
                "estimate": {"name": "Points", "type": "points", "last_used": True},
                "estimate_points": [{"key": 1, "value": "1"}, {"key": 2, "value": "2"}],
            },
            format="json",
        ).data
        project.refresh_from_db()
        assert project.estimate_id == first["id"]

        first_property = EstimateProperty.objects.get(project=project, estimate_id=first["id"], is_estimate_default=True)
        first_point_2 = next(p for p in first["points"] if p["value"] == "2")

        issue = Issue.objects.create(name="Task", project=project, workspace=workspace, state=state, created_by=create_user)
        session_client.put(
            self._property_value_url(workspace.slug, project.id, issue.id, first_property.id),
            {"estimate_point": first_point_2["id"]},
            format="json",
        )
        issue.refresh_from_db()
        assert issue.estimate_point_id == first_point_2["id"]

        # Activating a second numeric (Time) estimate deactivates the first
        # (single-active-numeric rule) and, since the first was the project
        # default, promotes the second -- via _activate_numeric_estimate, not
        # the explicit deactivation branch.
        second = session_client.post(
            get_estimates_url(workspace.slug, project.id),
            {
                "estimate": {"name": "Time", "type": "time", "last_used": True},
                "estimate_points": [{"key": 1, "value": "60"}, {"key": 2, "value": "120"}],
            },
            format="json",
        ).data
        project.refresh_from_db()
        assert project.estimate_id == second["id"]

        # Issue has no value under the new default (Time) -> resynced to None.
        issue.refresh_from_db()
        assert issue.estimate_point_id is None


@pytest.mark.contract
class TestEstimatePointDestroyNoReplacementSynchronousNulling:
    """Step B9: EstimatePoint.destroy() is a soft-delete (SoftDeleteModel), so
    Django's on_delete=SET_NULL collector never fires synchronously for it --
    only the async soft_delete_related_objects cascade does. The "no
    replacement" branch must null Issue.estimate_point /
    IssueEstimatePropertyValue.estimate_point synchronously (mirroring
    Estimate.destroy()'s existing precedent), not rely solely on that async
    cascade being up.

    These tests patch out soft_delete_related_objects.delay -- simulating
    "the async worker is down/backlogged", the exact scenario B9 protects
    against -- so the assertions can only pass via the endpoint's OWN
    synchronous nulling, not incidentally via the cascade also running eagerly
    under this test suite's CELERY_TASK_ALWAYS_EAGER setting.
    """

    @pytest.mark.django_db
    def test_deleting_point_with_no_replacement_nulls_issue_estimate_point_synchronously(
        self, session_client, workspace, create_user, monkeypatch
    ):
        from plane.db.models import Issue, State
        from plane.db import mixins as db_mixins

        monkeypatch.setattr(db_mixins.soft_delete_related_objects, "delay", lambda *a, **k: None)

        project = Project.objects.create(
            name="Estimate Project", identifier="EP", workspace=workspace, created_by=create_user, updated_by=create_user
        )
        ProjectMember.objects.create(project=project, member=create_user, role=20)
        state = State.objects.create(
            name="Todo", color="#000", group="unstarted", project=project, workspace=workspace, created_by=create_user
        )

        create_response = session_client.post(
            get_estimates_url(workspace.slug, project.id),
            {
                "estimate": {"name": "Points", "type": "points", "last_used": True},
                "estimate_points": [{"key": 1, "value": "1"}, {"key": 2, "value": "2"}, {"key": 3, "value": "3"}],
            },
            format="json",
        ).data
        estimate_id = create_response["id"]
        point_to_delete = next(p for p in create_response["points"] if p["value"] == "2")

        issue = Issue.objects.create(name="Task", project=project, workspace=workspace, state=state, created_by=create_user)
        Issue.objects.filter(id=issue.id).update(estimate_point_id=point_to_delete["id"])
        issue.refresh_from_db()
        assert issue.estimate_point_id == point_to_delete["id"]

        response = session_client.delete(
            get_estimate_point_detail_url(workspace.slug, project.id, estimate_id, point_to_delete["id"])
        )
        assert response.status_code == status.HTTP_200_OK

        # Synchronous -- no eventual-consistency wait needed.
        issue.refresh_from_db()
        assert issue.estimate_point_id is None

    @pytest.mark.django_db
    def test_deleting_point_with_no_replacement_nulls_issue_estimate_property_value_synchronously(
        self, session_client, workspace, create_user, monkeypatch
    ):
        from plane.db.models import EstimateProperty, Issue, IssueEstimatePropertyValue, State
        from plane.db import mixins as db_mixins

        monkeypatch.setattr(db_mixins.soft_delete_related_objects, "delay", lambda *a, **k: None)

        project = Project.objects.create(
            name="Estimate Project", identifier="EP", workspace=workspace, created_by=create_user, updated_by=create_user
        )
        ProjectMember.objects.create(project=project, member=create_user, role=20)
        state = State.objects.create(
            name="Todo", color="#000", group="unstarted", project=project, workspace=workspace, created_by=create_user
        )

        create_response = session_client.post(
            get_estimates_url(workspace.slug, project.id),
            {
                "estimate": {"name": "Points", "type": "points", "last_used": True},
                "estimate_points": [{"key": 1, "value": "1"}, {"key": 2, "value": "2"}, {"key": 3, "value": "3"}],
            },
            format="json",
        ).data
        estimate_id = create_response["id"]
        point_to_delete = next(p for p in create_response["points"] if p["value"] == "2")

        custom_property = EstimateProperty.objects.create(
            name="Custom", estimate_id=estimate_id, project=project, workspace=workspace, is_estimate_default=False
        )
        issue = Issue.objects.create(name="Task", project=project, workspace=workspace, state=state, created_by=create_user)
        value = IssueEstimatePropertyValue.objects.create(
            issue=issue, property=custom_property, estimate_point_id=point_to_delete["id"],
            project=project, workspace=workspace,
        )

        response = session_client.delete(
            get_estimate_point_detail_url(workspace.slug, project.id, estimate_id, point_to_delete["id"])
        )
        assert response.status_code == status.HTTP_200_OK

        value.refresh_from_db()
        assert value.estimate_point_id is None

    @pytest.mark.django_db
    def test_bulk_deleting_points_with_no_replacement_nulls_issue_estimate_point_synchronously(
        self, session_client, workspace, create_user, monkeypatch
    ):
        from plane.db.models import Issue, State, EstimateProperty, IssueEstimatePropertyValue
        from plane.db import mixins as db_mixins

        monkeypatch.setattr(db_mixins.soft_delete_related_objects, "delay", lambda *a, **k: None)

        project = Project.objects.create(
            name="Estimate Project", identifier="EP", workspace=workspace, created_by=create_user, updated_by=create_user
        )
        ProjectMember.objects.create(project=project, member=create_user, role=20)
        state = State.objects.create(
            name="Todo", color="#000", group="unstarted", project=project, workspace=workspace, created_by=create_user
        )

        create_response = session_client.post(
            get_estimates_url(workspace.slug, project.id),
            {
                "estimate": {"name": "Points", "type": "points", "last_used": True},
                "estimate_points": [{"key": 1, "value": "1"}, {"key": 2, "value": "2"}, {"key": 3, "value": "3"}],
            },
            format="json",
        ).data
        estimate_id = create_response["id"]
        point_to_delete = next(p for p in create_response["points"] if p["value"] == "2")

        custom_property = EstimateProperty.objects.create(
            name="Custom", estimate_id=estimate_id, project=project, workspace=workspace, is_estimate_default=False
        )

        issue = Issue.objects.create(name="Task", project=project, workspace=workspace, state=state, created_by=create_user)
        Issue.objects.filter(id=issue.id).update(estimate_point_id=point_to_delete["id"])
        issue.refresh_from_db()
        assert issue.estimate_point_id == point_to_delete["id"]
        
        value = IssueEstimatePropertyValue.objects.create(
            issue=issue, property=custom_property, estimate_point_id=point_to_delete["id"],
            project=project, workspace=workspace,
        )

        response = session_client.delete(
            get_estimate_point_create_url(workspace.slug, project.id, estimate_id),
            data={"estimate_points": [point_to_delete["id"]]},
            format="json",
        )
        assert response.status_code == status.HTTP_204_NO_CONTENT

        issue.refresh_from_db()
        assert issue.estimate_point_id is None

        value.refresh_from_db()
        assert value.estimate_point_id is None

        response = session_client.delete(
            get_estimate_point_detail_url(workspace.slug, project.id, estimate_id, point_to_delete["id"])
        )
        assert response.status_code == status.HTTP_200_OK

        value.refresh_from_db()
        assert value.estimate_point_id is None
