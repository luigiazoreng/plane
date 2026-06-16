# Third party imports
from rest_framework import serializers

# Module imports
from plane.db.models import (
    HelpdeskCustomer,
    HelpdeskPortal,
    HelpdeskRequest,
    HelpdeskRequestComment,
    HelpdeskRequestIssue,
)
from plane.app.serializers.base import BaseSerializer

class HelpdeskCustomerSerializer(BaseSerializer):
    class Meta:
        model = HelpdeskCustomer
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "deleted_at",
        ]
        extra_kwargs = {
            "password": {"write_only": True}
        }


class HelpdeskPortalSerializer(BaseSerializer):
    class Meta:
        model = HelpdeskPortal
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "deleted_at",
        ]


class HelpdeskRequestSerializer(BaseSerializer):
    class Meta:
        model = HelpdeskRequest
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "portal",
            "customer",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "deleted_at",
        ]


class HelpdeskRequestCommentSerializer(BaseSerializer):
    class Meta:
        model = HelpdeskRequestComment
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "request",
            "actor",
            "customer",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "deleted_at",
        ]


class HelpdeskRequestIssueSerializer(BaseSerializer):
    class Meta:
        model = HelpdeskRequestIssue
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "deleted_at",
        ]
