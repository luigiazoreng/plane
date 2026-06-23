from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0134_helpdeskrequest_import_fields"),
    ]

    operations = [
        migrations.CreateModel(
            name="HelpdeskMember",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                ("id", models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ("role", models.PositiveSmallIntegerField(choices=[(20, "Admin"), (15, "Member"), (5, "Guest")], default=15)),
                ("is_active", models.BooleanField(default=True)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_created_by", to=settings.AUTH_USER_MODEL, verbose_name="Created By")),
                ("updated_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_updated_by", to=settings.AUTH_USER_MODEL, verbose_name="Last Modified By")),
                ("project", models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name="project_%(class)s", to="db.project")),
                ("workspace", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="workspace_%(class)s", to="db.workspace")),
                ("member", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="helpdesk_memberships", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "verbose_name": "Helpdesk Member",
                "verbose_name_plural": "Helpdesk Members",
                "db_table": "helpdesk_members",
                "ordering": ("-created_at",),
                "unique_together": {("workspace", "member", "deleted_at")},
            },
        ),
    ]
