# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from unittest.mock import patch
from rest_framework import status
from rest_framework.test import APITestCase

from plane.db.models import (
    AIAgentAction,
    AIAgentConversation,
    AIAgentRun,
    User,
    Workspace,
    WorkspaceMember,
)


class AIAgentContractTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="agent_test@plane.so",
            username="agent_test_user",
            password="testpassword123",
        )
        self.other_user = User.objects.create_user(
            email="other_agent_test@plane.so",
            username="other_agent_test_user",
            password="testpassword123",
        )
        self.workspace = Workspace.objects.create(
            name="AI Test Workspace",
            slug="ai-test-workspace",
            owner=self.user,
            created_by=self.user,
        )
        self.member = WorkspaceMember.objects.create(
            workspace=self.workspace,
            member=self.user,
            role=20,
            is_active=True,
        )
        self.client.force_authenticate(user=self.user)

    def test_ai_agent_run_permission_denied(self):
        """Test non-members cannot access AI agent runs"""
        self.client.force_authenticate(user=self.other_user)
        response = self.client.get(f"/api/v1/workspaces/{self.workspace.slug}/ai/runs/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @patch("plane.api.views.ai._call_ai_service")
    def test_ai_agent_run_create_and_list(self, mock_ai_service):
        """Test creating an AI Agent Run and listing runs"""
        mock_ai_service.return_value = {
            "plan": {
                "mode": "build",
                "actions": [
                    {
                        "type": "create_work_item",
                        "targetEntityType": "issue",
                        "payload": {"name": "Test Bug"},
                        "requiresApproval": True,
                    }
                ],
            }
        }

        url = f"/api/v1/workspaces/{self.workspace.slug}/ai/runs/"
        payload = {
            "mode": "build",
            "provider": "openai",
            "llm_model": "gpt-4o-mini",
            "input_text": "Create a bug for login error",
        }
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.json()
        self.assertEqual(data["mode"], "build")
        self.assertEqual(data["status"], "awaiting_approval")
        self.assertEqual(len(data["actions"]), 1)

        # List runs
        list_response = self.client.get(url)
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        list_data = list_response.json()
        self.assertGreaterEqual(len(list_data["results"]), 1)

    @patch("plane.api.views.ai._call_ai_service")
    def test_ai_agent_run_approval_flow(self, mock_ai_service):
        """Test approving and rejecting planned actions"""
        mock_ai_service.return_value = {"success": True, "result": {"id": "issue-123", "name": "Created Task"}}

        # Create run in DB
        run = AIAgentRun.objects.create(
            workspace=self.workspace,
            requested_by=self.user,
            mode="build",
            provider="mock",
            llm_model="mock-model",
            status="awaiting_approval",
            input_text="Create task",
        )
        action = AIAgentAction.objects.create(
            run=run,
            action_type="create_work_item",
            target_entity_type="issue",
            planned_payload={"name": "Created Task"},
            status="planned",
        )

        # Approve action
        approval_url = f"/api/v1/workspaces/{self.workspace.slug}/ai/runs/{run.id}/approval/"
        response = self.client.post(approval_url, {"action": "approve"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        run.refresh_from_db()
        action.refresh_from_db()
        self.assertEqual(run.status, "completed")
        self.assertEqual(action.status, "executed")

        # Reject flow test
        run2 = AIAgentRun.objects.create(
            workspace=self.workspace,
            requested_by=self.user,
            mode="build",
            provider="mock",
            llm_model="mock-model",
            status="awaiting_approval",
            input_text="Create another task",
        )
        action2 = AIAgentAction.objects.create(
            run=run2,
            action_type="create_work_item",
            target_entity_type="issue",
            planned_payload={"name": "Task 2"},
            status="planned",
        )

        reject_url = f"/api/v1/workspaces/{self.workspace.slug}/ai/runs/{run2.id}/approval/"
        reject_response = self.client.post(reject_url, {"action": "reject"}, format="json")
        self.assertEqual(reject_response.status_code, status.HTTP_200_OK)

        run2.refresh_from_db()
        action2.refresh_from_db()
        self.assertEqual(run2.status, "rejected")
        self.assertEqual(action2.status, "failed")

    def test_ai_agent_conversation_crud(self):
        """Test creating, listing, and deleting AI Agent conversations"""
        url = f"/api/v1/workspaces/{self.workspace.slug}/ai/conversations/"

        # 1. Create conversation
        create_res = self.client.post(url, {"title": "Mobile App Brainstorm"}, format="json")
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)
        conv_data = create_res.json()
        conv_id = conv_data["id"]

        # 2. List conversations
        list_res = self.client.get(url)
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(list_res.json()["results"]), 1)

        # 3. Delete conversation
        detail_url = f"{url}{conv_id}/"
        del_res = self.client.delete(detail_url)
        self.assertEqual(del_res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(AIAgentConversation.objects.filter(id=conv_id).exists())

    def test_ai_agent_run_approval_non_awaiting_status(self):
        """Test approving a run that is not in awaiting_approval status returns 400"""
        run = AIAgentRun.objects.create(
            workspace=self.workspace,
            requested_by=self.user,
            mode="build",
            provider="mock",
            llm_model="mock-model",
            status="completed",
            input_text="Already finished run",
        )
        url = f"/api/v1/workspaces/{self.workspace.slug}/ai/runs/{run.id}/approval/"
        response = self.client.post(url, {"action": "approve"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("not awaiting approval", response.json()["error"])

    def test_ai_agent_run_approval_invalid_action(self):
        """Test sending an invalid action choice returns 400"""
        run = AIAgentRun.objects.create(
            workspace=self.workspace,
            requested_by=self.user,
            mode="build",
            provider="mock",
            llm_model="mock-model",
            status="awaiting_approval",
            input_text="Pending run",
        )
        url = f"/api/v1/workspaces/{self.workspace.slug}/ai/runs/{run.id}/approval/"
        response = self.client.post(url, {"action": "unknown_action"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json()["error"], "Invalid action choice")

    def test_ai_agent_run_not_found(self):
        """Test accessing non-existent run ID returns 404"""
        import uuid
        fake_id = uuid.uuid4()
        url = f"/api/v1/workspaces/{self.workspace.slug}/ai/runs/{fake_id}/"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    @patch("plane.api.views.ai._call_ai_service")
    def test_ai_agent_run_service_outage_handling(self, mock_ai_service):
        """Test AI service failure sets run status to failed instead of completing"""
        mock_ai_service.return_value = {}  # Simulate service outage / connection failure

        url = f"/api/v1/workspaces/{self.workspace.slug}/ai/runs/"
        payload = {
            "mode": "ask",
            "provider": "openai",
            "llm_model": "gpt-4o-mini",
            "input_text": "Summarize issues",
        }
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.json()
        self.assertEqual(data["status"], "failed")
        self.assertIn("Failed to communicate", data["output_text"])
