# Third party imports
from rest_framework import serializers

# Module imports
from plane.db.models import KpiConfig, KpiIssueAttribute
from plane.app.serializers.base import BaseSerializer

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


class KpiIssueAttributeSerializer(BaseSerializer):
    class Meta:
        model = KpiIssueAttribute
        fields = [
            "id",
            "issue",
            "difficulty",
            "repetitive",
            "importance",
            "type_override",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "issue", "created_at", "updated_at"]
