# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Step B7: is_estimate_default is system-managed (like kpi_role) -- must be
read-only on EstimatePropertySerializer itself, at the serializer level, not
just incidentally filtered by the view's allowlist. These tests exercise the
serializer directly (bypassing EstimatePropertyDetailEndpoint's own
allowed_fields filtering) so they'd catch a regression even if a future
endpoint saves through this serializer without that extra view-level filter.
"""

import pytest

from plane.app.serializers import EstimatePropertySerializer
from plane.db.models import Estimate, EstimateProperty, Project, ProjectMember


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(
        name="Estimate Serializer Project", identifier="ESER", workspace=workspace, created_by=create_user
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.mark.unit
@pytest.mark.django_db
class TestEstimatePropertySerializerIsEstimateDefaultReadOnly:
    def test_is_estimate_default_is_declared_read_only(self):
        assert "is_estimate_default" in EstimatePropertySerializer.Meta.read_only_fields

    def test_saving_with_is_estimate_default_true_in_input_data_does_not_change_it(
        self, project, workspace, create_user
    ):
        estimate = Estimate.objects.create(
            name="Points", project=project, workspace=workspace, type="points", created_by=create_user
        )
        prop = EstimateProperty.objects.create(
            name="Custom", estimate=estimate, project=project, workspace=workspace, is_estimate_default=False
        )

        serializer = EstimatePropertySerializer(
            prop, data={"is_estimate_default": True, "name": "Renamed"}, partial=True
        )
        assert serializer.is_valid(), serializer.errors
        saved = serializer.save()

        assert saved.is_estimate_default is False
        assert saved.name == "Renamed"

        prop.refresh_from_db()
        assert prop.is_estimate_default is False
