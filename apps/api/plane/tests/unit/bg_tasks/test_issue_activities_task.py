# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Unit tests for track_estimate_property_value_activity (Step B6) -- narrower,
function-level tests than the integration-level coverage in
test_estimate_property_values.py (Step B5)."""

import pytest

from plane.bgtasks.issue_activities_task import track_estimate_property_value_activity
from plane.db.models import Estimate, EstimatePoint, EstimateProperty, Issue, Project, ProjectMember, State


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(
        name="Activity Task Project", identifier="ATP", workspace=workspace, created_by=create_user
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.fixture
def state(project, workspace, create_user):
    return State.objects.create(
        name="Todo", color="#000", group="unstarted", project=project, workspace=workspace, created_by=create_user
    )


@pytest.fixture
def issue(project, workspace, state, create_user):
    return Issue.objects.create(name="Task", project=project, workspace=workspace, state=state, created_by=create_user)


@pytest.fixture
def estimate_and_property(project, workspace, create_user):
    estimate = Estimate.objects.create(
        name="Points", project=project, workspace=workspace, type="points", created_by=create_user
    )
    prop = EstimateProperty.objects.create(name="Points", estimate=estimate, project=project, workspace=workspace)
    return estimate, prop


@pytest.mark.unit
@pytest.mark.django_db
class TestTrackEstimatePropertyValueActivity:
    def test_updated_verb_with_correct_old_and_new_values(
        self, project, workspace, state, issue, create_user, estimate_and_property
    ):
        estimate, prop = estimate_and_property
        old_point = EstimatePoint.objects.create(
            estimate=estimate, project=project, workspace=workspace, key=0, value="3", created_by=create_user
        )
        new_point = EstimatePoint.objects.create(
            estimate=estimate, project=project, workspace=workspace, key=1, value="8", created_by=create_user
        )

        issue_activities = []
        track_estimate_property_value_activity(
            requested_data='{"property_id": "%s", "estimate_point": "%s"}' % (prop.id, new_point.id),
            current_instance='{"estimate_point": "%s"}' % old_point.id,
            issue_id=issue.id,
            project_id=project.id,
            workspace_id=workspace.id,
            actor_id=create_user.id,
            issue_activities=issue_activities,
            epoch=1234567890,
        )

        assert len(issue_activities) == 1
        activity = issue_activities[0]
        assert activity.verb == "updated"
        assert activity.old_value == "3"
        assert activity.new_value == "8"
        assert activity.field == f"estimate_property_{prop.id}"

    def test_removed_verb_when_new_value_is_none(
        self, project, workspace, state, issue, create_user, estimate_and_property
    ):
        estimate, prop = estimate_and_property
        old_point = EstimatePoint.objects.create(
            estimate=estimate, project=project, workspace=workspace, key=0, value="5", created_by=create_user
        )

        issue_activities = []
        track_estimate_property_value_activity(
            requested_data='{"property_id": "%s", "estimate_point": null}' % prop.id,
            current_instance='{"estimate_point": "%s"}' % old_point.id,
            issue_id=issue.id,
            project_id=project.id,
            workspace_id=workspace.id,
            actor_id=create_user.id,
            issue_activities=issue_activities,
            epoch=1234567890,
        )

        assert len(issue_activities) == 1
        activity = issue_activities[0]
        assert activity.verb == "removed"
        assert activity.old_value == "5"
        assert activity.new_value is None

    def test_field_name_is_scoped_to_property_id_not_a_fixed_string(
        self, project, workspace, state, issue, create_user, estimate_and_property
    ):
        estimate, prop_a = estimate_and_property
        prop_b = EstimateProperty.objects.create(
            name="Points (2)", estimate=estimate, project=project, workspace=workspace
        )
        point = EstimatePoint.objects.create(
            estimate=estimate, project=project, workspace=workspace, key=0, value="2", created_by=create_user
        )

        activities_a = []
        track_estimate_property_value_activity(
            requested_data='{"property_id": "%s", "estimate_point": "%s"}' % (prop_a.id, point.id),
            current_instance="{}",
            issue_id=issue.id,
            project_id=project.id,
            workspace_id=workspace.id,
            actor_id=create_user.id,
            issue_activities=activities_a,
            epoch=1234567890,
        )
        activities_b = []
        track_estimate_property_value_activity(
            requested_data='{"property_id": "%s", "estimate_point": "%s"}' % (prop_b.id, point.id),
            current_instance="{}",
            issue_id=issue.id,
            project_id=project.id,
            workspace_id=workspace.id,
            actor_id=create_user.id,
            issue_activities=activities_b,
            epoch=1234567890,
        )

        assert activities_a[0].field == f"estimate_property_{prop_a.id}"
        assert activities_b[0].field == f"estimate_property_{prop_b.id}"
        assert activities_a[0].field != activities_b[0].field
