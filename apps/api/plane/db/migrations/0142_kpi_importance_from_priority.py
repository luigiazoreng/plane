from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0141_kpi_difficulty_from_estimate"),
    ]

    operations = [
        # Importance is no longer a KPI-specific attribute; it is driven by the
        # issue's native priority (Issue.priority), whose points/b live in
        # KpiConfig.tables["priority"]. Drop the column.
        migrations.RemoveField(
            model_name="kpiissueattribute",
            name="importance",
        ),
    ]
