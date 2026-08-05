import uuid
from django.test import TestCase
from rest_framework.test import APIClient

from plane.db.models import HelpdeskCustomer, HelpdeskMember, HelpdeskPortal, HelpdeskRequest, WorkspaceMember
from plane.tests.factories import UserFactory, WorkspaceFactory


class TestHelpdeskCustomerAPI(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.workspace = WorkspaceFactory.create()
        self.user = UserFactory.create(
            username=f"agent_{uuid.uuid4().hex[:8]}",
            email=f"agent_{uuid.uuid4().hex[:8]}@example.com",
        )
        self.client.force_authenticate(user=self.user)

        # Add user as member to workspace and helpdesk
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            member=self.user,
            role=15,  # MEMBER
        )
        HelpdeskMember.objects.create(
            workspace=self.workspace,
            member=self.user,
            role=15,  # MEMBER
        )

        self.portal = HelpdeskPortal.objects.create(
            workspace=self.workspace,
            public_slug="portal-test-customer-api",
        )

    def test_member_can_list_and_create_customers(self):
        # Create a customer via ORM
        customer1 = HelpdeskCustomer.objects.create(
            workspace=self.workspace,
            name="Existing Customer",
            email="existing@example.com",
        )

        # List customers
        url = f"/api/workspaces/{self.workspace.slug}/helpdesk/customers/"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

        # Create new customer via API
        create_payload = {
            "name": "New Customer",
            "email": "newcustomer@example.com",
        }
        create_resp = self.client.post(url, create_payload, format="json")
        self.assertEqual(create_resp.status_code, 201)
        self.assertEqual(create_resp.data["name"], "New Customer")
        self.assertEqual(create_resp.data["email"], "newcustomer@example.com")

    def test_member_can_create_ticket_linked_to_customer(self):
        customer = HelpdeskCustomer.objects.create(
            workspace=self.workspace,
            name="Target Customer",
            email="target@example.com",
        )

        url = f"/api/workspaces/{self.workspace.slug}/helpdesk/requests/"
        payload = {
            "title": "Agent Created Ticket For Customer",
            "description": "<p>Ticket body</p>",
            "portal": str(self.portal.id),
            "customer": str(customer.id),
        }
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["contact_email"], "target@example.com")
        self.assertIn("created_by_detail", response.data)
        self.assertEqual(str(response.data["created_by_detail"]["id"]), str(self.user.id))
        self.assertIn("customer_detail", response.data)
        self.assertEqual(str(response.data["customer_detail"]["id"]), str(customer.id))
