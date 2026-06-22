# Third party imports
from rest_framework import serializers

# Module imports
from plane.db.models import (
    HelpdeskCustomer,
    HelpdeskForm,
    HelpdeskFormField,
    HelpdeskPortal,
    HelpdeskRequest,
    HelpdeskRequestAssignee,
    HelpdeskRequestComment,
    HelpdeskRequestIntakeIssue,
    HelpdeskRequestIssue,
    HelpdeskStatus,
)
from plane.app.serializers.base import BaseSerializer
from plane.app.helpdesk.auto_assignment import normalize_helpdesk_auto_assignment_config

READ_ONLY_BASE = ["workspace", "created_at", "updated_at", "created_by", "updated_by", "deleted_at"]


class HelpdeskCustomerSerializer(BaseSerializer):
    class Meta:
        model = HelpdeskCustomer
        fields = "__all__"
        read_only_fields = READ_ONLY_BASE
        extra_kwargs = {
            "password": {"write_only": True}
        }


class HelpdeskStatusSerializer(BaseSerializer):
    class Meta:
        model = HelpdeskStatus
        fields = "__all__"
        read_only_fields = READ_ONLY_BASE


class HelpdeskPortalSerializer(BaseSerializer):
    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = getattr(self, "instance", None)

        auto_assignment_enabled = attrs.get(
            "auto_assignment_enabled",
            getattr(instance, "auto_assignment_enabled", False),
        )
        auto_assignment_type = attrs.get(
            "auto_assignment_type",
            getattr(instance, "auto_assignment_type", HelpdeskPortal.AutoAssignmentType.LOAD_BALANCE),
        )
        config = normalize_helpdesk_auto_assignment_config(
            attrs.get("auto_assignment_config", getattr(instance, "auto_assignment_config", {}))
        )

        if auto_assignment_enabled and not auto_assignment_type:
            raise serializers.ValidationError({"auto_assignment_type": "Assignment type is required."})

        attrs["auto_assignment_type"] = auto_assignment_type or HelpdeskPortal.AutoAssignmentType.LOAD_BALANCE
        attrs["auto_assignment_config"] = normalize_helpdesk_auto_assignment_config(
            config,
            attrs["auto_assignment_type"],
        )

        for field_name in ("sla_first_response_hours", "sla_resolution_hours"):
            value = attrs.get(field_name, getattr(instance, field_name, None))
            if value is not None and int(value) <= 0:
                raise serializers.ValidationError({field_name: "SLA must be a positive integer or null."})
        return attrs

    class Meta:
        model = HelpdeskPortal
        fields = "__all__"
        read_only_fields = READ_ONLY_BASE


class HelpdeskFormFieldSerializer(BaseSerializer):
    class Meta:
        model = HelpdeskFormField
        fields = "__all__"
        read_only_fields = READ_ONLY_BASE

    def validate(self, attrs):
        instance = getattr(self, "instance", None)
        form = attrs.get("form") or getattr(instance, "form", None)
        field_type = attrs.get("field_type") or getattr(instance, "field_type", None)
        key = attrs.get("key") or getattr(instance, "key", None)
        options = attrs.get("options", getattr(instance, "options", []))
        is_system = attrs.get("is_system", getattr(instance, "is_system", False))

        if form and key:
            existing = HelpdeskFormField.objects.filter(form=form, key=key, deleted_at__isnull=True)
            if instance:
                existing = existing.exclude(id=instance.id)
            if existing.exists():
                raise serializers.ValidationError({"key": "Field keys must be unique per form."})

        if field_type in ("select", "cascade_select"):
            if not isinstance(options, list):
                raise serializers.ValidationError({"options": "Options must be a list."})
            normalized = []
            for option in options:
                if isinstance(option, str) and option.strip():
                    label = option.strip()
                    normalized.append({"label": label, "value": label})
                elif isinstance(option, dict) and option.get("label"):
                    label = str(option["label"]).strip()
                    # value always equals label — ignore any sent value
                    normalized.append({"label": label, "value": label})
                else:
                    raise serializers.ValidationError({"options": "Each option must have a label."})
            attrs["options"] = normalized

            if field_type == "cascade_select":
                # Validate parent_mapping: keys and values must be strings/lists
                parent_mapping = attrs.get("parent_mapping", getattr(instance, "parent_mapping", {}))
                if not isinstance(parent_mapping, dict):
                    raise serializers.ValidationError({"parent_mapping": "Must be an object."})
                clean_mapping = {}
                for k, v in parent_mapping.items():
                    if not isinstance(v, list):
                        raise serializers.ValidationError({"parent_mapping": f"Values must be lists (got {type(v)} for key '{k}')."})
                    clean_mapping[str(k)] = [str(i) for i in v]
                attrs["parent_mapping"] = clean_mapping

        elif "options" in attrs and not isinstance(options, list):
            raise serializers.ValidationError({"options": "Options must be a list."})

        if is_system:
            if field_type == "system_title":
                attrs["key"] = "title"
                attrs["required"] = True
            elif field_type == "system_description":
                attrs["key"] = "description"
                attrs["required"] = True

        return attrs


class HelpdeskFormSerializer(BaseSerializer):
    fields_detail = HelpdeskFormFieldSerializer(source="fields", many=True, read_only=True)

    class Meta:
        model = HelpdeskForm
        fields = "__all__"
        read_only_fields = READ_ONLY_BASE + ["ticket_id_counter"]


class HelpdeskRequestSerializer(BaseSerializer):
    status_detail = HelpdeskStatusSerializer(source="status", read_only=True)
    form_detail = HelpdeskFormSerializer(source="form", read_only=True)
    # `assignees` is an M2M with a custom through model, so DRF treats it as
    # read-only. Declare it explicitly to make it writable and sync the through
    # table manually in create()/update().
    assignees = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        allow_empty=True,
        write_only=True,
    )

    class Meta:
        model = HelpdeskRequest
        fields = "__all__"
        read_only_fields = READ_ONLY_BASE + ["portal", "customer", "display_id"]

    def _sync_assignees(self, instance, assignee_ids):
        # hard delete so soft-deleted rows don't linger in the M2M relation
        HelpdeskRequestAssignee.objects.filter(request=instance).delete(soft=False)
        unique_ids = list(dict.fromkeys(str(uid) for uid in assignee_ids))
        if unique_ids:
            HelpdeskRequestAssignee.objects.bulk_create(
                [
                    HelpdeskRequestAssignee(
                        request=instance,
                        assignee_id=assignee_id,
                        workspace_id=instance.workspace_id,
                    )
                    for assignee_id in unique_ids
                ],
                batch_size=10,
                ignore_conflicts=True,
            )

    def create(self, validated_data):
        assignees = validated_data.pop("assignees", None)
        instance = super().create(validated_data)
        if assignees is not None:
            self._sync_assignees(instance, assignees)
        return instance

    def update(self, instance, validated_data):
        assignees = validated_data.pop("assignees", None)
        instance = super().update(instance, validated_data)
        if assignees is not None:
            self._sync_assignees(instance, assignees)
        return instance

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # serialize assignees as a list of user IDs, reading active through-rows
        # only (the M2M relation does not filter soft-deleted links)
        data["assignees"] = [
            str(uid)
            for uid in HelpdeskRequestAssignee.objects.filter(
                request=instance, deleted_at__isnull=True
            ).values_list("assignee_id", flat=True)
        ]
        return data


class HelpdeskRequestCommentSerializer(BaseSerializer):
    class Meta:
        model = HelpdeskRequestComment
        fields = "__all__"
        read_only_fields = READ_ONLY_BASE + ["request", "actor", "customer"]


class HelpdeskRequestIssueSerializer(BaseSerializer):
    class Meta:
        model = HelpdeskRequestIssue
        fields = "__all__"
        read_only_fields = READ_ONLY_BASE


class HelpdeskRequestIntakeIssueSerializer(BaseSerializer):
    intake_status = serializers.SerializerMethodField()
    issue_id = serializers.SerializerMethodField()
    project_identifier = serializers.SerializerMethodField()

    def get_intake_status(self, obj):
        try:
            return obj.intake_issue.status
        except Exception:
            return None

    def get_issue_id(self, obj):
        try:
            return str(obj.intake_issue.issue_id)
        except Exception:
            return None

    def get_project_identifier(self, obj):
        try:
            return obj.forwarded_to_project.identifier
        except Exception:
            return None

    class Meta:
        model = HelpdeskRequestIntakeIssue
        fields = "__all__"
        read_only_fields = READ_ONLY_BASE + ["request", "intake_issue", "forwarded_to_project", "created_by"]
