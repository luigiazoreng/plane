from django.db import migrations


def backfill_estimate_default_properties(apps, schema_editor):
    """
    Auto-create the "default" EstimateProperty row (is_estimate_default=True)
    for every Estimate that is currently active (last_used=True) -- giving the
    new per-system Properties panel UI a row to render for every active
    estimate system, even before any per-issue value is set.

    Also migrates every existing Issue.estimate_point value into the matching
    IssueEstimatePropertyValue against that default property, so historical
    single-value data isn't lost when the UI switches to reading per-system
    values. This covers issues whose estimate_point belongs to an estimate
    that is NOT last_used=True (stale/historical data) too -- the default
    property is created for that estimate as well, rather than dropping the
    value.

    Historical models from apps.get_model() don't run ProjectBaseModel.save()'s
    workspace-from-project auto-derivation, so workspace_id/project_id are set
    explicitly here (same pattern as 0148).
    """
    Estimate = apps.get_model("db", "Estimate")
    EstimatePoint = apps.get_model("db", "EstimatePoint")
    EstimateProperty = apps.get_model("db", "EstimateProperty")
    Issue = apps.get_model("db", "Issue")
    IssueEstimatePropertyValue = apps.get_model("db", "IssueEstimatePropertyValue")

    def ensure_default_property(estimate):
        default_property, _ = EstimateProperty.objects.get_or_create(
            project_id=estimate.project_id,
            estimate_id=estimate.id,
            is_estimate_default=True,
            deleted_at__isnull=True,
            defaults={
                "name": estimate.name,
                "workspace_id": estimate.workspace_id,
                "kpi_role": None,
            },
        )
        return default_property

    # Step 1: every currently-active estimate gets a default property, even if
    # no issue references it yet (so the UI has a row to render).
    for estimate in Estimate.objects.filter(last_used=True, deleted_at__isnull=True):
        ensure_default_property(estimate)

    # Step 2: migrate every existing Issue.estimate_point into a per-system
    # value against its (possibly newly-created) default property. Covers
    # estimates that are NOT last_used=True too (stale data still preserved).
    for issue in (
        Issue.issue_objects.filter(estimate_point__isnull=False, deleted_at__isnull=True)
        .select_related("estimate_point")
        .iterator(chunk_size=500)
    ):
        point = issue.estimate_point
        if point is None:
            continue
        estimate = Estimate.objects.filter(pk=point.estimate_id).first()
        if estimate is None:
            continue
        default_property = ensure_default_property(estimate)
        IssueEstimatePropertyValue.objects.get_or_create(
            issue_id=issue.id,
            property_id=default_property.id,
            deleted_at__isnull=True,
            defaults={
                "estimate_point_id": point.id,
                "project_id": issue.project_id,
                "workspace_id": issue.workspace_id,
            },
        )


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0150_estimateproperty_is_estimate_default"),
    ]

    operations = [
        migrations.RunPython(backfill_estimate_default_properties, migrations.RunPython.noop),
    ]
