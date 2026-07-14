# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from .base import BaseSerializer

from plane.db.models import Estimate, EstimatePoint, NUMERIC_ESTIMATE_TYPES

from rest_framework import serializers


class EstimateSerializer(BaseSerializer):
    class Meta:
        model = Estimate
        fields = "__all__"
        read_only_fields = ["workspace", "project"]


class EstimatePointSerializer(BaseSerializer):
    def validate(self, data):
        if not data:
            raise serializers.ValidationError("Estimate points are required")
        value = data.get("value")
        if value and len(value) > 20:
            raise serializers.ValidationError("Value can't be more than 20 characters")

        # Points/Time estimates feed numeric analytics aggregations (Cast to float),
        # so their point values must be numeric. Caller passes the parent estimate's
        # type via context since it isn't always resolvable from self.instance (e.g.
        # on create, before the point exists).
        estimate_type = self.context.get("estimate_type")
        if estimate_type is None and self.instance is not None:
            estimate_type = self.instance.estimate.type
        if value and estimate_type in NUMERIC_ESTIMATE_TYPES:
            try:
                numeric_value = float(value)
            except (TypeError, ValueError):
                raise serializers.ValidationError("Value must be a number for points/time estimates")
            if numeric_value <= 0:
                raise serializers.ValidationError("Value must be greater than 0")
        return data

    class Meta:
        model = EstimatePoint
        fields = "__all__"
        read_only_fields = ["estimate", "workspace", "project"]


class EstimateReadSerializer(BaseSerializer):
    points = EstimatePointSerializer(read_only=True, many=True)

    class Meta:
        model = Estimate
        fields = "__all__"
        read_only_fields = ["points", "name", "description"]


class WorkspaceEstimateSerializer(BaseSerializer):
    points = EstimatePointSerializer(read_only=True, many=True)

    class Meta:
        model = Estimate
        fields = "__all__"
        read_only_fields = ["points", "name", "description"]
