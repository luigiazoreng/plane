# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from django.db import IntegrityError, transaction

from plane.db.models import Estimate, EstimateProperty, Project, ProjectMember
from plane.db.models.estimate import EstimateType


@pytest.mark.unit
class TestEstimateType:
    def test_time_estimate_type_is_available(self):
        assert EstimateType.TIME == "time"
        assert ("time", "Time") in EstimateType.choices


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(
        name="Estimate Model Project",
        identifier="ESTMDL",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.mark.unit
@pytest.mark.django_db
class TestEstimatePropertyIsEstimateDefaultConstraint:
    def test_duplicate_is_estimate_default_for_same_project_and_estimate_raises_integrity_error(
        self, project, workspace, create_user
    ):
        estimate = Estimate.objects.create(
            name="Points", project=project, workspace=workspace, type="points", created_by=create_user
        )
        EstimateProperty.objects.create(
            name="Points (default)",
            estimate=estimate,
            project=project,
            workspace=workspace,
            is_estimate_default=True,
        )
        with pytest.raises(IntegrityError):
            with transaction.atomic():
                EstimateProperty.objects.create(
                    name="Points (default) duplicate",
                    estimate=estimate,
                    project=project,
                    workspace=workspace,
                    is_estimate_default=True,
                )

    def test_is_estimate_default_allowed_for_different_estimates_on_same_project(
        self, project, workspace, create_user
    ):
        estimate_a = Estimate.objects.create(
            name="Categories", project=project, workspace=workspace, type="categories", created_by=create_user
        )
        estimate_b = Estimate.objects.create(
            name="Points", project=project, workspace=workspace, type="points", created_by=create_user
        )
        prop_a = EstimateProperty.objects.create(
            name="Categories (default)",
            estimate=estimate_a,
            project=project,
            workspace=workspace,
            is_estimate_default=True,
        )
        prop_b = EstimateProperty.objects.create(
            name="Points (default)",
            estimate=estimate_b,
            project=project,
            workspace=workspace,
            is_estimate_default=True,
        )
        assert prop_a.is_estimate_default is True
        assert prop_b.is_estimate_default is True
        assert EstimateProperty.objects.filter(project=project, is_estimate_default=True).count() == 2

    def test_non_default_rows_are_unconstrained_and_can_be_created_freely(
        self, project, workspace, create_user
    ):
        estimate = Estimate.objects.create(
            name="Points", project=project, workspace=workspace, type="points", created_by=create_user
        )
        prop_1 = EstimateProperty.objects.create(
            name="Custom 1", estimate=estimate, project=project, workspace=workspace
        )
        prop_2 = EstimateProperty.objects.create(
            name="Custom 2", estimate=estimate, project=project, workspace=workspace
        )
        assert prop_1.is_estimate_default is False
        assert prop_2.is_estimate_default is False
        assert EstimateProperty.objects.filter(project=project, estimate=estimate).count() == 2
