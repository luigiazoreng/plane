# Third-party imports
from django.test import TestCase

# Module imports
from plane.app.serializers.helpdesk import (
    HelpdeskPortalSerializer,
    HelpdeskRequestCommentSerializer,
)
from plane.db.models import HelpdeskPortal, HelpdeskRequest, HelpdeskRequestComment
from plane.tests.factories import WorkspaceFactory


class TestHelpdeskPortalSmtpValidation(TestCase):
    """T9 (RC-4): TLS e SSL são mutuamente exclusivos no backend SMTP do Django."""

    def setUp(self):
        self.workspace = WorkspaceFactory.create()

    def _payload(self, **overrides):
        payload = {
            "workspace": self.workspace.id,
            "public_slug": "portal-smtp",
            "smtp_host": "smtp.example.com",
            "smtp_port": 587,
        }
        payload.update(overrides)
        return payload

    def test_rejects_tls_and_ssl_together(self):
        serializer = HelpdeskPortalSerializer(
            data=self._payload(smtp_use_tls=True, smtp_use_ssl=True)
        )
        self.assertFalse(serializer.is_valid())
        self.assertTrue(
            {"smtp_use_tls", "smtp_use_ssl"} & set(serializer.errors)
            or "non_field_errors" in serializer.errors
        )

    def test_accepts_each_mode_alone(self):
        for tls, ssl in ((True, False), (False, True), (False, False)):
            with self.subTest(tls=tls, ssl=ssl):
                serializer = HelpdeskPortalSerializer(
                    data=self._payload(smtp_use_tls=tls, smtp_use_ssl=ssl)
                )
                self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_patch_that_introduces_the_conflict_is_rejected(self):
        """Cobre o fallback getattr(instance, ...) em PATCH parcial."""
        portal = HelpdeskPortal.objects.create(
            workspace=self.workspace,
            public_slug="portal-existing",
            smtp_use_tls=True,
        )

        serializer = HelpdeskPortalSerializer(
            portal, data={"smtp_use_ssl": True}, partial=True
        )
        self.assertFalse(serializer.is_valid())


class TestHelpdeskCommentInternalNoteValidation(TestCase):
    """T7/T11 (RC-2): nota interna nunca pode sair pelo canal de email."""

    def setUp(self):
        self.workspace = WorkspaceFactory.create()
        self.portal = HelpdeskPortal.objects.create(
            workspace=self.workspace, public_slug="portal-comments"
        )
        self.request = HelpdeskRequest.objects.create(
            workspace=self.workspace,
            portal=self.portal,
            title="Ticket",
            contact_email="customer@example.com",
        )

    def test_rejects_internal_note_delivered_by_email(self):
        serializer = HelpdeskRequestCommentSerializer(
            data={
                "content": "Internal only",
                "is_internal": True,
                "delivery_channels": ["email"],
            }
        )
        self.assertFalse(serializer.is_valid())
        self.assertTrue(
            {"is_internal", "delivery_channels"} & set(serializer.errors)
            or "non_field_errors" in serializer.errors
        )

    def test_accepts_valid_combinations(self):
        cases = [
            {"is_internal": True, "delivery_channels": []},
            {"is_internal": False, "delivery_channels": ["email"]},
            {"is_internal": False, "delivery_channels": []},
        ]
        for case in cases:
            with self.subTest(**case):
                serializer = HelpdeskRequestCommentSerializer(
                    data={"content": "Body", **case}
                )
                self.assertTrue(serializer.is_valid(), serializer.errors)

    def _legacy_comment(self):
        """Uma linha gravada com a combinação proibida — o próprio bug RC-2."""
        return HelpdeskRequestComment.objects.create(
            workspace=self.workspace,
            request=self.request,
            content="Legacy internal note",
            is_internal=True,
            delivery_channels=["email"],
        )

    def test_legacy_comment_stays_editable(self):
        """T11 (RC-2, regressão): PATCH que não toca nos dois campos continua válido."""
        comment = self._legacy_comment()

        serializer = HelpdeskRequestCommentSerializer(
            comment, data={"content": "Corrected text"}, partial=True
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_legacy_comment_rejects_reaffirming_the_forbidden_pair(self):
        """T11: se o payload reafirma a combinação, aí sim é 400."""
        comment = self._legacy_comment()

        serializer = HelpdeskRequestCommentSerializer(
            comment, data={"delivery_channels": ["email"]}, partial=True
        )
        self.assertFalse(serializer.is_valid())

    def test_patch_adding_email_to_internal_comment_is_rejected(self):
        comment = HelpdeskRequestComment.objects.create(
            workspace=self.workspace,
            request=self.request,
            content="Internal note",
            is_internal=True,
            delivery_channels=[],
        )

        serializer = HelpdeskRequestCommentSerializer(
            comment, data={"delivery_channels": ["email"]}, partial=True
        )
        self.assertFalse(serializer.is_valid())
