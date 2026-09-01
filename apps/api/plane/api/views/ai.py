# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json
import logging
from urllib.request import Request, urlopen
from urllib.error import URLError

from django.conf import settings
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.api.serializers import (
    AIAgentConversationSerializer,
    AIAgentRunCreateSerializer,
    AIAgentRunSerializer,
)
from plane.api.views.base import BaseAPIView
from plane.db.models import (
    AIAgentAction,
    AIAgentConversation,
    AIAgentRun,
    Workspace,
    WorkspaceMember,
)

logger = logging.getLogger(__name__)

AI_SERVICE_URL = getattr(settings, "AI_SERVICE_URL", "http://localhost:8001")


def _call_ai_service(endpoint: str, payload: dict) -> dict:
    url = f"{AI_SERVICE_URL.rstrip('/')}{endpoint}"
    data = json.dumps(payload).encode("utf-8")
    req = Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
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
    def get(self, request, slug):
        if not WorkspaceMember.objects.filter(
            workspace__slug=slug,
            member=request.user,
            is_active=True,
        ).exists():
            return Response(
                {"error": "You do not have permission to access workspace AI agent runs."},
                status=status.HTTP_403_FORBIDDEN,
            )

        runs = AIAgentRun.objects.filter(workspace__slug=slug).order_by("-created_at")
        queryset = self.filter_queryset(runs)
        return self.paginate(
            request=request,
            queryset=queryset,
            on_results=lambda data: AIAgentRunSerializer(data, many=True).data,
        )

    def post(self, request, slug):
        if not WorkspaceMember.objects.filter(
            workspace__slug=slug,
            member=request.user,
            is_active=True,
        ).exists():
            return Response(
                {"error": "You do not have permission to execute AI agent runs in this workspace."},
                status=status.HTTP_403_FORBIDDEN,
            )

        workspace = Workspace.objects.get(slug=slug)
        serializer = AIAgentRunCreateSerializer(data=request.data)
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
            plan = ai_res.get("plan", {})

            actions = plan.get("actions", [])
            has_pending_approval = False

            for act in actions:
                requires_approval = act.get("requiresApproval", True)
                if requires_approval:
                    has_pending_approval = True

                AIAgentAction.objects.create(
                    run=run,
                    action_type=act.get("type", "unknown"),
                    target_entity_type=act.get("targetEntityType", "issue"),
                    planned_payload=act.get("payload", {}),
                    status="planned",
                )

            if has_pending_approval:
                run.status = "awaiting_approval"
            else:
                run.status = "completed"
                run.completed_at = timezone.now()

            run.save()

            return Response(AIAgentRunSerializer(run).data, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class AIAgentRunDetailEndpoint(BaseAPIView):
    def get(self, request, slug, run_id):
        if not WorkspaceMember.objects.filter(
            workspace__slug=slug,
            member=request.user,
            is_active=True,
        ).exists():
            return Response(
                {"error": "You do not have permission to perform this action."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            run = AIAgentRun.objects.get(id=run_id, workspace__slug=slug)
            return Response(AIAgentRunSerializer(run).data, status=status.HTTP_200_OK)
        except AIAgentRun.DoesNotExist:
            return Response({"error": "AI Agent Run not found"}, status=status.HTTP_404_NOT_FOUND)


class AIAgentRunApprovalEndpoint(BaseAPIView):
    def post(self, request, slug, run_id):
        if not WorkspaceMember.objects.filter(
            workspace__slug=slug,
            member=request.user,
            is_active=True,
        ).exists():
            return Response(
                {"error": "You do not have permission to perform this action."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            run = AIAgentRun.objects.get(id=run_id, workspace__slug=slug)

            if run.status != "awaiting_approval":
                return Response(
                    {"error": f"Run is not awaiting approval. Current status: {run.status}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            action_choice = request.data.get("action")
            if action_choice == "approve":
                planned_actions = list(AIAgentAction.objects.filter(run=run, status="planned"))
                
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

                    act.status = "executed" if exec_res.get("success") else "failed"
                    act.executed_payload = exec_res.get("result", {})
                    act.approved_by = request.user
                    act.executed_at = timezone.now()
                    if not exec_res.get("success"):
                        act.error_message = exec_res.get("error", "Execution failed")
                    act.save()

                run.status = "completed"
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
    def get(self, request, slug):
        if not WorkspaceMember.objects.filter(
            workspace__slug=slug,
            member=request.user,
            is_active=True,
        ).exists():
            return Response(
                {"error": "You do not have permission to view AI conversations."},
                status=status.HTTP_403_FORBIDDEN,
            )

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

    def post(self, request, slug):
        if not WorkspaceMember.objects.filter(
            workspace__slug=slug,
            member=request.user,
            is_active=True,
        ).exists():
            return Response(
                {"error": "You do not have permission to create AI conversations."},
                status=status.HTTP_403_FORBIDDEN,
            )

        workspace = Workspace.objects.get(slug=slug)
        serializer = AIAgentConversationSerializer(data=request.data)
        if serializer.is_valid():
            conversation = serializer.save(workspace=workspace, created_by=request.user)
            return Response(AIAgentConversationSerializer(conversation).data, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class AIAgentConversationDetailEndpoint(BaseAPIView):
    def get(self, request, slug, conversation_id):
        if not WorkspaceMember.objects.filter(
            workspace__slug=slug,
            member=request.user,
            is_active=True,
        ).exists():
            return Response(
                {"error": "You do not have permission to view this conversation."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            conversation = AIAgentConversation.objects.get(
                id=conversation_id,
                workspace__slug=slug,
                created_by=request.user,
            )
            return Response(AIAgentConversationSerializer(conversation).data, status=status.HTTP_200_OK)
        except AIAgentConversation.DoesNotExist:
            return Response({"error": "Conversation not found"}, status=status.HTTP_404_NOT_FOUND)

    def delete(self, request, slug, conversation_id):
        if not WorkspaceMember.objects.filter(
            workspace__slug=slug,
            member=request.user,
            is_active=True,
        ).exists():
            return Response(
                {"error": "You do not have permission to delete this conversation."},
                status=status.HTTP_403_FORBIDDEN,
            )

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
