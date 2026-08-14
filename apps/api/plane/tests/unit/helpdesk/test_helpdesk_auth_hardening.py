import uuid
from unittest.mock import patch, MagicMock
import datetime
import jwt
from django.conf import settings
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from plane.app.views.helpdesk.auth import get_password_reset_token, PASSWORD_RESET_PURPOSE
from plane.bgtasks.helpdesk_forgot_password_task import helpdesk_forgot_password
from plane.db.models import HelpdeskCustomer, HelpdeskPortal
from plane.tests.factories import UserFactory, WorkspaceFactory


class TestHelpdeskAuthHardening(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        owner = UserFactory.create(
            username=f"owner_{uuid.uuid4().hex[:8]}",
            email=f"owner_{uuid.uuid4().hex[:8]}@example.com",
        )
        self.workspace = WorkspaceFactory.create(owner=owner)
        self.portal = HelpdeskPortal.objects.create(
            workspace=self.workspace,
            public_slug="portal-auth-test",
            is_public=True,
        )

        self.customer = HelpdeskCustomer(
            workspace=self.workspace,
            name="Jane Doe",
            email="jane.doe@example.com",
            is_active=True,
        )
        self.customer.set_password("InitialSecurePassword123!")
        self.customer.save()

    @patch("plane.app.views.helpdesk.auth.helpdesk_forgot_password.delay")
    def test_forgot_password_generic_response_for_existing_and_non_existing(self, mock_task):
        url = f"/api/helpdesk/public/portals/{self.portal.public_slug}/auth/forgot-password/"

        # 1. Existing active customer
        response = self.client.post(url, {"email": "jane.doe@example.com"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["message"], "If an account exists for this email, a reset link has been sent.")
        self.assertEqual(mock_task.call_count, 1)
        args, _ = mock_task.call_args
        self.assertEqual(args[0], "Jane Doe")
        self.assertEqual(args[1], "jane.doe@example.com")
        self.assertEqual(args[2], "portal-auth-test")

        mock_task.reset_mock()

        # 2. Non-existing email (anti-enumeration check)
        response_non_existing = self.client.post(url, {"email": "nobody@example.com"}, format="json")
        self.assertEqual(response_non_existing.status_code, 200)
        self.assertEqual(
            response_non_existing.data["message"],
            "If an account exists for this email, a reset link has been sent.",
        )
        mock_task.assert_not_called()

    @patch("plane.app.views.helpdesk.auth.helpdesk_forgot_password.delay")
    def test_forgot_password_inactive_customer_ignored(self, mock_task):
        # Deactivate customer
        self.customer.is_active = False
        self.customer.save()

        url = f"/api/helpdesk/public/portals/{self.portal.public_slug}/auth/forgot-password/"
        response = self.client.post(url, {"email": "jane.doe@example.com"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["message"], "If an account exists for this email, a reset link has been sent.")
        # No email should be dispatched for inactive accounts
        mock_task.assert_not_called()

    @patch("plane.app.views.helpdesk.auth.helpdesk_forgot_password.delay")
    def test_forgot_password_email_normalization(self, mock_task):
        url = f"/api/helpdesk/public/portals/{self.portal.public_slug}/auth/forgot-password/"
        # Email with surrounding whitespace and mixed case
        response = self.client.post(url, {"email": "  JANE.DOE@example.com  "}, format="json")
        self.assertEqual(response.status_code, 200)
        mock_task.assert_called_once()
        args, _ = mock_task.call_args
        self.assertEqual(args[1], "jane.doe@example.com")

    def test_reset_password_success_and_replay_protection(self):
        token = get_password_reset_token(self.customer)
        url = f"/api/helpdesk/public/portals/{self.portal.public_slug}/auth/reset-password/"

        new_password = "BrandNewStrongPassword2026!"
        response = self.client.post(url, {"token": token, "password": new_password}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["message"], "Password reset successfully")

        # Verify new password is set
        self.customer.refresh_from_db()
        self.assertTrue(self.customer.check_password(new_password))

        # Attempt to replay the same token -> must be rejected
        replay_response = self.client.post(url, {"token": token, "password": "AnotherPassword123!"}, format="json")
        self.assertEqual(replay_response.status_code, 400)
        self.assertEqual(replay_response.data["error"], "This reset link has already been used")

    def test_reset_password_weak_password_rejected(self):
        token = get_password_reset_token(self.customer)
        url = f"/api/helpdesk/public/portals/{self.portal.public_slug}/auth/reset-password/"

        weak_password = "password1"
        response = self.client.post(url, {"token": token, "password": weak_password}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("too weak", response.data["error"])

        # Password must remain the original
        self.customer.refresh_from_db()
        self.assertTrue(self.customer.check_password("InitialSecurePassword123!"))

    def test_reset_password_inactive_customer_rejected(self):
        token = get_password_reset_token(self.customer)
        self.customer.is_active = False
        self.customer.save()

        url = f"/api/helpdesk/public/portals/{self.portal.public_slug}/auth/reset-password/"
        response = self.client.post(url, {"token": token, "password": "StrongPassword2026!"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"], "This account has been deactivated")

    def test_reset_password_expired_token_rejected(self):
        # Generate an expired token
        past_time = timezone.now() - datetime.timedelta(hours=2)
        payload = {
            "purpose": PASSWORD_RESET_PURPOSE,
            "customer_id": str(self.customer.id),
            "workspace_id": str(self.customer.workspace_id),
            "pwd_sig": "invalid_sig",
            "exp": past_time,
            "iat": past_time,
        }
        expired_token = jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")

        url = f"/api/helpdesk/public/portals/{self.portal.public_slug}/auth/reset-password/"
        response = self.client.post(url, {"token": expired_token, "password": "StrongPassword2026!"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"], "This reset link has expired")

    def test_reset_password_cross_workspace_rejected(self):
        other_owner = UserFactory.create(
            username=f"other_{uuid.uuid4().hex[:8]}",
            email=f"other_{uuid.uuid4().hex[:8]}@example.com",
        )
        other_workspace = WorkspaceFactory.create(owner=other_owner)
        token = get_password_reset_token(self.customer)  # created in self.workspace

        other_portal = HelpdeskPortal.objects.create(
            workspace=other_workspace,
            public_slug="other-portal-auth",
            is_public=True,
        )

        url = f"/api/helpdesk/public/portals/{other_portal.public_slug}/auth/reset-password/"
        response = self.client.post(url, {"token": token, "password": "StrongPassword2026!"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"], "This reset link is invalid")

    def test_login_inactive_customer_rejected(self):
        self.customer.is_active = False
        self.customer.save()

        url = f"/api/helpdesk/public/portals/{self.portal.public_slug}/auth/login/"
        response = self.client.post(
            url,
            {"email": "jane.doe@example.com", "password": "InitialSecurePassword123!"},
            format="json",
        )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["error"], "This account has been deactivated")

    @patch("plane.bgtasks.helpdesk_forgot_password_task.get_connection")
    @patch("plane.bgtasks.helpdesk_forgot_password_task.EmailMultiAlternatives")
    def test_forgot_password_task_portal_smtp_resolution(self, mock_email_class, mock_get_conn):
        self.portal.smtp_host = "smtp.customportal.com"
        self.portal.smtp_port = 587
        self.portal.smtp_username = "portal_user"
        self.portal.smtp_password = "portal_pass"
        self.portal.smtp_use_tls = True
        self.portal.no_reply_email_address = "support@customportal.com"
        self.portal.save()

        mock_msg_instance = MagicMock()
        mock_email_class.return_value = mock_msg_instance

        helpdesk_forgot_password(
            name="Jane Doe",
            email="jane.doe@example.com",
            public_slug=self.portal.public_slug,
            token="sample_token",
            current_site="https://support.customportal.com/",
        )

        mock_get_conn.assert_called_once_with(
            host="smtp.customportal.com",
            port=587,
            username="portal_user",
            password="portal_pass",
            use_tls=True,
            use_ssl=False,
        )

        mock_email_class.assert_called_once()
        _, kwargs = mock_email_class.call_args
        self.assertEqual(kwargs["from_email"], "support@customportal.com")
        self.assertEqual(kwargs["to"], ["jane.doe@example.com"])

    @patch("plane.app.views.helpdesk.auth.helpdesk_forgot_password.delay")
    def test_throttle_rate_limit_exceeded(self, mock_task):
        url = f"/api/helpdesk/public/portals/{self.portal.public_slug}/auth/forgot-password/"
        # The rate limit is 10/minute
        for _ in range(10):
            res = self.client.post(url, {"email": "jane.doe@example.com"}, format="json")
            self.assertEqual(res.status_code, 200)

        # The 11th request must be throttled (429)
        throttled_res = self.client.post(url, {"email": "jane.doe@example.com"}, format="json")
        self.assertEqual(throttled_res.status_code, 429)

