# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Attachment helpers shared by every helpdesk write path.

There is no single place a helpdesk comment is created: the agent viewset goes
through the serializer, the public portal endpoint calls ``objects.create()``
directly, and the inbound email webhook builds one from a parsed message. Rather
than refactor those onto a common serializer -- which would change the public
endpoint's error behaviour -- they all call into this module.

Assets are linked through ``entity_type``/``entity_identifier`` rather than a
foreign key. See the comment on ``FileAsset.EntityTypeContext`` for why.
"""

# Python imports
import hashlib
import logging
import uuid
from datetime import timedelta
from io import BytesIO

# Django imports
from django.conf import settings
from django.utils import timezone

# Module imports
from plane.db.models import FileAsset
from plane.settings.storage import S3Storage
from plane.utils.exception_logger import log_exception
from plane.utils.path_validator import sanitize_filename

logger = logging.getLogger("plane.worker")

COMMENT_ENTITY = FileAsset.EntityTypeContext.HELPDESK_COMMENT_ATTACHMENT
REQUEST_ENTITY = FileAsset.EntityTypeContext.HELPDESK_REQUEST_ATTACHMENT

# How long an uploaded-but-unbound asset stays claimable. Long enough for a
# customer to write a message after picking a file, short enough that a leaked
# asset id is not claimable forever.
CLAIM_WINDOW = timedelta(hours=24)


def synthesize_content(attachment_count):
    """Body text for a message that carried only attachments.

    HelpdeskRequestComment.content is non-null and every consumer assumes it is
    non-empty -- the outbound task interpolates it straight into the email body,
    for one. Rather than relax that invariant across the whole feature, an
    attachment-only inbound email gets a line describing what arrived. It says
    what happened instead of inventing words the customer did not write.
    """
    if attachment_count == 1:
        return "(mensagem sem texto — 1 anexo)"
    return f"(mensagem sem texto — {attachment_count} anexos)"


def attachments_fingerprint(attachments):
    """Stable digest of a set of files, for inbound de-duplication.

    The inbound webhook derives a synthetic Message-ID from the body when the
    email carries no Message-ID header. For an attachment-only message the body
    is empty, so two different messages from the same sender in the same second
    would collide and the second would be dropped as a duplicate. Hashing the
    files keeps them distinct.
    """
    parts = sorted(f"{name}:{size}" for name, size in attachments)
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()


def bind_assets(asset_ids, *, workspace_id, entity_type, entity_identifier):
    """Attach previously uploaded assets to a comment or request.

    Files are uploaded before the thing they belong to exists, so they start
    life unbound and are claimed here. Returns how many were actually bound.

    The filter is the security boundary. An asset is claimable only when it is
    still unbound, belongs to the same workspace, finished uploading, and is
    recent -- so a leaked id cannot be used to graft someone else's file onto a
    ticket, nor to re-point a file that is already attached somewhere.
    """
    if not asset_ids:
        return 0

    if not isinstance(asset_ids, (list, tuple)):
        return 0

    valid_ids = []
    for asset_id in asset_ids[: settings.HELPDESK_MAX_ATTACHMENTS_PER_COMMENT]:
        try:
            valid_ids.append(uuid.UUID(str(asset_id)))
        except (ValueError, AttributeError, TypeError):
            continue

    if not valid_ids:
        return 0

    return FileAsset.objects.filter(
        id__in=valid_ids,
        workspace_id=workspace_id,
        entity_type__in=[COMMENT_ENTITY, REQUEST_ENTITY],
        entity_identifier__isnull=True,
        is_uploaded=True,
        is_deleted=False,
        created_at__gte=timezone.now() - CLAIM_WINDOW,
    ).update(entity_type=entity_type, entity_identifier=str(entity_identifier))


def assets_for(entity_type, identifiers):
    """Bulk-fetch assets for many entities at once, keyed by identifier.

    Without this the comment list would issue one query per comment. The
    composite index asset_entity_idx covers this lookup.
    """
    identifiers = [str(identifier) for identifier in identifiers if identifier]
    if not identifiers:
        return {}

    grouped = {}
    assets = FileAsset.objects.filter(
        entity_type=entity_type,
        entity_identifier__in=identifiers,
        is_uploaded=True,
        is_deleted=False,
    ).order_by("created_at")

    for asset in assets:
        grouped.setdefault(asset.entity_identifier, []).append(asset)
    return grouped


def store_inbound_attachment(uploaded_file, *, workspace_id):
    """Persist a file that arrived on the inbound email webhook.

    Unlike the browser flow there is no presigned round trip here -- the bytes
    are already in hand, so they go straight to the bucket. Mirrors the OAuth
    avatar ingestion in plane/authentication/adapter/base.py.

    Returns the FileAsset, or None when the file is rejected or the upload
    fails. Callers should treat None as "skip this file", never as fatal: one
    bad attachment must not cost the customer their message.
    """
    content_type = getattr(uploaded_file, "content_type", None) or "application/octet-stream"
    size = getattr(uploaded_file, "size", 0) or 0
    original_name = sanitize_filename(getattr(uploaded_file, "name", "") or "attachment")

    if content_type not in settings.ATTACHMENT_MIME_TYPES:
        logger.warning("helpdesk inbound attachment skipped: unsupported type %s", content_type)
        return None

    if size <= 0 or size > settings.FILE_SIZE_LIMIT:
        logger.warning("helpdesk inbound attachment skipped: size %s outside limits", size)
        return None

    # No request object here: this runs from the webhook and, for the outbound
    # side, from a Celery worker. Both need the internal endpoint, not the
    # browser-facing one MinIO hands out when a request is passed.
    storage = S3Storage()
    object_name = f"{workspace_id}/{uuid.uuid4().hex}-{original_name}"

    try:
        file_obj = BytesIO(uploaded_file.read())
        file_obj.seek(0)
        if not storage.upload_file(file_obj=file_obj, object_name=object_name, content_type=content_type):
            return None
    except Exception as e:
        log_exception(e)
        return None

    return FileAsset.objects.create(
        attributes={"name": original_name, "type": content_type, "size": size},
        asset=object_name,
        size=size,
        workspace_id=workspace_id,
        entity_type=COMMENT_ENTITY,
        is_uploaded=True,
        storage_metadata=storage.get_object_metadata(object_name=object_name),
    )
