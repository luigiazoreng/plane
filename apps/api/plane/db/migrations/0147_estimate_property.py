import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0146_project_kpi_view"),
    ]

    operations = [
        migrations.CreateModel(
            name="EstimateProperty",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                (
                    "id",
                    models.UUIDField(
                        db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True
                    ),
                ),
                ("name", models.CharField(max_length=255)),
                ("is_active", models.BooleanField(default=True)),
                ("sort_order", models.FloatField(default=65535)),
                (
                    "kpi_role",
                    models.CharField(
                        blank=True,
                        choices=[("difficulty", "Difficulty"), ("repetitive", "Repetitive")],
                        max_length=32,
                        null=True,
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "estimate",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE, related_name="properties", to="db.estimate"
                    ),
                ),
                (
                    "project",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE, related_name="project_%(class)s", to="db.project"
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE, related_name="workspace_%(class)s", to="db.workspace"
                    ),
                ),
            ],
            options={
                "verbose_name": "Estimate Property",
                "verbose_name_plural": "Estimate Properties",
                "db_table": "estimate_properties",
                "ordering": ("sort_order",),
            },
        ),
        migrations.CreateModel(
            name="IssueEstimatePropertyValue",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                (
                    "id",
                    models.UUIDField(
                        db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "issue",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="estimate_property_values",
                        to="db.issue",
                    ),
                ),
                (
                    "property",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="issue_values",
                        to="db.estimateproperty",
                    ),
                ),
                (
                    "estimate_point",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="issue_property_values",
                        to="db.estimatepoint",
                    ),
                ),
                (
                    "project",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE, related_name="project_%(class)s", to="db.project"
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE, related_name="workspace_%(class)s", to="db.workspace"
                    ),
                ),
            ],
            options={
                "verbose_name": "Issue Estimate Property Value",
                "verbose_name_plural": "Issue Estimate Property Values",
                "db_table": "issue_estimate_property_values",
            },
        ),
        migrations.AddConstraint(
            model_name="estimateproperty",
            constraint=models.UniqueConstraint(
                condition=models.Q(("kpi_role__isnull", False), ("deleted_at__isnull", True)),
                fields=("project", "kpi_role"),
                name="estimateproperty_unique_kpi_role_per_project",
            ),
        ),
        migrations.AddConstraint(
            model_name="issueestimatepropertyvalue",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("issue", "property"),
                name="issueestimatepropertyvalue_unique_issue_property_when_not_deleted",
            ),
        ),
    ]
