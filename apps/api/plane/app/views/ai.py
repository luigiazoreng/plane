# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json
import logging
from urllib.request import Request, urlopen
from urllib.error import URLError

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import (
    AIAgentConversationSerializer,
    AIAgentRunCreateSerializer,
    AIAgentRunSerializer,
)
from plane.app.views.base import BaseAPIView
from plane.db.models import (
    AIAgentAction,
    AIAgentConversation,
    AIAgentRun,
    Workspace,
    WorkspaceMember,
)

logger = logging.getLogger(__name__)


def _call_ai_service(endpoint: str, payload: dict) -> dict:
    service_url = getattr(settings, "AI_SERVICE_URL", "http://localhost:8001")
    url = f"{service_url.rstrip('/')}{endpoint}"
    secret = getattr(settings, "AI_SERVICE_SECRET", None)
    if not secret:
        import os
        secret = os.environ.get("AI_SERVICE_SECRET")

    if not secret:
        logger.error("[AI Service Error] AI_SERVICE_SECRET is not configured in settings or environment.")
        return {}

    data = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "X-AI-Service-Key": secret,
    }
    req = Request(url, data=data, headers=headers, method="POST")
    try:
        with urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except URLError as exc:
        logger.warning(f"[AI Service Call Failed] {url}: {exc}")
        return {}
    except Exception as exc:
        logger.error(f"[AI Service Error] {url}: {exc}")
        return {}


class AIAgentRunEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        is_admin = WorkspaceMember.objects.filter(
            workspace__slug=slug,
            member=request.user,
            role=ROLE.ADMIN.value,
            is_active=True,
        ).exists()

        runs = AIAgentRun.objects.filter(workspace__slug=slug)
        if not is_admin:
            runs = runs.filter(requested_by=request.user)

        runs = runs.order_by("-created_at")
        queryset = self.filter_queryset(runs)
        return self.paginate(
            request=request,
            queryset=queryset,
            on_results=lambda data: AIAgentRunSerializer(data, many=True).data,
        )

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        serializer = AIAgentRunCreateSerializer(data=request.data, context={"workspace": workspace, "request": request})
        if serializer.is_valid():
            run = serializer.save(
                workspace=workspace,
                requested_by=request.user,
                status="running",
                started_at=timezone.now(),
            )

            # Call AI Service for orchestration
            ai_payload = {
                "prompt": run.input_text,
                "workspaceSlug": slug,
                "projectId": str(run.project_id) if run.project_id else None,
                "mode": run.mode,
                "provider": run.provider,
            }

            ai_res = _call_ai_service("/api/agent/run", ai_payload)
            if not ai_res or not ai_res.get("success"):
                run.status = "failed"
                run.output_text = "Failed to communicate with AI Service or service returned error."
                run.completed_at = timezone.now()
                run.save()
                return Response(AIAgentRunSerializer(run).data, status=status.HTTP_201_CREATED)

            plan = ai_res.get("plan", {})
            run.output_text = plan.get("responseText", "")
            actions = plan.get("actions", [])
            has_pending_approval = False

            for act in actions:
                requires_approval = act.get("requiresApproval", True)
                status_str = "planned" if requires_approval else "executed"

                action_obj = AIAgentAction.objects.create(
                    run=run,
                    action_type=act.get("type", "unknown"),
                    target_entity_type=act.get("targetEntityType", "issue"),
                    planned_payload=act.get("payload", {}),
                    status=status_str,
                )

                if requires_approval:
                    has_pending_approval = True
                else:
                    # Auto-execute action immediately
                    exec_res = _call_ai_service(
                        "/api/agent/execute",
                        {
                            "workspaceSlug": slug,
                            "projectId": str(run.project_id) if run.project_id else None,
                            "actionType": action_obj.action_type,
                            "payload": action_obj.planned_payload,
                        },
                    )
                    action_obj.executed_payload = exec_res.get("result", {})
                    action_obj.executed_at = timezone.now()
                    if not exec_res.get("success"):
                        action_obj.status = "failed"
                        action_obj.error_message = exec_res.get("error", "Execution failed")
                    action_obj.save()

            if has_pending_approval:
                run.status = "awaiting_approval"
            else:
                run.status = "completed"
                run.completed_at = timezone.now()

            run.save()

            return Response(AIAgentRunSerializer(run).data, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class AIAgentRunDetailEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug, run_id):
        try:
            run = AIAgentRun.objects.get(id=run_id, workspace__slug=slug)

            is_admin = WorkspaceMember.objects.filter(
                workspace__slug=slug,
                member=request.user,
                role=ROLE.ADMIN.value,
                is_active=True,
            ).exists()

            if not is_admin and run.requested_by != request.user:
                return Response({"error": "You do not have permission to view this run."}, status=status.HTTP_403_FORBIDDEN)

            return Response(AIAgentRunSerializer(run).data, status=status.HTTP_200_OK)
        except AIAgentRun.DoesNotExist:
            return Response({"error": "AI Agent Run not found"}, status=status.HTTP_404_NOT_FOUND)


class AIAgentRunApprovalEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug, run_id):
        try:
            with transaction.atomic():
                run = AIAgentRun.objects.select_for_update().get(id=run_id, workspace__slug=slug)

                if run.status != "awaiting_approval":
                    return Response(
                        {"error": f"Run is not awaiting approval. Current status: {run.status}"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                action_choice = request.data.get("action")
                if action_choice == "approve":
                    planned_actions = list(AIAgentAction.objects.filter(run=run, status="planned"))
                    all_success = True

                    for act in planned_actions:
                        exec_res = _call_ai_service(
                            "/api/agent/execute",
                            {
                                "workspaceSlug": slug,
                                "projectId": str(run.project_id) if run.project_id else None,
                                "actionType": act.action_type,
                                "payload": act.planned_payload,
                            },
                        )

                        success = bool(exec_res.get("success"))
                        act.status = "executed" if success else "failed"
                        act.executed_payload = exec_res.get("result", {})
                        act.approved_by = request.user
                        act.executed_at = timezone.now()
                        if not success:
                            all_success = False
                            act.error_message = exec_res.get("error", "Execution failed")
                        act.save()

                    run.status = "completed" if all_success else "failed"
                    run.completed_at = timezone.now()
                    run.save()

                    return Response(
                        {"message": "Run actions executed", "run": AIAgentRunSerializer(run).data},
                        status=status.HTTP_200_OK,
                    )
                elif action_choice == "reject":
                    run.status = "rejected"
                    run.completed_at = timezone.now()
                    run.save()

                    AIAgentAction.objects.filter(run=run, status="planned").update(
                        status="failed",
                        error_message="Rejected by user",
                    )
                    return Response(
                        {"message": "Run rejected", "run": AIAgentRunSerializer(run).data},
                        status=status.HTTP_200_OK,
                    )

                return Response({"error": "Invalid action choice"}, status=status.HTTP_400_BAD_REQUEST)
        except AIAgentRun.DoesNotExist:
            return Response({"error": "Run not found"}, status=status.HTTP_404_NOT_FOUND)


class AIAgentConversationEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        conversations = AIAgentConversation.objects.filter(
            workspace__slug=slug,
            created_by=request.user,
        ).order_by("-updated_at")
        queryset = self.filter_queryset(conversations)
        return self.paginate(
            request=request,
            queryset=queryset,
            on_results=lambda data: AIAgentConversationSerializer(data, many=True).data,
        )

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        serializer = AIAgentConversationSerializer(data=request.data)
        if serializer.is_valid():
            conversation = serializer.save(workspace=workspace, created_by=request.user)
            return Response(AIAgentConversationSerializer(conversation).data, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class AIAgentConversationDetailEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug, conversation_id):
        try:
            conversation = AIAgentConversation.objects.get(
                id=conversation_id,
                workspace__slug=slug,
                created_by=request.user,
            )
            return Response(AIAgentConversationSerializer(conversation).data, status=status.HTTP_200_OK)
        except AIAgentConversation.DoesNotExist:
            return Response({"error": "Conversation not found"}, status=status.HTTP_404_NOT_FOUND)

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def delete(self, request, slug, conversation_id):
        try:
            conversation = AIAgentConversation.objects.get(
                id=conversation_id,
                workspace__slug=slug,
                created_by=request.user,
            )
            conversation.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        except AIAgentConversation.DoesNotExist:
            return Response({"error": "Conversation not found"}, status=status.HTTP_404_NOT_FOUND)
