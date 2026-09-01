# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Unit tests for the 0151 data migration's RunPython function.

This repo runs tests with `--nomigrations` (pytest.ini), so real migrations
never execute during the test suite and `django_test_migrations` is not a
dependency here. Instead, per the Build plan, the migration module's
RunPython function is imported directly (via importlib, since the module
name starts with a digit) and called against normal-ORM-created rows in a
`@pytest.mark.django_db` test -- exercising the exact same function that
production's migration runner will call, without needing a migration-runner
fixture.
"""

import importlib

import pytest

from plane.db.models import (
    Estimate,
    EstimatePoint,
    EstimateProperty,
    Issue,
    IssueEstimatePropertyValue,
    Project,
    ProjectMember,
    State,
)

_migration_module = importlib.import_module(
    "plane.db.migrations.0151_backfill_estimate_default_properties"
)
backfill_estimate_default_properties = _migration_module.backfill_estimate_default_properties


class _RealAppsRegistry:
    """Adapter so the RunPython function (written for historical
    `apps.get_model(...)`) can be called directly against the real, current
    app registry in tests -- same interface, real (non-historical) models."""

    @staticmethod
    def get_model(app_label, model_name):
        from django.apps import apps as real_apps

        return real_apps.get_model(app_label, model_name)


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(
        name="Migration 0151 Project",
        identifier="MIG151",
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
        created_by=create_user,
    )
    if "estimate_point" in overrides:
        Issue.objects.filter(id=issue.id).update(estimate_point=overrides["estimate_point"])
        issue.refresh_from_db()
    return issue


@pytest.mark.unit
@pytest.mark.django_db
class TestBackfillEstimateDefaultProperties:
    def run_migration(self):
        backfill_estimate_default_properties(_RealAppsRegistry(), schema_editor=None)

    def test_issue_pointing_at_active_estimate_gets_migrated_to_default_property_value(
        self, project, workspace, state, create_user
    ):
        estimate = Estimate.objects.create(
            name="Points", project=project, workspace=workspace, type="points",
            last_used=True, created_by=create_user,
        )
        point = EstimatePoint.objects.create(
            estimate=estimate, project=project, workspace=workspace, key=0, value="5", created_by=create_user
        )
        issue = _make_issue(project, workspace, state, create_user, estimate_point=point)

        # Pre-condition: no EstimateProperty/value exists yet.
        assert not EstimateProperty.objects.filter(project=project, estimate=estimate).exists()
        assert not IssueEstimatePropertyValue.objects.filter(issue=issue).exists()

        self.run_migration()

        default_property = EstimateProperty.objects.get(
            project=project, estimate=estimate, is_estimate_default=True
        )
        assert default_property.name == "Points"
        assert default_property.workspace_id == workspace.id
        assert default_property.kpi_role is None

        value = IssueEstimatePropertyValue.objects.get(issue=issue, property=default_property)
        assert value.estimate_point_id == point.id
        assert value.project_id == project.id
        assert value.workspace_id == workspace.id

    def test_issue_pointing_at_inactive_stale_estimate_still_gets_migrated(
        self, project, workspace, state, create_user
    ):
        stale_estimate = Estimate.objects.create(
            name="Stale", project=project, workspace=workspace, type="points",
            last_used=False, created_by=create_user,
        )
        point = EstimatePoint.objects.create(
            estimate=stale_estimate, project=project, workspace=workspace, key=0, value="3", created_by=create_user
        )
        issue = _make_issue(project, workspace, state, create_user, estimate_point=point)

        self.run_migration()

        default_property = EstimateProperty.objects.get(
            project=project, estimate=stale_estimate, is_estimate_default=True
        )
        value = IssueEstimatePropertyValue.objects.get(issue=issue, property=default_property)
        assert value.estimate_point_id == point.id

    def test_active_estimate_with_zero_issues_still_gets_a_default_property(
        self, project, workspace, create_user
    ):
        estimate = Estimate.objects.create(
            name="Categories", project=project, workspace=workspace, type="categories",
            last_used=True, created_by=create_user,
        )

        self.run_migration()

        assert EstimateProperty.objects.filter(
            project=project, estimate=estimate, is_estimate_default=True
        ).exists()

    def test_running_migration_twice_is_idempotent(self, project, workspace, state, create_user):
        estimate = Estimate.objects.create(
            name="Points", project=project, workspace=workspace, type="points",
            last_used=True, created_by=create_user,
        )
        point = EstimatePoint.objects.create(
            estimate=estimate, project=project, workspace=workspace, key=0, value="5", created_by=create_user
        )
        issue = _make_issue(project, workspace, state, create_user, estimate_point=point)

        self.run_migration()
        self.run_migration()

        assert EstimateProperty.objects.filter(
            project=project, estimate=estimate, is_estimate_default=True
        ).count() == 1
        assert IssueEstimatePropertyValue.objects.filter(issue=issue).count() == 1
