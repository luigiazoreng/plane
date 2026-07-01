from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import plane.db.models.kpi
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0139_alter_helpdeskmember_created_by_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="KpiConfig",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                ("id", models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ("name", models.CharField(default="KPI Configuration", max_length=255)),
                ("tables", models.JSONField(blank=True, default=plane.db.models.kpi.default_kpi_tables)),
                ("penalty_mode", models.CharField(choices=[("continuous", "Continuous"), ("dead_zone", "Dead Zone")], default="continuous", max_length=20)),
                ("k", models.FloatField(default=0.5)),
                ("day_count", models.CharField(choices=[("calendar", "Calendar"), ("business", "Business")], default="calendar", max_length=20)),
                ("day_rounding", models.CharField(choices=[("truncate", "Truncate"), ("round", "Round"), ("ceil", "Ceil")], default="truncate", max_length=20)),
                ("allow_negative", models.BooleanField(default=True)),
                ("max_multiplier", models.FloatField(blank=True, null=True)),
                ("vf_decimals", models.PositiveSmallIntegerField(default=2)),
                ("is_active", models.BooleanField(default=True)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_created_by", to=settings.AUTH_USER_MODEL, verbose_name="Created By")),
                ("updated_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_updated_by", to=settings.AUTH_USER_MODEL, verbose_name="Last Modified By")),
                ("project", models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name="project_%(class)s", to="db.project")),
                ("workspace", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="workspace_%(class)s", to="db.workspace")),
            ],
            options={
                "verbose_name": "KPI Config",
                "verbose_name_plural": "KPI Configs",
                "db_table": "kpi_configs",
                "ordering": ("-created_at",),
                "unique_together": {("workspace", "project", "deleted_at")},
            },
        ),
        migrations.CreateModel(
            name="KpiIssueAttribute",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                ("id", models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ("difficulty", models.CharField(blank=True, max_length=255, null=True)),
                ("repetitive", models.CharField(blank=True, max_length=255, null=True)),
                ("importance", models.CharField(blank=True, max_length=255, null=True)),
                ("type_override", models.CharField(blank=True, max_length=255, null=True)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_created_by", to=settings.AUTH_USER_MODEL, verbose_name="Created By")),
                ("updated_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_updated_by", to=settings.AUTH_USER_MODEL, verbose_name="Last Modified By")),
                ("issue", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="kpi_attribute", to="db.issue")),
                ("project", models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name="project_%(class)s", to="db.project")),
                ("workspace", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="workspace_%(class)s", to="db.workspace")),
            ],
            options={
                "verbose_name": "KPI Issue Attribute",
                "verbose_name_plural": "KPI Issue Attributes",
                "db_table": "kpi_issue_attributes",
                "ordering": ("-created_at",),
                "unique_together": {("issue", "deleted_at")},
            },
        ),
    ]
