from django.db import migrations


def deactivate_conflicting_numeric_estimates(apps, schema_editor):
    """
    Enforce at most one active (last_used=True) numeric (points/time) estimate per
    project going forward -- see plane.app.views.estimate.base._activate_numeric_estimate.
    For any project that already has more than one active numeric estimate, keep the
    most recently created one active and deactivate the rest. Categories estimates are
    untouched since they're excluded from analytics and may coexist freely.
    """
    Estimate = apps.get_model("db", "Estimate")
    Project = apps.get_model("db", "Project")

    conflicting = Estimate.objects.filter(
        deleted_at__isnull=True,
        last_used=True,
        type__in=["points", "time"],
    ).order_by("project_id", "-created_at")

    kept_estimate_id_by_project_id = {}
    to_deactivate_ids = []
    for estimate in conflicting:
        if estimate.project_id in kept_estimate_id_by_project_id:
            to_deactivate_ids.append(estimate.id)
        else:
            kept_estimate_id_by_project_id[estimate.project_id] = estimate.id

    if not to_deactivate_ids:
        return

    Estimate.objects.filter(id__in=to_deactivate_ids).update(last_used=False)

    # If a project's default estimate was one we just deactivated, repoint it to the
    # numeric estimate we kept active for that project, so project.estimate never
    # ends up pointing at an inactive row.
    for project in Project.objects.filter(estimate_id__in=to_deactivate_ids):
        kept_id = kept_estimate_id_by_project_id.get(project.id)
        if kept_id:
            project.estimate_id = kept_id
            project.save(update_fields=["estimate"])


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0143_kpi_configurable_estimates"),
    ]

    operations = [
        migrations.RunPython(deactivate_conflicting_numeric_estimates, migrations.RunPython.noop),
    ]
