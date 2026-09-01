# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for IssueEstimatePropertyValueEndpoint.put -- Step B5's dual-write
(legacy Issue.estimate_point stays in sync for the project's DEFAULT system only)
and Step B6's precise per-system activity logging.

Coverage matrix:
| Scenario                                              | Assertion                          |
|--------------------------------------------------------|-------------------------------------|
| Set value on non-default (custom) property              | Issue.estimate_point untouched      |
| Set value on default property for project's default sys | Issue.estimate_point updates        |
| Set value on default property for a SECONDARY system    | Issue.estimate_point untouched      |
| Clear value on default property for project's default   | Issue.estimate_point cleared        |
| Any property value change                                | 1 estimate_property_<id> activity   |
| Default-system change (project default)                  | + 1 legacy estimate_<type> activity |
| Default-system change (secondary, non-project-default)   | no legacy activity row              |
"""

import uuid

import pytest
from django.urls import reverse
from rest_framework import status

from plane.db.models import (
    Estimate,
    EstimatePoint,
    EstimateProperty,
    Issue,
    IssueActivity,
    Project,
    ProjectMember,
    State,
)


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(
        name="Estimate Property Value Project",
        identifier="EPV",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.fixture
def state(project, workspace, create_user):
    return State.objects.create(
        name="Todo", color="#000000", group="unstarted", project=project, workspace=workspace, created_by=create_user
    )


@pytest.fixture
def issue(project, workspace, state, create_user):
    return Issue.objects.create(
        name="Task", project=project, workspace=workspace, state=state, created_by=create_user
    )


def _value_url(workspace_slug, project_id, issue_id, property_id):
    return reverse(
        "issue-estimate-property-value",
        kwargs={"slug": workspace_slug, "project_id": project_id, "issue_id": issue_id, "property_id": property_id},
    )


@pytest.mark.contract
@pytest.mark.django_db
class TestIssueEstimatePropertyValueDualWriteAndActivity:
    def test_non_default_property_value_does_not_touch_issue_estimate_point(
        self, session_client, workspace, project, issue, create_user
    ):
        estimate = Estimate.objects.create(
            name="Points", project=project, workspace=workspace, type="points",
            last_used=True, created_by=create_user,
        )
        point = EstimatePoint.objects.create(
            estimate=estimate, project=project, workspace=workspace, key=0, value="5", created_by=create_user
        )
        custom_property = EstimateProperty.objects.create(
            name="Custom", estimate=estimate, project=project, workspace=workspace, is_estimate_default=False
        )

        # Pre-condition
        issue.refresh_from_db()
        assert issue.estimate_point_id is None

        response = session_client.put(
            _value_url(workspace.slug, project.id, issue.id, custom_property.id),
            {"estimate_point": str(point.id)},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

        issue.refresh_from_db()
        assert issue.estimate_point_id is None

    def test_default_property_for_project_default_system_updates_issue_estimate_point(
        self, session_client, workspace, project, issue, create_user
    ):
        estimate = Estimate.objects.create(
            name="Points", project=project, workspace=workspace, type="points",
            last_used=True, created_by=create_user,
        )
        point = EstimatePoint.objects.create(
            estimate=estimate, project=project, workspace=workspace, key=0, value="8", created_by=create_user
        )
        default_property = EstimateProperty.objects.create(
            name="Points", estimate=estimate, project=project, workspace=workspace, is_estimate_default=True
        )
        project.estimate = estimate
        project.save(update_fields=["estimate"])

        issue.refresh_from_db()
        assert issue.estimate_point_id is None

        response = session_client.put(
            _value_url(workspace.slug, project.id, issue.id, default_property.id),
            {"estimate_point": str(point.id)},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

        issue.refresh_from_db()
        assert issue.estimate_point_id == point.id

    def test_default_property_for_secondary_non_default_system_does_not_touch_issue_estimate_point(
        self, session_client, workspace, project, issue, create_user
    ):
        default_estimate = Estimate.objects.create(
            name="Categories", project=project, workspace=workspace, type="categories",
            last_used=True, created_by=create_user,
        )
        project.estimate = default_estimate
        project.save(update_fields=["estimate"])

        secondary_estimate = Estimate.objects.create(
            name="Points", project=project, workspace=workspace, type="points",
            last_used=True, created_by=create_user,
        )
        secondary_point = EstimatePoint.objects.create(
            estimate=secondary_estimate, project=project, workspace=workspace, key=0, value="13", created_by=create_user
        )
        secondary_default_property = EstimateProperty.objects.create(
            name="Points", estimate=secondary_estimate, project=project, workspace=workspace, is_estimate_default=True
        )

        issue.refresh_from_db()
        assert issue.estimate_point_id is None

        response = session_client.put(
            _value_url(workspace.slug, project.id, issue.id, secondary_default_property.id),
            {"estimate_point": str(secondary_point.id)},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

        issue.refresh_from_db()
        assert issue.estimate_point_id is None

    def test_clearing_value_on_default_property_clears_issue_estimate_point(
        self, session_client, workspace, project, issue, create_user
    ):
        estimate = Estimate.objects.create(
            name="Points", project=project, workspace=workspace, type="points",
            last_used=True, created_by=create_user,
        )
        point = EstimatePoint.objects.create(
            estimate=estimate, project=project, workspace=workspace, key=0, value="8", created_by=create_user
        )
        default_property = EstimateProperty.objects.create(
            name="Points", estimate=estimate, project=project, workspace=workspace, is_estimate_default=True
        )
        project.estimate = estimate
        project.save(update_fields=["estimate"])

        set_response = session_client.put(
            _value_url(workspace.slug, project.id, issue.id, default_property.id),
            {"estimate_point": str(point.id)},
            format="json",
        )
        assert set_response.status_code == status.HTTP_200_OK
        issue.refresh_from_db()
        assert issue.estimate_point_id == point.id

        clear_response = session_client.put(
            _value_url(workspace.slug, project.id, issue.id, default_property.id),
            {"estimate_point": None},
            format="json",
        )
        assert clear_response.status_code == status.HTTP_200_OK

        issue.refresh_from_db()
        assert issue.estimate_point_id is None

    def test_any_property_value_change_creates_precise_activity_row(
        self, session_client, workspace, project, issue, create_user
    ):
        estimate = Estimate.objects.create(
            name="Points", project=project, workspace=workspace, type="points",
            last_used=True, created_by=create_user,
        )
        point = EstimatePoint.objects.create(
            estimate=estimate, project=project, workspace=workspace, key=0, value="8", created_by=create_user
        )
        custom_property = EstimateProperty.objects.create(
            name="Custom", estimate=estimate, project=project, workspace=workspace, is_estimate_default=False
        )

        assert not IssueActivity.objects.filter(issue=issue).exists()

        response = session_client.put(
            _value_url(workspace.slug, project.id, issue.id, custom_property.id),
            {"estimate_point": str(point.id)},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

        activities = IssueActivity.objects.filter(issue=issue)
        assert activities.count() == 1
        activity = activities.first()
        assert activity.field == f"estimate_property_{custom_property.id}"
        assert activity.verb == "updated"
        assert activity.new_value == "8"
        assert activity.old_value is None

    def test_default_system_change_on_project_default_creates_two_activity_rows(
        self, session_client, workspace, project, issue, create_user
    ):
        estimate = Estimate.objects.create(
            name="Points", project=project, workspace=workspace, type="points",
            last_used=True, created_by=create_user,
        )
        point = EstimatePoint.objects.create(
            estimate=estimate, project=project, workspace=workspace, key=0, value="8", created_by=create_user
        )
        default_property = EstimateProperty.objects.create(
            name="Points", estimate=estimate, project=project, workspace=workspace, is_estimate_default=True
        )
        project.estimate = estimate
        project.save(update_fields=["estimate"])

        response = session_client.put(
            _value_url(workspace.slug, project.id, issue.id, default_property.id),
            {"estimate_point": str(point.id)},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

        activities = IssueActivity.objects.filter(issue=issue)
        assert activities.count() == 2
        fields = {a.field for a in activities}
        assert f"estimate_property_{default_property.id}" in fields
        legacy_fields = {f for f in fields if f.startswith("estimate_") and f != f"estimate_property_{default_property.id}"}
        assert len(legacy_fields) == 1
        assert legacy_fields.pop() == "estimate_points"

    def test_default_system_change_on_secondary_system_creates_only_one_activity_row(
        self, session_client, workspace, project, issue, create_user
    ):
        default_estimate = Estimate.objects.create(
            name="Categories", project=project, workspace=workspace, type="categories",
            last_used=True, created_by=create_user,
        )
        project.estimate = default_estimate
        project.save(update_fields=["estimate"])

        secondary_estimate = Estimate.objects.create(
            name="Points", project=project, workspace=workspace, type="points",
            last_used=True, created_by=create_user,
        )
        secondary_point = EstimatePoint.objects.create(
            estimate=secondary_estimate, project=project, workspace=workspace, key=0, value="13", created_by=create_user
        )
        secondary_default_property = EstimateProperty.objects.create(
            name="Points", estimate=secondary_estimate, project=project, workspace=workspace, is_estimate_default=True
        )

        response = session_client.put(
            _value_url(workspace.slug, project.id, issue.id, secondary_default_property.id),
            {"estimate_point": str(secondary_point.id)},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

        activities = IssueActivity.objects.filter(issue=issue)
        assert activities.count() == 1
        assert activities.first().field == f"estimate_property_{secondary_default_property.id}"

    def test_put_estimate_point_from_different_estimate_returns_400(
        self, session_client, workspace, project, issue, create_user
    ):
        estimate_a = Estimate.objects.create(name="A", project=project, workspace=workspace, type="points", last_used=True, created_by=create_user)
        point_a = EstimatePoint.objects.create(estimate=estimate_a, project=project, workspace=workspace, key=1, value="1", created_by=create_user)
        prop_a = EstimateProperty.objects.create(name="A", estimate=estimate_a, project=project, workspace=workspace, is_estimate_default=True)

        estimate_b = Estimate.objects.create(name="B", project=project, workspace=workspace, type="categories", last_used=True, created_by=create_user)
        point_b = EstimatePoint.objects.create(estimate=estimate_b, project=project, workspace=workspace, key=1, value="Easy", created_by=create_user)

        response = session_client.put(
            _value_url(workspace.slug, project.id, issue.id, prop_a.id),
            {"estimate_point": str(point_b.id)},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_put_estimate_point_from_different_project_returns_400(
        self, session_client, workspace, project, issue, create_user
    ):
        project_b = Project.objects.create(name="Project B", identifier="PB", workspace=workspace, created_by=create_user)
        ProjectMember.objects.create(project=project_b, member=create_user, role=20)
        
        estimate_a = Estimate.objects.create(name="A", project=project, workspace=workspace, type="points", last_used=True, created_by=create_user)
        prop_a = EstimateProperty.objects.create(name="A", estimate=estimate_a, project=project, workspace=workspace, is_estimate_default=True)

        estimate_b = Estimate.objects.create(name="B", project=project_b, workspace=workspace, type="points", last_used=True, created_by=create_user)
        point_b = EstimatePoint.objects.create(estimate=estimate_b, project=project_b, workspace=workspace, key=1, value="1", created_by=create_user)

        response = session_client.put(
            _value_url(workspace.slug, project.id, issue.id, prop_a.id),
            {"estimate_point": str(point_b.id)},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.contract
@pytest.mark.django_db
class TestIssueEstimatePropertyValueListEndpoint:
    def test_list_issue_estimate_property_values(self, session_client, workspace, project, issue, create_user):
        estimate = Estimate.objects.create(
            name="Points", project=project, workspace=workspace, type="points", last_used=True, created_by=create_user,
        )
        point = EstimatePoint.objects.create(
            estimate=estimate, project=project, workspace=workspace, key=0, value="5", created_by=create_user
        )
        property_a = EstimateProperty.objects.create(
            name="A", estimate=estimate, project=project, workspace=workspace, is_estimate_default=True
        )
        property_b = EstimateProperty.objects.create(
            name="B", estimate=estimate, project=project, workspace=workspace, is_estimate_default=False
        )

        session_client.put(
            _value_url(workspace.slug, project.id, issue.id, property_a.id),
            {"estimate_point": str(point.id)},
            format="json",
        )
        session_client.put(
            _value_url(workspace.slug, project.id, issue.id, property_b.id),
            {"estimate_point": str(point.id)},
            format="json",
        )

        url = reverse(
            "issue-estimate-property-values",
            kwargs={"slug": workspace.slug, "project_id": project.id, "issue_id": issue.id},
        )
        response = session_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 2
        property_ids = [str(item["property"]) for item in response.data]
        assert str(property_a.id) in property_ids
        assert str(property_b.id) in property_ids


def _bulk_values_url(workspace_slug, project_id, issue_ids=None):
    base = f"/api/workspaces/{workspace_slug}/projects/{project_id}/issue-estimate-properties/"
    if issue_ids is None:
        return base
    return f"{base}?issue_ids={','.join(str(i) for i in issue_ids)}"


@pytest.mark.contract
@pytest.mark.django_db
class TestIssueEstimatePropertyValueBulkListEndpoint:
    """F1: bulk-list estimate property values for many issues of the SAME
    project in a single request -- fixes the N+1 in list/kanban/spreadsheet/
    workspace-draft layouts (all-properties.tsx, estimate-column.tsx,
    draft-issue-properties.tsx each doing 1 request per row today).
    Project-scoped (not workspace-scoped) by design -- see fix-plan.md."""

    def test_bulk_returns_values_grouped_by_issue_and_isolates_by_project(
        self, session_client, workspace, project, issue, state, create_user
    ):
        estimate = Estimate.objects.create(
            name="Points", project=project, workspace=workspace, type="points", last_used=True, created_by=create_user,
        )
        point = EstimatePoint.objects.create(
            estimate=estimate, project=project, workspace=workspace, key=0, value="5", created_by=create_user
        )
        property_a = EstimateProperty.objects.create(
            name="A", estimate=estimate, project=project, workspace=workspace, is_estimate_default=True
        )

        # Reuse the `issue` fixture's State (same project can't have two
        # States named "Todo" -- unique_together(name, project)).
        issue_2 = Issue.objects.create(
            name="Task 2", project=project, workspace=workspace, state=state, created_by=create_user
        )
        # No value ever set on this one -- must be absent from the payload, not an error.
        issue_3_no_value = Issue.objects.create(
            name="Task 3", project=project, workspace=workspace, state=state, created_by=create_user
        )

        session_client.put(
            _value_url(workspace.slug, project.id, issue.id, property_a.id),
            {"estimate_point": str(point.id)},
            format="json",
        )
        session_client.put(
            _value_url(workspace.slug, project.id, issue_2.id, property_a.id),
            {"estimate_point": str(point.id)},
            format="json",
        )

        # A second project in the SAME workspace, with a value on an issue
        # whose id we deliberately ALSO pass in issue_ids -- must not leak.
        project_b = Project.objects.create(
            name="Other Project", identifier="OTHP", workspace=workspace, created_by=create_user
        )
        ProjectMember.objects.create(project=project_b, member=create_user, role=20, is_active=True)
        state_b = State.objects.create(
            name="Todo", color="#000000", group="unstarted", project=project_b, workspace=workspace, created_by=create_user
        )
        issue_b = Issue.objects.create(
            name="Other Task", project=project_b, workspace=workspace, state=state_b, created_by=create_user
        )
        estimate_b = Estimate.objects.create(
            name="Points", project=project_b, workspace=workspace, type="points", last_used=True, created_by=create_user,
        )
        point_b = EstimatePoint.objects.create(
            estimate=estimate_b, project=project_b, workspace=workspace, key=0, value="3", created_by=create_user
        )
        property_b = EstimateProperty.objects.create(
            name="B", estimate=estimate_b, project=project_b, workspace=workspace, is_estimate_default=True
        )
        session_client.put(
            _value_url(workspace.slug, project_b.id, issue_b.id, property_b.id),
            {"estimate_point": str(point_b.id)},
            format="json",
        )

        response = session_client.get(
            _bulk_values_url(workspace.slug, project.id, [issue.id, issue_2.id, issue_3_no_value.id, issue_b.id])
        )
        assert response.status_code == status.HTTP_200_OK
        payload = response.data

        assert str(issue.id) in payload
        assert str(issue_2.id) in payload
        assert len(payload[str(issue.id)]) == 1
        assert str(payload[str(issue.id)][0]["property"]) == str(property_a.id)

        # Issue with no values set -- absent from payload, not an error.
        assert str(issue_3_no_value.id) not in payload

        # Isolation: issue_b belongs to a DIFFERENT project -- must not leak
        # even though its id was explicitly included in issue_ids.
        assert str(issue_b.id) not in payload

    def test_bulk_requires_issue_ids_param(self, session_client, workspace, project):
        response = session_client.get(_bulk_values_url(workspace.slug, project.id))
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_bulk_empty_issue_ids_returns_empty_payload(self, session_client, workspace, project):
        response = session_client.get(_bulk_values_url(workspace.slug, project.id, []))
        assert response.status_code == status.HTTP_200_OK
        assert response.data == {}

    def test_bulk_rejects_more_than_cap_issue_ids(self, session_client, workspace, project):
        too_many_ids = [str(uuid.uuid4()) for _ in range(201)]
        response = session_client.get(_bulk_values_url(workspace.slug, project.id, too_many_ids))
        assert response.status_code == status.HTTP_400_BAD_REQUEST

