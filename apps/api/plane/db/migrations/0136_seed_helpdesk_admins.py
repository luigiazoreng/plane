from django.db import migrations


def seed_helpdesk_admins(apps, schema_editor):
    """
    For every workspace that already has at least one HelpdeskPortal,
    add all workspace admins (role=20) as HelpdeskMember with role=20
    if they don't already have a HelpdeskMember record.
    """
    WorkspaceMember = apps.get_model("db", "WorkspaceMember")
    HelpdeskPortal = apps.get_model("db", "HelpdeskPortal")
    HelpdeskMember = apps.get_model("db", "HelpdeskMember")

    workspace_ids_with_portals = set(
        HelpdeskPortal.objects.filter(deleted_at__isnull=True)
        .values_list("workspace_id", flat=True)
        .distinct()
    )

    to_create = []
    for workspace_id in workspace_ids_with_portals:
        admin_member_ids = list(
            WorkspaceMember.objects.filter(
                workspace_id=workspace_id,
                role=20,
                is_active=True,
            ).values_list("member_id", flat=True)
        )
        existing_ids = set(
            HelpdeskMember.objects.filter(
                workspace_id=workspace_id,
                member_id__in=admin_member_ids,
            ).values_list("member_id", flat=True)
        )
        for mid in admin_member_ids:
            if mid not in existing_ids:
                to_create.append(
                    HelpdeskMember(workspace_id=workspace_id, member_id=mid, role=20)
                )

    if to_create:
        HelpdeskMember.objects.bulk_create(to_create, ignore_conflicts=True)


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0135_helpdeskmember"),
    ]

    operations = [
        migrations.RunPython(seed_helpdesk_admins, migrations.RunPython.noop),
    ]
