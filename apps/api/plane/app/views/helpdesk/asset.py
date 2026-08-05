# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Attachment upload and download for the helpdesk.

Two surfaces, two endpoints. Agents authenticate as Plane users and are gated by
their helpdesk role. Portal customers are not Plane users at all -- they carry a
HelpdeskCustomer JWT, or nothing on an open portal -- so they cannot use the
generic asset endpoints in plane/app/views/asset/v2.py, every one of which
assumes request.user.

Both follow the same three-step flow as issue attachments: POST metadata to get
a presigned upload, PUT the bytes straight to storage, PATCH to confirm. The
asset is created unbound and is claimed later by the comment or request it is
sent with -- see plane.app.helpdesk.attachments.bind_assets.
"""

# Python imports
import uuid

# Django imports
from django.conf import settings
from django.http import HttpResponseRedirect

# Third party imports
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

# Module imports
from plane.app.helpdesk.attachments import COMMENT_ENTITY, REQUEST_ENTITY
from plane.app.helpdesk.permissions import GUEST, MEMBER, get_helpdesk_role
from plane.app.views.base import BaseAPIView
from plane.bgtasks.storage_metadata_task import get_asset_object_metadata
from plane.db.models import FileAsset, Workspace
from plane.db.models.helpdesk import HelpdeskPortal, HelpdeskRequest, HelpdeskRequestComment
from plane.settings.storage import S3Storage
from plane.throttles.helpdesk import HelpdeskPublicAssetThrottle
from plane.utils.path_validator import sanitize_filename

HELPDESK_ENTITY_TYPES = [COMMENT_ENTITY, REQUEST_ENTITY]


def _validate_upload_payload(data, size_limit):
    """Shared metadata validation. Returns (payload, error_response).

    ``size_limit`` is the portal's effective ceiling, already resolved against
    the instance limit by HelpdeskPortal.effective_max_attachment_size().

    ``entity_type`` defaults to COMMENT_ENTITY when the caller omits it. Any
    caller uploading on behalf of a ticket *request* (the description editor,
    the dedicated attachment field on the submission form) MUST pass
    ``entity_type: "HELPDESK_REQUEST_ATTACHMENT"`` explicitly -- relying on
    the default silently mislabels the asset as a comment attachment, which
    corrupts the request's attachment listing without raising any error. See
    plane/tests/contract/app/test_helpdesk.py::TestUploadCredentials.
    """
    name = sanitize_filename(data.get("name")) or "unnamed"
    file_type = data.get("type", "application/octet-stream")
    entity_type = data.get("entity_type", COMMENT_ENTITY)

    try:
        size = int(data.get("size", 0))
    except (TypeError, ValueError):
        return None, Response({"error": "Invalid file size."}, status=status.HTTP_400_BAD_REQUEST)

    if entity_type not in HELPDESK_ENTITY_TYPES:
        return None, Response({"error": "Invalid entity type."}, status=status.HTTP_400_BAD_REQUEST)

    if file_type not in settings.ATTACHMENT_MIME_TYPES:
        return None, Response({"error": "Unsupported file type."}, status=status.HTTP_400_BAD_REQUEST)

    if size <= 0:
        return None, Response({"error": "Invalid file size."}, status=status.HTTP_400_BAD_REQUEST)

    # Reject rather than clamp. Clamping would hand back a presigned POST whose
    # content-length-range is smaller than the file, so the upload would fail at
    # the storage layer with an opaque error instead of a clear message here.
    if size > size_limit:
        return None, Response(
            {
                "error": "File exceeds the maximum allowed size.",
                "max_size": size_limit,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    return ({"name": name, "type": file_type, "entity_type": entity_type, "size": size}, None)


def _create_presigned_asset(payload, workspace_id, request):
    """Create the unbound FileAsset and return it with its upload credentials."""
    asset_key = f"{workspace_id}/{uuid.uuid4().hex}-{payload['name']}"
    asset = FileAsset.objects.create(
        attributes={"name": payload["name"], "type": payload["type"], "size": payload["size"]},
        asset=asset_key,
        size=payload["size"],
        workspace_id=workspace_id,
        entity_type=payload["entity_type"],
        # entity_identifier stays null until a comment or request claims it.
        is_uploaded=False,
    )
    # request= matters: with MinIO this decides whether the browser gets the
    # externally reachable endpoint or the internal one.
    storage = S3Storage(request=request)
    upload_data = storage.generate_presigned_post(
        object_name=asset_key, file_type=payload["type"], file_size=payload["size"]
    )
    return asset, upload_data


class HelpdeskAssetEndpoint(BaseAPIView):
    """Agent-side attachment upload, confirmation, download and removal."""

    def post(self, request, slug):
        role = get_helpdesk_role(request.user, slug)
        if role is None or role < MEMBER:
            return Response({"error": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        workspace = Workspace.objects.filter(slug=slug).first()
        if not workspace:
            return Response({"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)

        # The agent is replying on a ticket that belongs to a portal, so the
        # portal's ceiling applies to them too -- otherwise an agent could
        # attach a file the customer's own portal would have refused. Falls back
        # to the instance limit when the caller does not say which portal.
        size_limit = settings.FILE_SIZE_LIMIT
        portal_id = request.data.get("portal_id")
        if portal_id:
            portal = HelpdeskPortal.objects.filter(id=portal_id, workspace_id=workspace.id).first()
            if portal:
                size_limit = portal.effective_max_attachment_size()

        payload, error = _validate_upload_payload(request.data, size_limit)
        if error:
            return error

        asset, upload_data = _create_presigned_asset(payload, workspace.id, request)
        return Response(
            {
                "asset_id": str(asset.id),
                "upload_data": upload_data,
                "attributes": asset.attributes,
            },
            status=status.HTTP_200_OK,
        )

    def patch(self, request, slug, asset_id):
        role = get_helpdesk_role(request.user, slug)
        if role is None or role < MEMBER:
            return Response({"error": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        asset = FileAsset.objects.filter(
            id=asset_id, workspace__slug=slug, entity_type__in=HELPDESK_ENTITY_TYPES
        ).first()
        if not asset:
            return Response({"error": "Asset not found."}, status=status.HTTP_404_NOT_FOUND)

        asset.is_uploaded = True
        asset.created_by = request.user
        asset.save(update_fields=["is_uploaded", "created_by"])
        get_asset_object_metadata.delay(str(asset.id))
        return Response(status=status.HTTP_204_NO_CONTENT)

    def delete(self, request, slug, asset_id):
        role = get_helpdesk_role(request.user, slug)
        if role is None or role < MEMBER:
            return Response({"error": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        asset = FileAsset.objects.filter(
            id=asset_id, workspace__slug=slug, entity_type__in=HELPDESK_ENTITY_TYPES
        ).first()
        if not asset:
            return Response({"error": "Asset not found."}, status=status.HTTP_404_NOT_FOUND)

        asset.is_deleted = True
        asset.save(update_fields=["is_deleted"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    def get(self, request, slug, asset_id):
        # Download is readable by any helpdesk role, including GUEST -- agents
        # with read access to a ticket can read its attachments.
        role = get_helpdesk_role(request.user, slug)
        if role is None or role < GUEST:
            return Response({"error": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        asset = FileAsset.objects.filter(
            id=asset_id,
            workspace__slug=slug,
            entity_type__in=HELPDESK_ENTITY_TYPES,
            is_uploaded=True,
            is_deleted=False,
        ).first()
        if not asset:
            return Response({"error": "Asset not found."}, status=status.HTTP_404_NOT_FOUND)

        storage = S3Storage(request=request)
        return HttpResponseRedirect(
            storage.generate_presigned_url(
                object_name=asset.asset.name,
                disposition="attachment",
                filename=(asset.attributes or {}).get("name"),
            )
        )


class PublicHelpdeskAssetEndpoint(BaseAPIView):
    """Attachment upload and download for portal customers.

    Customers are not Plane users, so authentication here is the HelpdeskCustomer
    JWT -- or nothing, on a portal that does not require login.
    """

    permission_classes = [AllowAny]
    throttle_classes = [HelpdeskPublicAssetThrottle]

    def _resolve_portal(self, public_slug):
        return HelpdeskPortal.objects.filter(public_slug=public_slug, is_public=True).first()

    def _resolve_customer(self, request, portal):
        """Returns (customer, error_response).

        Uses the strict token helper, which surfaces expired and malformed
        tokens as 401 instead of silently degrading to anonymous.
        """
        from plane.app.views.helpdesk.form import get_customer_from_token

        customer, error = get_customer_from_token(request)
        if error:
            return None, error
        if portal.require_login and not customer:
            return None, Response({"error": "Authentication required."}, status=status.HTTP_401_UNAUTHORIZED)
        if customer and customer.workspace_id != portal.workspace_id:
            return None, Response({"error": "Access denied."}, status=status.HTTP_403_FORBIDDEN)
        return customer, None

    def post(self, request, public_slug):
        portal = self._resolve_portal(public_slug)
        if not portal:
            return Response({"error": "Portal not found."}, status=status.HTTP_404_NOT_FOUND)

        _, error = self._resolve_customer(request, portal)
        if error:
            return error

        payload, error = _validate_upload_payload(request.data, portal.effective_max_attachment_size())
        if error:
            return error

        asset, upload_data = _create_presigned_asset(payload, portal.workspace_id, request)
        return Response(
            {
                "asset_id": str(asset.id),
                "upload_data": upload_data,
                "attributes": asset.attributes,
            },
            status=status.HTTP_200_OK,
        )

    def patch(self, request, public_slug, asset_id):
        portal = self._resolve_portal(public_slug)
        if not portal:
            return Response({"error": "Portal not found."}, status=status.HTTP_404_NOT_FOUND)

        _, error = self._resolve_customer(request, portal)
        if error:
            return error

        asset = FileAsset.objects.filter(
            id=asset_id,
            workspace_id=portal.workspace_id,
            entity_type__in=HELPDESK_ENTITY_TYPES,
            # Only an unbound asset may be confirmed: once a comment claims it,
            # nobody may touch it through this endpoint again.
            entity_identifier__isnull=True,
        ).first()
        if not asset:
            return Response({"error": "Asset not found."}, status=status.HTTP_404_NOT_FOUND)

        asset.is_uploaded = True
        asset.save(update_fields=["is_uploaded"])
        get_asset_object_metadata.delay(str(asset.id))
        return Response(status=status.HTTP_204_NO_CONTENT)

    def get(self, request, public_slug, asset_id):
        """Download an attachment from the portal.

        This is the leak-prone path: it is reachable without a Plane account, so
        every check below is load-bearing. In particular an attachment on an
        internal note must never be served here -- internal notes are the
        agents' private channel and are already excluded from the public comment
        list.
        """
        portal = self._resolve_portal(public_slug)
        if not portal:
            return Response({"error": "Portal not found."}, status=status.HTTP_404_NOT_FOUND)

        customer, error = self._resolve_customer(request, portal)
        if error:
            return error

        asset = FileAsset.objects.filter(
            id=asset_id,
            workspace_id=portal.workspace_id,
            entity_type__in=HELPDESK_ENTITY_TYPES,
            is_uploaded=True,
            is_deleted=False,
            entity_identifier__isnull=False,
        ).first()
        if not asset:
            return Response({"error": "Asset not found."}, status=status.HTTP_404_NOT_FOUND)

        if not self._is_visible_to_portal(asset, portal, customer):
            # 404 rather than 403: whether an asset exists is itself
            # information, and this endpoint is open to the internet.
            return Response({"error": "Asset not found."}, status=status.HTTP_404_NOT_FOUND)

        storage = S3Storage(request=request)
        return HttpResponseRedirect(
            storage.generate_presigned_url(
                object_name=asset.asset.name,
                disposition="attachment",
                filename=(asset.attributes or {}).get("name"),
            )
        )

    def _is_visible_to_portal(self, asset, portal, customer):
        if asset.entity_type == COMMENT_ENTITY:
            comment = (
                HelpdeskRequestComment.objects.filter(id=asset.entity_identifier)
                .select_related("request")
                .first()
            )
            if not comment or comment.is_internal:
                return False
            if comment.request.portal_id != portal.id:
                return False
            return self._customer_may_read(comment.request, portal, customer)

        hd_request = HelpdeskRequest.objects.filter(id=asset.entity_identifier).first()
        if not hd_request or hd_request.portal_id != portal.id:
            return False
        return self._customer_may_read(hd_request, portal, customer)

    def _customer_may_read(self, hd_request, portal, customer):
        """On a login-required portal, only the ticket's own customer may read.

        Mirrors PublicHelpdeskRequestEndpoint.retrieve: an open portal serves
        anonymously created tickets to anyone holding the ticket id.
        """
        if not portal.require_login:
            return True
        if not customer:
            return False
        return hd_request.customer_id == customer.id
