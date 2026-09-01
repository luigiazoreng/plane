from django.db import migrations, models


def normalize_duplicate_email_message_ids(apps, schema_editor):
    """Keep the oldest row of each duplicate group, NULL out the rest.

    Without this the partial unique index fails to build on deploy.

    The historical model uses a plain models.Manager (no soft-delete filter),
    so the queryset sees every row -- the deleted_at filter has to be explicit
    to match the index condition.
    """
    HelpdeskRequestComment = apps.get_model("db", "HelpdeskRequestComment")

    live = HelpdeskRequestComment.objects.filter(
        deleted_at__isnull=True, email_message_id__isnull=False
    )
    duplicated_ids = (
        live.values_list("email_message_id", flat=True)
        .annotate(total=models.Count("id"))
        .filter(total__gt=1)
    )

    for message_id in list(duplicated_ids):
        rows = list(
            live.filter(email_message_id=message_id).order_by("created_at").values_list("id", flat=True)
        )
        # rows[0] is the oldest and keeps the identifier
        HelpdeskRequestComment.objects.filter(id__in=rows[1:]).update(email_message_id=None)


def normalize_portal_tls_ssl(apps, schema_editor):
    """A portal cannot have both TLS and SSL on; the CheckConstraint would fail."""
    HelpdeskPortal = apps.get_model("db", "HelpdeskPortal")

    conflicting = HelpdeskPortal.objects.filter(smtp_use_tls=True, smtp_use_ssl=True)
    # Port 465 is implicit SSL, anything else is STARTTLS
    conflicting.filter(smtp_port=465).update(smtp_use_tls=False)
    conflicting.exclude(smtp_port=465).update(smtp_use_ssl=False)


def normalize_internal_comment_delivery_channels(apps, schema_editor):
    """Drop "email" from delivery_channels of internal notes.

    These rows are the RC-2 bug itself. Removing them here is what lets the new
    serializer validate() stay permissive for PATCHes that touch neither field,
    instead of turning legacy rows permanently uneditable.
    """
    HelpdeskRequestComment = apps.get_model("db", "HelpdeskRequestComment")

    for comment in HelpdeskRequestComment.objects.filter(is_internal=True).iterator():
        channels = comment.delivery_channels
        # delivery_channels is JSONField(blank=True): tolerate None or non-list
        if not isinstance(channels, list) or "email" not in channels:
            continue
        comment.delivery_channels = [channel for channel in channels if channel != "email"]
        comment.save(update_fields=["delivery_channels"])


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0154_helpdeskrequestcomment_email_error"),
    ]

    operations = [
        # Data normalisation must precede the constraints, otherwise they fail
        # to be added on a database that holds violating rows.
        migrations.RunPython(
            normalize_duplicate_email_message_ids, migrations.RunPython.noop
        ),
        migrations.RunPython(normalize_portal_tls_ssl, migrations.RunPython.noop),
        migrations.RunPython(
            normalize_internal_comment_delivery_channels, migrations.RunPython.noop
        ),
        migrations.AddConstraint(
            model_name="helpdeskrequestcomment",
            constraint=models.UniqueConstraint(
                condition=models.Q(
                    ("deleted_at__isnull", True), ("email_message_id__isnull", False)
                ),
                fields=("email_message_id",),
                name="helpdesk_comment_unique_email_message_id",
            ),
        ),
        migrations.AddConstraint(
            model_name="helpdeskportal",
            constraint=models.CheckConstraint(
                check=models.Q(
                    ("smtp_use_tls", True), ("smtp_use_ssl", True), _negated=True
                ),
                name="helpdesk_portal_smtp_tls_ssl_exclusive",
            ),
        ),
    ]
