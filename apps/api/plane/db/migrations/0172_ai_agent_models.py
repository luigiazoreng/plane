# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import uuid
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0171_workspace_kpi_access"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="AIAgentRun",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                ("id", models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ("mode", models.CharField(choices=[("ask", "Ask"), ("build", "Build")], default="ask", max_length=20)),
                ("provider", models.CharField(choices=[("openai", "OpenAI"), ("anthropic", "Anthropic"), ("gemini", "Gemini"), ("deepseek", "DeepSeek"), ("mock", "Mock")], default="openai", max_length=50)),
                ("llm_model", models.CharField(blank=True, default="", max_length=50)),
                ("status", models.CharField(choices=[("running", "Running"), ("completed", "Completed"), ("failed", "Failed"), ("awaiting_approval", "Awaiting Approval")], default="running", max_length=20)),
                ("input_text", models.TextField()),
                ("output_text", models.TextField(blank=True, null=True)),
                ("context_snapshot", models.JSONField(default=dict)),
                ("started_at", models.DateTimeField(auto_now_add=True)),
                ("completed_at", models.DateTimeField(blank=True, null=True)),
                ("created_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_created_by", to=settings.AUTH_USER_MODEL, verbose_name="Created By")),
                ("project", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="ai_agent_runs", to="db.project")),
                ("requested_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="ai_runs", to=settings.AUTH_USER_MODEL)),
                ("updated_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_updated_by", to=settings.AUTH_USER_MODEL, verbose_name="Last Modified By")),
                ("workspace", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="ai_agent_runs", to="db.workspace")),
            ],
            options={
                "verbose_name": "AI Agent Run",
                "verbose_name_plural": "AI Agent Runs",
                "db_table": "ai_agent_runs",
            },
        ),
        migrations.CreateModel(
            name="AIAgentConversation",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                ("id", models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ("title", models.CharField(max_length=255)),
                ("context_type", models.CharField(blank=True, max_length=50, null=True)),
                ("context_entity_id", models.UUIDField(blank=True, null=True)),
                ("created_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_created_by", to=settings.AUTH_USER_MODEL, verbose_name="Created By")),
                ("updated_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_updated_by", to=settings.AUTH_USER_MODEL, verbose_name="Last Modified By")),
                ("workspace", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="ai_conversations", to="db.workspace")),
            ],
            options={
                "verbose_name": "AI Agent Conversation",
                "verbose_name_plural": "AI Agent Conversations",
                "db_table": "ai_agent_conversations",
            },
        ),
        migrations.CreateModel(
            name="AIAgentAction",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                ("id", models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ("action_type", models.CharField(max_length=100)),
                ("target_entity_type", models.CharField(max_length=50)),
                ("target_entity_id", models.UUIDField(blank=True, null=True)),
                ("planned_payload", models.JSONField(default=dict)),
                ("executed_payload", models.JSONField(blank=True, default=dict, null=True)),
                ("status", models.CharField(choices=[("planned", "Planned"), ("approved", "Approved"), ("executed", "Executed"), ("failed", "Failed")], default="planned", max_length=20)),
                ("error_message", models.TextField(blank=True)),
                ("executed_at", models.DateTimeField(blank=True, null=True)),
                ("approved_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="approved_ai_actions", to=settings.AUTH_USER_MODEL)),
                ("created_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_created_by", to=settings.AUTH_USER_MODEL, verbose_name="Created By")),
                ("run", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="actions", to="db.aiagentrun")),
                ("updated_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_updated_by", to=settings.AUTH_USER_MODEL, verbose_name="Last Modified By")),
            ],
            options={
                "verbose_name": "AI Agent Action",
                "verbose_name_plural": "AI Agent Actions",
                "db_table": "ai_agent_actions",
            },
        ),
    ]
