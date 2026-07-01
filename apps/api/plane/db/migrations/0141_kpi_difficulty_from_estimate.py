from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0140_kpi_config_and_attributes"),
    ]

    operations = [
        # Difficulty is no longer a KPI-specific categorical attribute; it is
        # driven by the issue's native estimate (Issue.estimate_point) and
        # mapped to points in KpiConfig.tables["difficulty"]. Drop the column.
        migrations.RemoveField(
            model_name="kpiissueattribute",
            name="difficulty",
        ),
    ]
