# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import os
from datetime import timedelta

# Django imports
from django.utils import timezone
from django.db.models import Q

# Third party imports
from celery import shared_task

# Module imports
from plane.db.models import FileAsset


@shared_task
def delete_unuploaded_file_asset():
    """This task deletes unuploaded file assets older than a certain number of days."""
    FileAsset.objects.filter(
        Q(created_at__lt=timezone.now() - timedelta(days=int(os.environ.get("UNUPLOADED_ASSET_DELETE_DAYS", "7"))))
        & Q(is_uploaded=False)
    ).delete()


@shared_task
def delete_unbound_helpdesk_assets():
    """Delete helpdesk attachments that were uploaded but never sent.

    A user who picks a file and then abandons the reply leaves an asset that
    finished uploading but was never claimed by a comment. delete_unuploaded_file_asset
    does not catch these -- it only looks at is_uploaded=False -- so without
    this they accumulate in the bucket forever.

    The window is deliberately longer than attachments.CLAIM_WINDOW so that an
    asset is never collected while it is still claimable.
    """
    FileAsset.objects.filter(
        entity_type__in=[
            FileAsset.EntityTypeContext.HELPDESK_COMMENT_ATTACHMENT,
            FileAsset.EntityTypeContext.HELPDESK_REQUEST_ATTACHMENT,
        ],
        entity_identifier__isnull=True,
        created_at__lt=timezone.now() - timedelta(days=int(os.environ.get("UNBOUND_ASSET_DELETE_DAYS", "2"))),
    ).delete()
