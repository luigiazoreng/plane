# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers
from plane.app.permissions import ROLE
from plane.app.serializers.base import BaseSerializer
from plane.app.serializers.user import UserLiteSerializer
from plane.db.models import (
    AIAgentAction,
    AIAgentConversation,
    AIAgentRun,
    ProjectMember,
    WorkspaceMember,
)


class AIAgentActionSerializer(BaseSerializer):
    approved_by_detail = UserLiteSerializer(source="approved_by", read_only=True)

    class Meta:
        model = AIAgentAction
        fields = [
            "id",
            "run",
            "action_type",
            "target_entity_type",
            "target_entity_id",
            "planned_payload",
            "executed_payload",
            "status",
            "error_message",
            "approved_by",
            "approved_by_detail",
            "executed_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "run",
            "executed_payload",
            "executed_at",
            "created_at",
            "updated_at",
        ]


class AIAgentRunSerializer(BaseSerializer):
    actions = AIAgentActionSerializer(many=True, read_only=True)
    requested_by_detail = UserLiteSerializer(source="requested_by", read_only=True)

    class Meta:
        model = AIAgentRun
        fields = [
            "id",
            "workspace",
            "project",
            "requested_by",
            "requested_by_detail",
            "mode",
            "provider",
            "llm_model",
            "status",
            "input_text",
            "output_text",
            "context_snapshot",
            "started_at",
            "completed_at",
            "actions",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "workspace",
            "requested_by",
            "started_at",
            "completed_at",
            "created_at",
            "updated_at",
        ]


class AIAgentRunCreateSerializer(BaseSerializer):
    class Meta:
        model = AIAgentRun
        fields = [
            "project",
            "mode",
            "provider",
            "llm_model",
            "input_text",
            "context_snapshot",
        ]

    def validate(self, data):
        workspace = self.context.get("workspace")
        request = self.context.get("request")
        project = data.get("project")

        if project:
            if workspace and project.workspace_id != workspace.id:
                raise serializers.ValidationError({"project": "Project does not belong to the specified workspace."})

            if request and request.user and not request.user.is_anonymous:
                is_workspace_admin = WorkspaceMember.objects.filter(
                    workspace=workspace,
                    member=request.user,
                    role=ROLE.ADMIN.value,
                    is_active=True,
                ).exists()

                if not is_workspace_admin:
                    is_project_member = ProjectMember.objects.filter(
                        workspace=workspace,
                        project=project,
                        member=request.user,
                        is_active=True,
                    ).exists()
                    if not is_project_member:
                        raise serializers.ValidationError({"project": "User does not have access to this project."})

        return data


class AIAgentConversationSerializer(BaseSerializer):
    created_by_detail = UserLiteSerializer(source="created_by", read_only=True)

    class Meta:
        model = AIAgentConversation
        fields = [
            "id",
            "workspace",
            "title",
            "context_type",
            "context_entity_id",
            "created_by",
            "created_by_detail",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "workspace",
            "created_by",
            "created_at",
            "updated_at",
        ]
