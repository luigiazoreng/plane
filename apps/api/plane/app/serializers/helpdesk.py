# Third party imports
from rest_framework import serializers

# Module imports
from plane.db.models import (
    HelpdeskCustomer,
    HelpdeskPortal,
    HelpdeskRequest,
    HelpdeskRequestComment,
    HelpdeskRequestIntakeIssue,
    HelpdeskRequestIssue,
)
from plane.app.serializers.base import BaseSerializer

READ_ONLY_BASE = ["workspace", "created_at", "updated_at", "created_by", "updated_by", "deleted_at"]


class HelpdeskCustomerSerializer(BaseSerializer):
    class Meta:
        model = HelpdeskCustomer
        fields = "__all__"
        read_only_fields = READ_ONLY_BASE
        extra_kwargs = {
            "password": {"write_only": True}
        }


class HelpdeskPortalSerializer(BaseSerializer):
    class Meta:
        model = HelpdeskPortal
        fields = "__all__"
        read_only_fields = READ_ONLY_BASE


class HelpdeskRequestSerializer(BaseSerializer):
    class Meta:
        model = HelpdeskRequest
        fields = "__all__"
        read_only_fields = READ_ONLY_BASE + ["portal", "customer"]


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
