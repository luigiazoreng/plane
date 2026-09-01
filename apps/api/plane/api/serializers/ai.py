# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers
from plane.api.serializers.base import BaseSerializer
from plane.db.models import AIAgentRun, AIAgentAction, AIAgentConversation
from plane.api.serializers.user import UserLiteSerializer


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


class AIAgentRunCreateSerializer(serializers.ModelSerializer):
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
