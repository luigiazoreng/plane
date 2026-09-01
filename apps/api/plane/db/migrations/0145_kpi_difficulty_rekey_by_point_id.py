from django.db import migrations


def rekey_table_by_point_id(config, table_name, estimate_id_field, EstimatePoint):
    """Rewrite config.tables[table_name] from {point_value: points} to
    {point_id: points}, using the EstimatePoint rows under the configured
    <table_name>_estimate. Entries with no matching point are dropped."""
    table = (config.tables or {}).get(table_name) or {}
    if not table:
        return False

    estimate_id = getattr(config, estimate_id_field)
    if estimate_id is None:
        return False

    points_by_value = {
        point.value: point.id
        for point in EstimatePoint.objects.filter(estimate_id=estimate_id, deleted_at__isnull=True)
    }

    rekeyed = {}
    for value, points in table.items():
        point_id = points_by_value.get(value)
        if point_id is not None:
            rekeyed[str(point_id)] = points

    if rekeyed == table:
        return False

    config.tables[table_name] = rekeyed
    return True


def rekey_kpi_difficulty_and_repetitive_tables(apps, schema_editor):
    """
    KpiConfig.tables['difficulty'] / ['repetitive'] were keyed by the configured
    estimate point's VALUE string (e.g. "8", "XS"), so renaming a point silently
    zeroed its contribution to Vp. Rekey both by EstimatePoint id instead -- see
    plane.app.views.kpi.issue._difficulty_lookup_key / _repetitive_lookup_key.
    """
    KpiConfig = apps.get_model("db", "KpiConfig")
    EstimatePoint = apps.get_model("db", "EstimatePoint")

    to_save = []
    for config in KpiConfig.objects.filter(deleted_at__isnull=True):
        changed_difficulty = rekey_table_by_point_id(config, "difficulty", "difficulty_estimate_id", EstimatePoint)
        changed_repetitive = rekey_table_by_point_id(config, "repetitive", "repetitive_estimate_id", EstimatePoint)
        if changed_difficulty or changed_repetitive:
            to_save.append(config)

    for config in to_save:
        config.save(update_fields=["tables"])


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0144_single_active_numeric_estimate"),
    ]

    operations = [
        migrations.RunPython(rekey_kpi_difficulty_and_repetitive_tables, migrations.RunPython.noop),
    ]
