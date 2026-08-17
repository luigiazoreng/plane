# Python imports
from datetime import timedelta

# Django imports
# pyrefly: ignore [missing-import]
from django.conf import settings

# Third party imports
from rest_framework import serializers

# Module imports
from plane.db.models import (
    HelpdeskCustomer,
    HelpdeskForm,
    HelpdeskFormField,
    HelpdeskMember,
    HelpdeskPortal,
    HelpdeskRequest,
    HelpdeskRequestActivity,
    HelpdeskRequestAssignee,
    HelpdeskRequestComment,
    HelpdeskRequestIntakeIssue,
    HelpdeskRequestIssue,
    HelpdeskStatus,
    HelpdeskTeam,
    HelpdeskMacro,
    HelpdeskIMAPSyncLog,
    Label,
)
from plane.app.serializers.base import BaseSerializer
from plane.app.serializers.user import UserLiteSerializer
from plane.app.helpdesk.attachments import COMMENT_ENTITY, REQUEST_ENTITY, assets_for
from plane.app.helpdesk.auto_assignment import normalize_helpdesk_auto_assignment_config
from plane.utils.content_validator import validate_html_content

READ_ONLY_BASE = ["workspace", "created_at", "updated_at", "created_by", "updated_by", "deleted_at"]


class HelpdeskCustomerSerializer(BaseSerializer):
    class Meta:
        model = HelpdeskCustomer
        fields = "__all__"
        read_only_fields = READ_ONLY_BASE
        extra_kwargs = {
            "password": {"write_only": True}
        }


class HelpdeskCustomerAdminSerializer(BaseSerializer):
    class Meta:
        model = HelpdeskCustomer
        fields = ["id", "workspace", "name", "email", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "workspace", "created_at", "updated_at"]


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

        # Django's SMTP backend raises ValueError when both are set, which would
        # turn every outbound email of this portal into FAILED.
        smtp_use_tls = attrs.get("smtp_use_tls", getattr(instance, "smtp_use_tls", False))
        smtp_use_ssl = attrs.get("smtp_use_ssl", getattr(instance, "smtp_use_ssl", False))
        if smtp_use_tls and smtp_use_ssl:
            raise serializers.ValidationError(
                {
                    "smtp_use_tls": "TLS and SSL are mutually exclusive; enable only one.",
                    "smtp_use_ssl": "TLS and SSL are mutually exclusive; enable only one.",
                }
            )

        imap_use_tls = attrs.get("imap_use_tls", getattr(instance, "imap_use_tls", False))
        imap_use_ssl = attrs.get("imap_use_ssl", getattr(instance, "imap_use_ssl", False))
        if imap_use_tls and imap_use_ssl:
            raise serializers.ValidationError(
                {
                    "imap_use_tls": "TLS and SSL are mutually exclusive; enable only one.",
                    "imap_use_ssl": "TLS and SSL are mutually exclusive; enable only one.",
                }
            )

        max_attachment_size = attrs.get(
            "max_attachment_size", getattr(instance, "max_attachment_size", None)
        )
        if max_attachment_size is not None:
            if int(max_attachment_size) <= 0:
                raise serializers.ValidationError(
                    {"max_attachment_size": "Attachment size must be a positive number of bytes or null."}
                )
            # Reject rather than silently clamp: an admin who sets 50MB on a
            # 5MB instance would otherwise see the value saved and believe it
            # took effect, while the proxy kept rejecting the uploads.
            if int(max_attachment_size) > settings.FILE_SIZE_LIMIT:
                raise serializers.ValidationError(
                    {
                        "max_attachment_size": (
                            "Cannot exceed the instance limit of "
                            f"{settings.FILE_SIZE_LIMIT} bytes."
                        )
                    }
                )
        return attrs

    class Meta:
        model = HelpdeskPortal
        fields = "__all__"
        read_only_fields = READ_ONLY_BASE
        extra_kwargs = {
            "smtp_password": {"write_only": True},
            "imap_password": {"write_only": True},
        }


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


class HelpdeskFormLiteSerializer(BaseSerializer):
    """Minimal form representation used in list-level ticket serialization (no fields_detail)."""

    class Meta:
        model = HelpdeskForm
        fields = ["id", "name", "slug", "description", "visibility", "is_active", "ticket_id_pattern", "portal"]
        read_only_fields = fields


class HelpdeskFormSerializer(BaseSerializer):
    fields_detail = HelpdeskFormFieldSerializer(source="fields", many=True, read_only=True)

    class Meta:
        model = HelpdeskForm
        fields = "__all__"
        read_only_fields = READ_ONLY_BASE + ["ticket_id_counter"]


class HelpdeskCustomerLiteSerializer(BaseSerializer):
    """Customer identity for display alongside a request or comment.

    Deliberately excludes `password` and `is_active`.
    """

    class Meta:
        model = HelpdeskCustomer
        fields = ["id", "name", "email"]
        read_only_fields = fields


class HelpdeskRequestSerializer(BaseSerializer):
    created_by_detail = UserLiteSerializer(source="created_by", read_only=True)
    customer_detail = HelpdeskCustomerLiteSerializer(source="customer", read_only=True)
    status_detail = HelpdeskStatusSerializer(source="status", read_only=True)
    # Use the lite serializer (no fields_detail) — avoids serializing all form
    # fields for every ticket in the list response.
    form_detail = HelpdeskFormLiteSerializer(source="form", read_only=True)
    team_detail = serializers.SerializerMethodField()
    is_unread = serializers.BooleanField(read_only=True, default=False)
    is_bookmarked = serializers.BooleanField(read_only=True, default=False)
    # `assignees` is an M2M with a custom through model, so DRF treats it as
    # read-only. Declare it explicitly to make it writable and sync the through
    # table manually in create()/update().
    assignees = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        allow_empty=True,
        write_only=True,
    )
    # `labels` is a plain M2M (no custom through) — DRF can handle it, but
    # we declare it as a write-only list to match the assignees pattern and
    # keep the read representation as label_detail (with name + color).
    labels = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        allow_empty=True,
        write_only=True,
    )
    label_detail = serializers.SerializerMethodField()
    # Files submitted with the original form, as opposed to those on replies.
    attachments = serializers.SerializerMethodField()
    # Closed pause time only (total_paused_duration); does not include an
    # in-progress pause -- the frontend adds `now() - sla_paused_at` itself so
    # the SLA countdown can keep ticking live between fetches.
    total_paused_seconds = serializers.SerializerMethodField()

    def get_attachments(self, obj):
        grouped = self.context.get("request_attachments_by_entity")
        if grouped is not None:
            assets = grouped.get(str(obj.id), [])
        else:
            assets = assets_for(REQUEST_ENTITY, [obj.id]).get(str(obj.id), [])
        return HelpdeskAttachmentSerializer(assets, many=True, context=self.context).data

    def get_total_paused_seconds(self, obj):
        return int((obj.total_paused_duration or timedelta()).total_seconds())

    class Meta:
        model = HelpdeskRequest
        fields = "__all__"
        read_only_fields = READ_ONLY_BASE + [
            "portal",
            "display_id",
            "archived_at",
            "sla_paused_at",
            "total_paused_duration",
        ]

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

    def validate(self, data):
        start = data.get("start_date")
        target = data.get("target_date")
        if start and target and start > target:
            raise serializers.ValidationError("Start date cannot exceed target date.")

        # description now carries real HTML from the rich text editor (it used
        # to be plain text from a <textarea>) -- sanitize it the same way
        # IssueSerializer sanitizes description_html.
        if data.get("description"):
            is_valid, error_msg, sanitized_html = validate_html_content(data["description"])
            if not is_valid:
                raise serializers.ValidationError({"description": error_msg})
            if sanitized_html is not None:
                data["description"] = sanitized_html

        return data

    def create(self, validated_data):
        assignees = validated_data.pop("assignees", None)
        label_ids = validated_data.pop("labels", None)
        customer = validated_data.get("customer")
        if customer and not validated_data.get("contact_email"):
            validated_data["contact_email"] = customer.email
        instance = super().create(validated_data)
        if assignees is not None:
            self._sync_assignees(instance, assignees)
        if label_ids is not None:
            self._sync_labels(instance, label_ids)
        return instance

    def update(self, instance, validated_data):
        assignees = validated_data.pop("assignees", None)
        label_ids = validated_data.pop("labels", None)
        if "customer" in validated_data:
            customer = validated_data["customer"]
            if customer and not validated_data.get("contact_email"):
                validated_data["contact_email"] = customer.email
            elif not customer and "contact_email" not in validated_data:
                validated_data["contact_email"] = ""
        instance = super().update(instance, validated_data)
        if assignees is not None:
            self._sync_assignees(instance, assignees)
            if hasattr(instance, "_prefetched_assignees"):
                delattr(instance, "_prefetched_assignees")
        if label_ids is not None:
            self._sync_labels(instance, label_ids)
            if hasattr(instance, "_prefetched_labels"):
                delattr(instance, "_prefetched_labels")
        return instance

    def get_label_detail(self, obj):
        """Read-only: name + color for each label, used by the frontend to
        render coloured pills without a separate fetch."""
        prefetched = getattr(obj, "_prefetched_labels", None)
        if prefetched is not None:
            labels = prefetched
        else:
            labels = obj.labels.all()
        return [{"id": str(l.id), "name": l.name, "color": l.color} for l in labels]

    def get_team_detail(self, obj):
        if not obj.team_id:
            return None
        team = getattr(obj, "team", None)
        if team and team.id == obj.team_id:
            return {"id": str(team.id), "name": team.name, "color": team.color}
        team_obj = HelpdeskTeam.objects.filter(id=obj.team_id).first()
        if team_obj:
            return {"id": str(team_obj.id), "name": team_obj.name, "color": team_obj.color}
        return None

    def _sync_labels(self, instance, label_ids):
        """Replace all labels on the request with the given UUIDs.
        Validates that all labels belong to the same workspace."""
        unique_ids = list(dict.fromkeys(str(uid) for uid in label_ids))
        if unique_ids:
            valid = Label.objects.filter(
                id__in=unique_ids, workspace_id=instance.workspace_id
            ).values_list("id", flat=True)
            instance.labels.set(valid)
        else:
            instance.labels.clear()

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Use the prefetched through-rows when available (set by get_queryset via
        # Prefetch(to_attr="_prefetched_assignees")); fall back to a live query
        # for single-object retrieves (retrieve, create, update).
        prefetched = getattr(instance, "_prefetched_assignees", None)
        if prefetched is not None:
            data["assignees"] = [str(a.assignee_id) for a in prefetched]
        else:
            data["assignees"] = [
                str(uid)
                for uid in HelpdeskRequestAssignee.objects.filter(
                    request=instance, deleted_at__isnull=True
                ).values_list("assignee_id", flat=True)
            ]
        return data


class HelpdeskAttachmentSerializer(serializers.Serializer):
    """Read-only view of a FileAsset attached to a helpdesk comment or request.

    Not a ModelSerializer: the useful fields live inside the `attributes` JSON
    blob, and the download URL depends on which surface is asking. Agents get
    the workspace-scoped route, portal customers the public one -- the caller
    signals which by putting `public_slug` in the serializer context.

    The URL is built here rather than read from FileAsset.asset_url because
    that property dereferences self.workspace, costing a query per attachment.
    """

    id = serializers.UUIDField(read_only=True)
    name = serializers.SerializerMethodField()
    type = serializers.SerializerMethodField()
    size = serializers.FloatField(read_only=True)
    asset_url = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(read_only=True)

    def get_name(self, obj):
        return (obj.attributes or {}).get("name", "")

    def get_type(self, obj):
        return (obj.attributes or {}).get("type", "")

    def get_asset_url(self, obj):
        public_slug = self.context.get("public_slug")
        if public_slug:
            return f"/api/helpdesk/public/portals/{public_slug}/assets/{obj.id}/"
        workspace_slug = self.context.get("workspace_slug")
        if workspace_slug:
            return f"/api/workspaces/{workspace_slug}/helpdesk/assets/{obj.id}/"
        return None


class HelpdeskCustomerLiteSerializer(BaseSerializer):
    """Customer identity for display alongside a comment.

    Deliberately excludes `password` and `is_active` -- this is serialised into
    the agent conversation view and, through PublicHelpdeskCommentEndpoint, into
    the customer-facing portal as well.
    """

    class Meta:
        model = HelpdeskCustomer
        fields = ["id", "name", "email"]
        read_only_fields = fields


class HelpdeskRequestCommentSerializer(BaseSerializer):
    # Who wrote the comment, for avatar and name rendering. UserLiteSerializer
    # carries no email, so exposing it on the public portal endpoint does not
    # leak agent addresses.
    actor_detail = UserLiteSerializer(read_only=True, source="actor")
    customer_detail = HelpdeskCustomerLiteSerializer(read_only=True, source="customer")
    attachments = serializers.SerializerMethodField()

    def get_attachments(self, obj):
        # List views pre-load every comment's assets into the context in one
        # query; the per-instance fallback only runs for single-object reads.
        grouped = self.context.get("attachments_by_entity")
        if grouped is not None:
            assets = grouped.get(str(obj.id), [])
        else:
            assets = assets_for(COMMENT_ENTITY, [obj.id]).get(str(obj.id), [])
        return HelpdeskAttachmentSerializer(assets, many=True, context=self.context).data

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = getattr(self, "instance", None)

        # Reject the forbidden pair only when the payload is what introduces or
        # reaffirms it. A naive fallback to the instance for both fields would
        # make every legacy row -- rows that carry the RC-2 bug itself -- fail
        # any PATCH, including one that only edits `content`, leaving them
        # permanently uneditable. Those rows are normalised by migration 0155.
        payload_touches_pair = "is_internal" in attrs or "delivery_channels" in attrs
        if instance is not None and not payload_touches_pair:
            return attrs

        is_internal = attrs.get("is_internal", getattr(instance, "is_internal", False))
        delivery_channels = attrs.get(
            "delivery_channels", getattr(instance, "delivery_channels", []) or []
        )

        if is_internal and "email" in delivery_channels:
            raise serializers.ValidationError(
                {
                    "is_internal": "An internal note cannot be delivered by email.",
                    "delivery_channels": "Remove 'email' to keep this note internal.",
                }
            )
        return attrs

    class Meta:
        model = HelpdeskRequestComment
        # `exclude`, not `fields = "__all__"`: this same serializer answers
        # both the Email logs (admin) and PublicHelpdeskCommentEndpoint
        # (customer-facing), so "__all__" pushes every new model field to the
        # portal automatically. `sender_verification` reaching the customer
        # would tell the attacker -- a participant of the ticket -- whether
        # his spoof was detected. The default is the safe one; exposing it
        # takes the deliberate act of using the Admin subclass below.
        exclude = ["sender_verification"]
        read_only_fields = READ_ONLY_BASE + [
            "request",
            "actor",
            "customer",
            "email_status",
            "email_sent_at",
            "email_message_id",
        ]


class HelpdeskRequestCommentAdminSerializer(HelpdeskRequestCommentSerializer):
    """Admin-only view of a comment, carrying `sender_verification`.

    Used exclusively by HelpdeskPortalEmailLogsEndpoint, which is already
    gated on the Helpdesk ADMIN role. Exposing the verdict is a deliberate
    act; the default is the safe one.
    """

    class Meta(HelpdeskRequestCommentSerializer.Meta):
        exclude = None
        fields = "__all__"


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


class HelpdeskMemberSerializer(BaseSerializer):
    member_detail = UserLiteSerializer(source="member", read_only=True)

    class Meta:
        model = HelpdeskMember
        fields = "__all__"
        read_only_fields = READ_ONLY_BASE + ["workspace"]

class HelpdeskIMAPSyncLogSerializer(BaseSerializer):
    class Meta:
        model = HelpdeskIMAPSyncLog
        fields = "__all__"
        read_only_fields = READ_ONLY_BASE + ["workspace", "portal"]


class HelpdeskRequestActivitySerializer(BaseSerializer):
    actor_detail = UserLiteSerializer(source="actor", read_only=True)

    class Meta:
        model = HelpdeskRequestActivity
        fields = "__all__"
        read_only_fields = READ_ONLY_BASE + ["request", "actor"]


class HelpdeskTeamSerializer(BaseSerializer):
    members_detail = UserLiteSerializer(source="members", many=True, read_only=True)
    members = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        allow_empty=True,
        write_only=True,
    )

    class Meta:
        model = HelpdeskTeam
        fields = "__all__"
        read_only_fields = READ_ONLY_BASE + ["workspace"]

    def create(self, validated_data):
        members = validated_data.pop("members", None)
        instance = super().create(validated_data)
        if members is not None:
            instance.members.set(members)
        return instance

    def update(self, instance, validated_data):
        members = validated_data.pop("members", None)
        instance = super().update(instance, validated_data)
        if members is not None:
            instance.members.set(members)
        return instance


class HelpdeskMacroSerializer(BaseSerializer):
    class Meta:
        model = HelpdeskMacro
        fields = "__all__"
        read_only_fields = READ_ONLY_BASE + ["workspace"]



