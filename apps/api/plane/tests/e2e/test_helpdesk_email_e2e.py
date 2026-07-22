# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""End-to-end tests for the helpdesk email feature, against a real SMTP server.

The unit suite runs on the ``locmem`` backend, which builds an EmailMessage and
drops it in ``mail.outbox`` without ever opening a socket. Everything that only
exists on the wire is therefore untested by it:

* whether ``get_connection()`` can actually negotiate with the configured host
  (``locmem.__init__`` accepts and silently ignores ``use_tls``/``use_ssl`` --
  this is why T9b in the unit suite had to assert on a spy instead of on
  delivery);
* the MIME structure that is really assembled;
* the headers as delivered, which is what a mail client threads on;
* the portal SMTP override, which no unit test exercises.

These tests drive the whole path: authenticated HTTP request -> serializer ->
``perform_create`` -> Celery task (eager) -> real SMTP -> Mailpit, and then feed
a Message-ID captured off the wire back into the inbound webhook.
"""

# Python imports
import unittest
from unittest import mock

# Third-party imports
from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

# Module imports
from plane.db.models import (
    HelpdeskMember,
    HelpdeskPortal,
    HelpdeskRequest,
    HelpdeskRequestComment,
    WorkspaceMember,
)
from plane.tests.e2e import mailpit
from plane.tests.factories import UserFactory, WorkspaceFactory

try:  # pragma: no cover - depends on which requirements file is installed
    import pytest

    e2e_marker = pytest.mark.e2e
except ImportError:
    # The api container installs requirements/local.txt, which has no pytest.
    # Falling back to a no-op keeps the module importable under
    # `manage.py test`, so the suite is not tied to one runner.
    def e2e_marker(cls):
        return cls


INBOUND_SECRET = "test-inbound-secret"
AGENT_EMAIL = "agent@plane.so"
CUSTOMER_EMAIL = "customer@example.com"
NO_REPLY = "support@plane.so"

# MEMBER is the minimum role HelpdeskRequestCommentViewSet.create accepts.
MEMBER_ROLE = 15


@e2e_marker
@override_settings(
    # The task calls get_connection() without a backend argument, so it resolves
    # settings.EMAIL_BACKEND -- locmem in plane.settings.test. Pointing it at the
    # real SMTP backend is what makes these tests end-to-end rather than a
    # repeat of the unit suite.
    EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend",
    # Same rationale as the unit suite: the default cache is a shared Redis, and
    # cache.clear() against it would FLUSHDB. The throttle needs a real cache, so
    # it has to be a working backend rather than DummyCache.
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "helpdesk-email-e2e",
        }
    },
)
class TestHelpdeskEmailE2E(APITestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        if not mailpit.is_available():
            # unittest.SkipTest is honoured by both pytest and the Django runner.
            raise unittest.SkipTest(
                f"Mailpit is not reachable at {mailpit.API_URL}. "
                "Start it with: docker compose -f docker-compose-local.yml up -d mailpit"
            )

    def setUp(self):
        cache.clear()
        # Mailpit state is global to the container, not per-test.
        mailpit.clear()

        patcher = mock.patch(
            "plane.app.helpdesk.inbound_security.get_inbound_secret",
            return_value=INBOUND_SECRET,
        )
        patcher.start()
        self.addCleanup(patcher.stop)

        self.workspace = WorkspaceFactory.create()
        self.agent = UserFactory.create(email=AGENT_EMAIL, username="agent-e2e")
        # get_helpdesk_role resolves WorkspaceMember first and returns None
        # without it, so the helpdesk role alone is not enough to reach the view.
        WorkspaceMember.objects.create(
            workspace=self.workspace, member=self.agent, role=MEMBER_ROLE, is_active=True
        )
        HelpdeskMember.objects.create(
            workspace=self.workspace, member=self.agent, role=MEMBER_ROLE, is_active=True
        )

        # Pointing the portal at Mailpit exercises the portal SMTP override,
        # which the unit suite never covers. Plain SMTP: no TLS, no SSL.
        self.portal = HelpdeskPortal.objects.create(
            workspace=self.workspace,
            public_slug="e2e-portal",
            no_reply_email_address=NO_REPLY,
            smtp_host=mailpit.SMTP_HOST,
            smtp_port=mailpit.SMTP_PORT,
            smtp_use_tls=False,
            smtp_use_ssl=False,
        )
        self.helpdesk_request = HelpdeskRequest.objects.create(
            workspace=self.workspace,
            portal=self.portal,
            title="Printer is on fire",
            description="It is really on fire",
            contact_email=CUSTOMER_EMAIL,
        )

        self.comments_url = reverse(
            "helpdesk-request-comment",
            kwargs={"slug": self.workspace.slug, "request_pk": self.helpdesk_request.id},
        )
        self.inbound_url = reverse("public-helpdesk-inbound")
        self.client.force_authenticate(user=self.agent)

    def _post_comment(self, content, channels=("email",), is_internal=False):
        return self.client.post(
            self.comments_url,
            {
                "content": content,
                "delivery_channels": list(channels),
                "is_internal": is_internal,
            },
            format="json",
        )

    def _post_inbound(self, payload):
        return self.client.post(
            self.inbound_url,
            payload,
            format="multipart",
            HTTP_X_HELPDESK_INBOUND_SECRET=INBOUND_SECRET,
        )

    def test_agent_comment_is_delivered_over_real_smtp(self):
        """The full stack delivers a real message with the expected envelope and MIME parts."""
        response = self._post_comment("We are sending someone over.")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        summary = mailpit.only_message()
        self.assertEqual(summary["From"]["Address"], NO_REPLY)
        self.assertEqual([to["Address"] for to in summary["To"]], [CUSTOMER_EMAIL])
        self.assertEqual(summary["Subject"], f"Re: {self.helpdesk_request.title}")

        body = mailpit.get_message(summary["ID"])
        self.assertIn("We are sending someone over.", body["Text"])
        # attach_alternative must survive the real transaction, not just the
        # in-memory EmailMultiAlternatives object.
        self.assertIn("We are sending someone over.", body["HTML"])

        comment = HelpdeskRequestComment.objects.get(id=response.data["id"])
        self.assertEqual(comment.email_status, HelpdeskRequestComment.EmailDeliveryStatus.SENT)
        self.assertIsNotNone(comment.email_sent_at)
        # The persisted Message-ID must be the one that actually went out --
        # inbound threading resolves replies against this exact value.
        self.assertEqual(
            mailpit.header(summary["ID"], "Message-ID"), comment.email_message_id
        )

    def test_internal_note_never_reaches_the_smtp_server(self):
        """RC-2: an internal note must not leave the process, even with the email channel set."""
        response = self._post_comment(
            "Customer is abusive, escalate to legal.", channels=("email",), is_internal=True
        )

        # The serializer rejects the combination outright (layer 1); should a
        # future change relax that, the assertion below is what still holds the
        # line -- nothing was handed to a real SMTP server.
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(mailpit.count(), 0)

    def test_internal_note_created_in_orm_is_not_delivered(self):
        """RC-2 layer 3: the task's own guard holds when the serializer is bypassed."""
        from plane.bgtasks.helpdesk_email_task import send_helpdesk_comment_email

        comment = HelpdeskRequestComment.objects.create(
            workspace=self.workspace,
            request=self.helpdesk_request,
            actor=self.agent,
            content="Internal only: customer is on the churn list.",
            is_internal=True,
            delivery_channels=["email"],
            email_status=HelpdeskRequestComment.EmailDeliveryStatus.PENDING,
        )

        send_helpdesk_comment_email(comment.id)

        self.assertEqual(mailpit.count(), 0)
        comment.refresh_from_db()
        self.assertEqual(
            comment.email_status, HelpdeskRequestComment.EmailDeliveryStatus.NOT_SENT
        )
        self.assertTrue(comment.email_error)

    def test_customer_reply_threads_on_the_delivered_message_id(self):
        """Round trip: the Message-ID that leaves on the wire is the one inbound matches on.

        This is the contract the unit suite cannot check -- it asserts outbound
        and inbound against each other using a real message rather than a
        hand-written identifier.
        """
        self._post_comment("Have you tried turning it off and on again?")
        delivered_message_id = mailpit.header(mailpit.only_message()["ID"], "Message-ID")
        self.assertIsNotNone(delivered_message_id)

        response = self._post_inbound(
            {
                "headers": (
                    f"Message-ID: <reply-from-customer@example.com>\n"
                    f"In-Reply-To: {delivered_message_id}\n"
                    f"References: {delivered_message_id}"
                ),
                "from": f"Angry Customer <{CUSTOMER_EMAIL}>",
                "text": "Yes. It is still on fire.",
            }
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        reply = HelpdeskRequestComment.objects.get(
            email_message_id="<reply-from-customer@example.com>"
        )
        self.assertEqual(reply.request_id, self.helpdesk_request.id)
        self.assertEqual(reply.content, "Yes. It is still on fire.")
        # The reply came from the customer, so it must not be attributed to an agent.
        self.assertIsNone(reply.actor)

    def test_attachment_reaches_the_customer_intact(self):
        """The bytes that leave on the wire must be the bytes that were stored.

        Metadata alone would pass even if the payload were empty, so this
        compares the downloaded part against what went in.
        """
        from plane.app.helpdesk.attachments import COMMENT_ENTITY, bind_assets
        from plane.db.models import FileAsset

        payload = b"traceback: everything is on fire"
        asset = FileAsset.objects.create(
            attributes={"name": "erro.txt", "type": "text/plain", "size": len(payload)},
            asset=f"{self.workspace.id}/e2e-erro.txt",
            size=len(payload),
            workspace=self.workspace,
            entity_type=COMMENT_ENTITY,
            is_uploaded=True,
        )

        response = self._post_comment("Segue o log.")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        comment_id = response.data["id"]

        # The comment already went out without the file, so send a second one
        # with the asset bound and read the storage through a stub -- the e2e
        # environment has no guarantee of a reachable bucket.
        bind_assets(
            [asset.id],
            workspace_id=self.workspace.id,
            entity_type=COMMENT_ENTITY,
            entity_identifier=comment_id,
        )
        mailpit.clear()

        with mock.patch("plane.bgtasks.helpdesk_email_task.S3Storage") as storage_cls:
            storage_cls.return_value.read_object.return_value = payload
            from plane.bgtasks.helpdesk_email_task import send_helpdesk_comment_email

            comment = HelpdeskRequestComment.objects.get(id=comment_id)
            comment.email_status = HelpdeskRequestComment.EmailDeliveryStatus.PENDING
            comment.email_message_id = None
            comment.save(update_fields=["email_status", "email_message_id"])
            send_helpdesk_comment_email(comment_id)

        message = mailpit.only_message()
        parts = mailpit.attachments(message["ID"])
        self.assertEqual(len(parts), 1)
        self.assertEqual(parts[0]["FileName"], "erro.txt")
        self.assertEqual(mailpit.download_attachment(message["ID"], parts[0]["PartID"]), payload)

    def test_internal_note_attachment_never_leaves(self):
        """RC-2 extended to files: an internal note's attachment must not ship."""
        with mock.patch("plane.bgtasks.helpdesk_email_task.S3Storage") as storage_cls:
            from plane.bgtasks.helpdesk_email_task import send_helpdesk_comment_email

            comment = HelpdeskRequestComment.objects.create(
                workspace=self.workspace,
                request=self.helpdesk_request,
                actor=self.agent,
                content="Nota interna com anexo.",
                is_internal=True,
                delivery_channels=["email"],
                email_status=HelpdeskRequestComment.EmailDeliveryStatus.PENDING,
            )
            send_helpdesk_comment_email(comment.id)

        self.assertEqual(mailpit.count(), 0)
        # The guard must short-circuit before storage is touched at all.
        storage_cls.return_value.read_object.assert_not_called()

    def test_second_outbound_message_references_the_first(self):
        """Threading headers must chain, or clients render the thread as separate mails."""
        self._post_comment("First reply.")
        first_message_id = mailpit.header(mailpit.only_message()["ID"], "Message-ID")

        mailpit.clear()
        self._post_comment("Second reply.")
        second = mailpit.only_message()

        self.assertEqual(mailpit.header(second["ID"], "In-Reply-To"), first_message_id)
        references = mailpit.header(second["ID"], "References")
        self.assertIn(first_message_id, references)
        # Distinct identifiers, or every message collapses into one in the client.
        self.assertNotEqual(mailpit.header(second["ID"], "Message-ID"), first_message_id)
