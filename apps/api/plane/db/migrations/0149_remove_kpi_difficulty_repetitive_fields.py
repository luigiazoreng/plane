from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0148_migrate_kpi_difficulty_repetitive_to_estimate_property"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="kpiconfig",
            name="difficulty_estimate",
        ),
        migrations.RemoveField(
            model_name="kpiconfig",
            name="repetitive_estimate",
        ),
        migrations.RemoveField(
            model_name="kpiissueattribute",
            name="difficulty_estimate_point",
        ),
        migrations.RemoveField(
            model_name="kpiissueattribute",
            name="repetitive_estimate_point",
        ),
    ]
