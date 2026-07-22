# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Tests for the helpdesk attachment helpers and the inbound attachment path."""

# Python imports
import uuid
from datetime import timedelta
from unittest import mock

# Django imports
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

# Third-party imports
from rest_framework import status
from rest_framework.test import APITestCase

# Module imports
from plane.app.helpdesk.attachments import (
    COMMENT_ENTITY,
    REQUEST_ENTITY,
    attachments_fingerprint,
    bind_assets,
    synthesize_content,
)
from plane.db.models import FileAsset, HelpdeskPortal, HelpdeskRequest, HelpdeskRequestComment
from plane.tests.factories import UserFactory, WorkspaceFactory

INBOUND_SECRET = "test-inbound-secret"


def make_asset(workspace, *, is_uploaded=True, entity_identifier=None, entity_type=COMMENT_ENTITY):
    return FileAsset.objects.create(
        attributes={"name": "log.txt", "type": "text/plain", "size": 12},
        asset=f"{workspace.id}/{uuid.uuid4().hex}-log.txt",
        size=12,
        workspace=workspace,
        entity_type=entity_type,
        entity_identifier=entity_identifier,
        is_uploaded=is_uploaded,
    )


class TestBindAssets(TestCase):
    """bind_assets is the claim boundary -- these are its refusals."""

    def setUp(self):
        # UserFactory leaves username blank and the column is unique, so two
        # factory-built workspaces in one test collide on their owners.
        self.workspace = WorkspaceFactory.create(owner=UserFactory.create(username="owner-a"))
        self.other_workspace = WorkspaceFactory.create(owner=UserFactory.create(username="owner-b"))
        self.portal = HelpdeskPortal.objects.create(workspace=self.workspace, public_slug="p1")
        self.request = HelpdeskRequest.objects.create(
            workspace=self.workspace, portal=self.portal, title="t", description="d"
        )
        self.comment = HelpdeskRequestComment.objects.create(
            workspace=self.workspace, request=self.request, content="hello"
        )

    def test_binds_a_valid_asset(self):
        asset = make_asset(self.workspace)
        bound = bind_assets(
            [asset.id],
            workspace_id=self.workspace.id,
            entity_type=COMMENT_ENTITY,
            entity_identifier=self.comment.id,
        )
        self.assertEqual(bound, 1)
        asset.refresh_from_db()
        self.assertEqual(asset.entity_identifier, str(self.comment.id))

    def test_refuses_asset_from_another_workspace(self):
        asset = make_asset(self.other_workspace)
        bound = bind_assets(
            [asset.id],
            workspace_id=self.workspace.id,
            entity_type=COMMENT_ENTITY,
            entity_identifier=self.comment.id,
        )
        self.assertEqual(bound, 0)
        asset.refresh_from_db()
        self.assertIsNone(asset.entity_identifier)

    def test_refuses_asset_that_is_already_bound(self):
        """A leaked id must not re-point a file already attached elsewhere."""
        asset = make_asset(self.workspace, entity_identifier=str(uuid.uuid4()))
        original = asset.entity_identifier
        bound = bind_assets(
            [asset.id],
            workspace_id=self.workspace.id,
            entity_type=COMMENT_ENTITY,
            entity_identifier=self.comment.id,
        )
        self.assertEqual(bound, 0)
        asset.refresh_from_db()
        self.assertEqual(asset.entity_identifier, original)

    def test_refuses_asset_that_never_finished_uploading(self):
        asset = make_asset(self.workspace, is_uploaded=False)
        bound = bind_assets(
            [asset.id],
            workspace_id=self.workspace.id,
            entity_type=COMMENT_ENTITY,
            entity_identifier=self.comment.id,
        )
        self.assertEqual(bound, 0)

    def test_refuses_asset_older_than_the_claim_window(self):
        asset = make_asset(self.workspace)
        FileAsset.objects.filter(id=asset.id).update(created_at=timezone.now() - timedelta(hours=48))
        bound = bind_assets(
            [asset.id],
            workspace_id=self.workspace.id,
            entity_type=COMMENT_ENTITY,
            entity_identifier=self.comment.id,
        )
        self.assertEqual(bound, 0)

    @override_settings(HELPDESK_MAX_ATTACHMENTS_PER_COMMENT=2)
    def test_caps_the_number_of_attachments(self):
        assets = [make_asset(self.workspace) for _ in range(4)]
        bound = bind_assets(
            [a.id for a in assets],
            workspace_id=self.workspace.id,
            entity_type=COMMENT_ENTITY,
            entity_identifier=self.comment.id,
        )
        self.assertEqual(bound, 2)

    def test_tolerates_garbage_input(self):
        for payload in [None, "", [], "not-a-list", ["not-a-uuid"]]:
            self.assertEqual(
                bind_assets(
                    payload,
                    workspace_id=self.workspace.id,
                    entity_type=COMMENT_ENTITY,
                    entity_identifier=self.comment.id,
                ),
                0,
            )


class TestSynthesizedContent(TestCase):
    def test_singular_and_plural(self):
        self.assertIn("1 anexo", synthesize_content(1))
        self.assertIn("3 anexos", synthesize_content(3))

    def test_fingerprint_distinguishes_different_files(self):
        a = attachments_fingerprint([("a.png", 10)])
        b = attachments_fingerprint([("b.png", 10)])
        self.assertNotEqual(a, b)

    def test_fingerprint_is_order_independent(self):
        a = attachments_fingerprint([("a.png", 10), ("b.png", 20)])
        b = attachments_fingerprint([("b.png", 20), ("a.png", 10)])
        self.assertEqual(a, b)


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "helpdesk-attachment-tests",
        }
    }
)
class TestInboundAttachments(APITestCase):
    """The inbound webhook's attachment handling."""

    def _post(self, payload, secret=INBOUND_SECRET, **extra):
        if secret is not None:
            extra["HTTP_X_HELPDESK_INBOUND_SECRET"] = secret
        return self.client.post(self.url, payload, format="multipart", **extra)

    def setUp(self):
        cache.clear()
        patcher = mock.patch(
            "plane.app.helpdesk.inbound_security.get_inbound_secret",
            return_value=INBOUND_SECRET,
        )
        patcher.start()
        self.addCleanup(patcher.stop)

        self.workspace = WorkspaceFactory.create()
        UserFactory.create(email="customer@example.com", username="cust-att")
        self.portal = HelpdeskPortal.objects.create(workspace=self.workspace, public_slug="att-portal")
        self.request = HelpdeskRequest.objects.create(
            workspace=self.workspace,
            portal=self.portal,
            title="Help",
            description="d",
            contact_email="customer@example.com",
        )
        self.parent_message_id = f"<{uuid.uuid4()}@plane.so>"
        HelpdeskRequestComment.objects.create(
            workspace=self.workspace,
            request=self.request,
            content="Original",
            email_status="sent",
            email_message_id=self.parent_message_id,
        )
        self.url = reverse("public-helpdesk-inbound")

    def test_attachment_only_email_is_kept_with_synthesized_body(self):
        """A screenshot with no text is still the customer telling us something."""
        with mock.patch("plane.app.helpdesk.attachments.S3Storage") as storage_cls:
            storage_cls.return_value.upload_file.return_value = True
            storage_cls.return_value.get_object_metadata.return_value = {}
            response = self._post(
                {
                    "headers": f"In-Reply-To: {self.parent_message_id}",
                    "from": "customer@example.com",
                    "text": "",
                    "attachment1": SimpleUploadedFile("erro.png", b"binary", content_type="image/png"),
                }
            )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        comment = HelpdeskRequestComment.objects.exclude(email_message_id=self.parent_message_id).get()
        self.assertIn("anexo", comment.content)
        self.assertEqual(
            FileAsset.objects.filter(
                entity_type=COMMENT_ENTITY, entity_identifier=str(comment.id)
            ).count(),
            1,
        )

    def test_empty_email_without_attachment_is_still_discarded(self):
        """Regression guard: the empty_body discard must survive the reorder."""
        response = self._post(
            {
                "headers": f"In-Reply-To: {self.parent_message_id}",
                "from": "customer@example.com",
                "text": "",
            }
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["detail"], "empty_body")
        self.assertEqual(HelpdeskRequestComment.objects.count(), 1)

    @override_settings(HELPDESK_INBOUND_MAX_BODY_SIZE=10)
    def test_oversized_payload_is_dropped_without_being_parsed(self):
        """200, not 413 -- a retry would be exactly as large."""
        with mock.patch("plane.app.views.helpdesk.inbound.store_inbound_attachment") as store:
            response = self._post(
                {
                    "headers": f"In-Reply-To: {self.parent_message_id}",
                    "from": "customer@example.com",
                    "text": "x" * 500,
                }
            )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["detail"], "payload_too_large")
        store.assert_not_called()

    def test_unauthorized_sender_never_reaches_storage(self):
        """Uploading before authorizing would make this a storage-filling vector."""
        with mock.patch("plane.app.views.helpdesk.inbound.store_inbound_attachment") as store:
            response = self._post(
                {
                    "headers": f"In-Reply-To: {self.parent_message_id}",
                    "from": "stranger@evil.com",
                    "text": "let me in",
                    "attachment1": SimpleUploadedFile("x.png", b"b", content_type="image/png"),
                }
            )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["detail"], "unauthorized_sender")
        store.assert_not_called()

    def test_two_attachment_only_emails_with_different_files_both_land(self):
        """Without the fingerprint these would collide on the synthetic id."""
        with mock.patch("plane.app.helpdesk.attachments.S3Storage") as storage_cls:
            storage_cls.return_value.upload_file.return_value = True
            storage_cls.return_value.get_object_metadata.return_value = {}
            base = {
                "headers": f"In-Reply-To: {self.parent_message_id}\nDate: Mon, 1 Jan 2026 10:00:00 +0000",
                "from": "customer@example.com",
                "text": "",
            }
            first = self._post({**base, "attachment1": SimpleUploadedFile("a.png", b"a", content_type="image/png")})
            second = self._post({**base, "attachment1": SimpleUploadedFile("b.png", b"bb", content_type="image/png")})

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertEqual(HelpdeskRequestComment.objects.count(), 3)
