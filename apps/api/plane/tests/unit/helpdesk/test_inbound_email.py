# Python imports
import uuid

# Third-party imports
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

# Module imports
from plane.db.models import HelpdeskRequest, HelpdeskRequestComment, Workspace, HelpdeskPortal, HelpdeskMember
from plane.tests.factories import UserFactory, WorkspaceFactory


class TestInboundEmailParsing(APITestCase):
    def setUp(self):
        self.user = UserFactory.create(email="customer@example.com", username="customer")
        self.workspace = WorkspaceFactory.create()
        self.portal = HelpdeskPortal.objects.create(
            workspace=self.workspace,
            public_slug="test-portal",
        )
        self.helpdesk_request = HelpdeskRequest.objects.create(
            workspace=self.workspace,
            portal=self.portal,
            title="Help me",
            description="I need help",
            contact_email="customer@example.com",
        )
        self.original_message_id = f"<{uuid.uuid4()}@plane.so>"
        self.comment = HelpdeskRequestComment.objects.create(
            workspace=self.workspace,
            request=self.helpdesk_request,
            content="Original message",
            email_status="sent",
            email_message_id=self.original_message_id,
        )
        self.url = reverse("public-helpdesk-inbound")

    def test_successful_threading(self):
        """Test that an email with a valid In-Reply-To creates a comment on the correct ticket."""
        payload = {
            "headers": f"Message-ID: <new123@email.com>\nIn-Reply-To: {self.original_message_id}\nReferences: {self.original_message_id}",
            "from": "customer@example.com",
            "text": "This is a reply to the ticket.",
        }
        
        response = self.client.post(self.url, payload, format="multipart")
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(HelpdeskRequestComment.objects.filter(request=self.helpdesk_request).count(), 2)
        
        new_comment = HelpdeskRequestComment.objects.latest("created_at")
        self.assertEqual(new_comment.content, "This is a reply to the ticket.")
        self.assertEqual(new_comment.email_message_id, "<new123@email.com>")
        self.assertEqual(new_comment.delivery_channels, ["email"])

    def test_sender_validation_fails(self):
        """Test that an email from an unauthorized sender is rejected."""
        payload = {
            "headers": f"Message-ID: <new456@email.com>\nIn-Reply-To: {self.original_message_id}",
            "from": "hacker@example.com",
            "text": "I am hacking this ticket.",
        }
        
        response = self.client.post(self.url, payload, format="multipart")
        
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(HelpdeskRequestComment.objects.filter(request=self.helpdesk_request).count(), 1)

    def test_missing_context(self):
        """Test that an email without an In-Reply-To or References header fails gracefully."""
        payload = {
            "headers": "Message-ID: <new789@email.com>",
            "from": "customer@example.com",
            "text": "Where does this go?",
        }
        
        response = self.client.post(self.url, payload, format="multipart")
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(HelpdeskRequestComment.objects.filter(request=self.helpdesk_request).count(), 1)

    def test_html_parsing(self):
        """Test that an email with only HTML body is properly parsed to text."""
        payload = {
            "headers": f"Message-ID: <new999@email.com>\nIn-Reply-To: {self.original_message_id}",
            "from": "customer@example.com",
            "html": "<html><body><p>Reply in <b>HTML</b></p></body></html>",
        }
        
        response = self.client.post(self.url, payload, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        new_comment = HelpdeskRequestComment.objects.latest("created_at")
        self.assertIn("Reply in HTML", new_comment.content)

    def test_agent_reply(self):
        """Test that an authorized agent can reply and is linked as the actor."""
        agent_user = UserFactory.create(email="agent@plane.so", username="agent")
        HelpdeskMember.objects.create(
            workspace=self.workspace,
            member=agent_user,
            role=15, # Agent role
            is_active=True
        )
        
        payload = {
            "headers": f"Message-ID: <agent123@email.com>\nIn-Reply-To: {self.original_message_id}",
            "from": "agent@plane.so",
            "text": "Agent reply via email.",
        }
        
        response = self.client.post(self.url, payload, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        new_comment = HelpdeskRequestComment.objects.latest("created_at")
        self.assertEqual(new_comment.content, "Agent reply via email.")
        self.assertEqual(new_comment.actor, agent_user)
        self.assertIsNone(new_comment.customer)

    def test_references_header_threading(self):
        """Test that correlation works even if only References header contains the original ID."""
        payload = {
            "headers": f"Message-ID: <ref123@email.com>\nReferences: {self.original_message_id}",
            "from": "customer@example.com",
            "text": "References thread reply.",
        }
        
        response = self.client.post(self.url, payload, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        new_comment = HelpdeskRequestComment.objects.latest("created_at")
        self.assertEqual(new_comment.content, "References thread reply.")

    def test_empty_body_and_missing_from(self):
        """Test validation rules for missing sender or empty email content."""
        # Scenario 1: missing from
        payload_no_sender = {
            "headers": f"Message-ID: <err1@email.com>\nIn-Reply-To: {self.original_message_id}",
            "text": "No sender",
        }
        response = self.client.post(self.url, payload_no_sender, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
        # Scenario 2: empty body
        payload_empty_body = {
            "headers": f"Message-ID: <err2@email.com>\nIn-Reply-To: {self.original_message_id}",
            "from": "customer@example.com",
            "text": "",
            "html": "",
        }
        response = self.client.post(self.url, payload_empty_body, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_contact_email_match(self):
        """Test matching when the from address matches contact_email, even if the Customer object is not set."""
        contact_request = HelpdeskRequest.objects.create(
            workspace=self.workspace,
            portal=self.portal,
            title="External Ticket",
            contact_email="external_user@example.com",
            customer=None,
        )
        parent_comment = HelpdeskRequestComment.objects.create(
            workspace=self.workspace,
            request=contact_request,
            content="Original external comment",
            email_status="sent",
            email_message_id="<external-parent-123@plane.so>",
        )
        
        payload = {
            "headers": "Message-ID: <external-reply@email.com>\nIn-Reply-To: <external-parent-123@plane.so>",
            "from": "external_user@example.com",
            "text": "External user reply.",
        }
        
        response = self.client.post(self.url, payload, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        new_comment = HelpdeskRequestComment.objects.latest("created_at")
        self.assertEqual(new_comment.content, "External user reply.")
        self.assertEqual(new_comment.request, contact_request)

