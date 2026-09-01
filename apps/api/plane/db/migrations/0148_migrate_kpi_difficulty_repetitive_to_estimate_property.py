from django.db import migrations

ROLES = (
    ("difficulty", "Difficulty", "difficulty_estimate_id", "difficulty_estimate_point_id"),
    ("repetitive", "Repetitive", "repetitive_estimate_id", "repetitive_estimate_point_id"),
)


def migrate_kpi_difficulty_repetitive_to_estimate_property(apps, schema_editor):
    """
    KpiConfig.difficulty_estimate/repetitive_estimate and KpiIssueAttribute.
    difficulty_estimate_point/repetitive_estimate_point are being generalized
    into EstimateProperty (project-scoped, kpi_role-tagged) and
    IssueEstimatePropertyValue (per issue+property). Move existing data across
    before the next migration removes the old columns.

    Historical models from apps.get_model() don't run ProjectBaseModel.save()'s
    workspace-from-project auto-derivation, so workspace is set explicitly here.
    """
    KpiConfig = apps.get_model("db", "KpiConfig")
    KpiIssueAttribute = apps.get_model("db", "KpiIssueAttribute")
    EstimateProperty = apps.get_model("db", "EstimateProperty")
    IssueEstimatePropertyValue = apps.get_model("db", "IssueEstimatePropertyValue")

    # project_id -> {"difficulty": property_id, "repetitive": property_id}
    property_ids_by_project = {}

    for config in KpiConfig.objects.filter(project__isnull=False, deleted_at__isnull=True):
        for role, label, estimate_field, _ in ROLES:
            estimate_id = getattr(config, estimate_field)
            if not estimate_id:
                continue
            prop = EstimateProperty.objects.create(
                name=label,
                estimate_id=estimate_id,
                project_id=config.project_id,
                workspace_id=config.workspace_id,
                is_active=True,
                kpi_role=role,
            )
            property_ids_by_project.setdefault(config.project_id, {})[role] = prop.id

    for attribute in KpiIssueAttribute.objects.filter(project__isnull=False, deleted_at__isnull=True):
        project_property_ids = property_ids_by_project.get(attribute.project_id, {})
        for role, _, _, point_field in ROLES:
            point_id = getattr(attribute, point_field)
            if not point_id:
                continue
            property_id = project_property_ids.get(role)
            if property_id is None:
                # KpiIssueAttribute referenced a point without the matching
                # KpiConfig.*_estimate set -- shouldn't happen given the
                # app-level validation that required it, but skip defensively
                # rather than crash the migration.
                continue
            IssueEstimatePropertyValue.objects.create(
                issue_id=attribute.issue_id,
                property_id=property_id,
                estimate_point_id=point_id,
                project_id=attribute.project_id,
                workspace_id=attribute.workspace_id,
            )


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0147_estimate_property"),
    ]

    operations = [
        migrations.RunPython(migrate_kpi_difficulty_repetitive_to_estimate_property, migrations.RunPython.noop),
    ]
