# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from plane.app.helpdesk.sla import sla_snapshot
from plane.db.models import (
    HelpdeskRequest,
    HelpdeskRequestRecurrence,
    HelpdeskSLAPolicy,
    HelpdeskStatus,
)

from .base import BaseSerializer

# Fields the public API is willing to promise. Unlike the app serializer this
# does not use ``__all__``: the external contract should not silently grow a
# field every time an internal one is added to the model.
REQUEST_PUBLIC_FIELDS = [
    "id",
    "display_id",
    "title",
    "description",
    "priority",
    "status",
    "source",
    "portal",
    "form",
    "customer",
    "contact_email",
    "team",
    "created_at",
    "updated_at",
    "first_responded_at",
    "resolved_at",
    "archived_at",
    "snoozed_until",
    "start_date",
    "target_date",
    "sla_first_response_due_at",
    "sla_resolution_due_at",
    "sla_paused_at",
    "external_source",
    "external_id",
]


class HelpdeskStatusAPISerializer(BaseSerializer):
    class Meta:
        model = HelpdeskStatus
        fields = ["id", "name", "color", "sequence", "is_default", "is_terminal", "pauses_sla"]
        read_only_fields = fields


class HelpdeskSLAPolicyAPISerializer(BaseSerializer):
    class Meta:
        model = HelpdeskSLAPolicy
        fields = [
            "id",
            "portal",
            "priority",
            "first_response_hours",
            "resolution_hours",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, data):
        instance = self.instance
        first = data.get("first_response_hours", getattr(instance, "first_response_hours", None))
        resolution = data.get("resolution_hours", getattr(instance, "resolution_hours", None))
        if first is None and resolution is None:
            raise serializers.ValidationError(
                "Set at least one of first_response_hours or resolution_hours, "
                "or delete the policy to fall back to the portal defaults."
            )
        for name, value in (("first_response_hours", first), ("resolution_hours", resolution)):
            if value is not None and value <= 0:
                raise serializers.ValidationError({name: "Must be greater than zero."})
        if first is not None and resolution is not None and first > resolution:
            raise serializers.ValidationError(
                "first_response_hours cannot exceed resolution_hours."
            )
        return data


class HelpdeskRequestAPISerializer(BaseSerializer):
    """A helpdesk ticket, with its live SLA state.

    ``sla`` is computed per response rather than stored, so a ticket that is
    paused right now reports the deadline it will actually resume with instead
    of a stale one.
    """

    sla = serializers.SerializerMethodField()
    is_recurrent = serializers.BooleanField(read_only=True, default=False)
    recurrence_count = serializers.IntegerField(read_only=True, default=0)

    def get_sla(self, obj):
        return sla_snapshot(obj)

    class Meta:
        model = HelpdeskRequest
        fields = REQUEST_PUBLIC_FIELDS + ["sla", "is_recurrent", "recurrence_count"]
        read_only_fields = [
            "id",
            "display_id",
            "created_at",
            "updated_at",
            "first_responded_at",
            "resolved_at",
            "archived_at",
            "customer",
            "source",
            # Derived from the SLA policy of the ticket's priority. Writable
            # deadlines would let any API key holder move their own SLA.
            "sla_first_response_due_at",
            "sla_resolution_due_at",
            "sla_paused_at",
        ]


class HelpdeskRequestLiteAPISerializer(BaseSerializer):
    """Just enough of a ticket to identify it inside a recurrence link."""

    class Meta:
        model = HelpdeskRequest
        fields = ["id", "display_id", "title", "priority", "status", "created_at", "resolved_at"]
        read_only_fields = fields


class HelpdeskRequestRecurrenceAPISerializer(BaseSerializer):
    related_request_detail = HelpdeskRequestLiteAPISerializer(source="related_request", read_only=True)

    class Meta:
        model = HelpdeskRequestRecurrence
        fields = [
            "id",
            "request",
            "related_request",
            "related_request_detail",
            "match_type",
            "score",
            "created_at",
        ]
        read_only_fields = fields
