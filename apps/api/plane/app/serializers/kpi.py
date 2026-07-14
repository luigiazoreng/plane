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

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if self.context.get("project_estimates_allowed") is False:
            errors = {
                field: "Workspace default configs cannot reference project estimates."
                for field in ("difficulty_estimate", "repetitive_estimate")
                if attrs.get(field, getattr(self.instance, field, None)) is not None
            }
            if errors:
                raise serializers.ValidationError(errors)
            return attrs

        project_id = self.context.get("project_id")
        if not project_id:
            return attrs

        tables = attrs.get("tables", getattr(self.instance, "tables", None) or {})
        errors = {}
        for field, table_name in (("difficulty_estimate", "difficulty"), ("repetitive_estimate", "repetitive")):
            estimate = attrs.get(field, getattr(self.instance, field, None))
            if estimate is None:
                continue
            if str(estimate.project_id) != str(project_id):
                errors[field] = "Estimate must belong to this project."
                continue
            # tables[table_name] is keyed by EstimatePoint id (not value) -- see
            # migration 0145_kpi_difficulty_rekey_by_point_id -- so every key must
            # be a real point under the configured estimate.
            table = (tables or {}).get(table_name)
            if table:
                valid_point_ids = {str(pk) for pk in estimate.points.values_list("id", flat=True)}
                invalid_keys = [key for key in table if key not in valid_point_ids]
                if invalid_keys:
                    errors[f"tables.{table_name}"] = (
                        f"{invalid_keys} are not valid point ids for the configured {field}."
                    )
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class KpiIssueAttributeSerializer(BaseSerializer):
    class Meta:
        model = KpiIssueAttribute
        fields = [
            "id",
            "issue",
            "repetitive",
            "difficulty_estimate_point",
            "repetitive_estimate_point",
            "type_override",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "issue", "created_at", "updated_at"]
