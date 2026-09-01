# Third party imports
from rest_framework import serializers

# Module imports
from plane.db.models import KpiConfig, KpiIssueAttribute, WorkspaceKpiAccess
from plane.app.serializers.base import BaseSerializer
from plane.app.serializers.user import UserLiteSerializer

READ_ONLY_BASE = ["workspace", "created_at", "updated_at", "created_by", "updated_by", "deleted_at"]


class KpiConfigSerializer(BaseSerializer):
    class Meta:
        model = KpiConfig
        fields = "__all__"
        read_only_fields = READ_ONLY_BASE + ["project"]

    def validate_k(self, value):
        if value is None or value < 0 or value > 1:
            raise serializers.ValidationError("k must be between 0 and 1.")
        return value

    def validate_tables(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("tables must be an object.")
        priority = value.get("priority")
        if priority is not None:
            if not isinstance(priority, dict):
                raise serializers.ValidationError("priority must be an object.")
            for key, row in priority.items():
                if not isinstance(row, dict) or "points" not in row or "b" not in row:
                    raise serializers.ValidationError(
                        f"priority['{key}'] must contain 'points' and 'b'."
                    )
        return value

    # Which estimate backs Difficulty/Repetitive is no longer a KpiConfig field
    # (no more difficulty_estimate/repetitive_estimate) -- it's the project's
    # EstimateProperty rows tagged kpi_role (plane.db.models.estimate), managed
    # via EstimatePropertyKpiRoleEndpoint instead. tables.difficulty/
    # tables.repetitive here are still keyed by EstimatePoint id (see migration
    # 0145_kpi_difficulty_rekey_by_point_id).


class KpiIssueAttributeSerializer(BaseSerializer):
    class Meta:
        model = KpiIssueAttribute
        fields = [
            "id",
            "issue",
            "repetitive",
            "type_override",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "issue", "created_at", "updated_at"]


class WorkspaceKpiAccessSerializer(BaseSerializer):
    """A single grant to the workspace KPI panels.

    ``member_detail`` is expanded so the settings screen can render the person
    without a second round trip, matching HelpdeskMemberSerializer.
    """

    member_detail = UserLiteSerializer(source="member", read_only=True)

    class Meta:
        model = WorkspaceKpiAccess
        fields = "__all__"
        read_only_fields = READ_ONLY_BASE + ["workspace"]
