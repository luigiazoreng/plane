# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import models
from django.conf import settings
from .base import BaseModel


class AIAgentRun(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="ai_agent_runs")
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="ai_agent_runs", null=True, blank=True)
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="ai_runs")
    mode = models.CharField(max_length=20) # 'ask' or 'build'
    provider = models.CharField(max_length=50) # 'openai', 'anthropic', etc.
    llm_model = models.CharField(max_length=50)
    status = models.CharField(max_length=20) # 'running', 'completed', 'failed', 'awaiting_approval'
    input_text = models.TextField()
    output_text = models.TextField(blank=True, null=True)
    context_snapshot = models.JSONField(default=dict)
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "AI Agent Run"
        verbose_name_plural = "AI Agent Runs"
        db_table = "ai_agent_runs"
        app_label = "db"


class AIAgentAction(BaseModel):
    run = models.ForeignKey(AIAgentRun, on_delete=models.CASCADE, related_name="actions")
    action_type = models.CharField(max_length=100) # e.g. 'create_work_item'
    target_entity_type = models.CharField(max_length=50) # e.g. 'issue'
    target_entity_id = models.UUIDField(null=True, blank=True)
    planned_payload = models.JSONField(default=dict)
    executed_payload = models.JSONField(default=dict, null=True, blank=True)
    status = models.CharField(max_length=20) # 'planned', 'approved', 'executed', 'failed'
    error_message = models.TextField(blank=True)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="approved_ai_actions")
    executed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "AI Agent Action"
        verbose_name_plural = "AI Agent Actions"
        db_table = "ai_agent_actions"
        app_label = "db"


class AIAgentConversation(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="ai_conversations")
    # created_by is inherited from BaseModel -> AuditModel -> UserAuditModel
    title = models.CharField(max_length=255)
    context_type = models.CharField(max_length=50, null=True, blank=True)
    context_entity_id = models.UUIDField(null=True, blank=True)

    class Meta:
        verbose_name = "AI Agent Conversation"
        verbose_name_plural = "AI Agent Conversations"
        db_table = "ai_agent_conversations"
        app_label = "db"
