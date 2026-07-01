import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0142_kpi_importance_from_priority"),
    ]

    operations = [
        migrations.AddField(
            model_name="kpiconfig",
            name="difficulty_estimate",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="difficulty_kpi_configs",
                to="db.estimate",
            ),
        ),
        migrations.AddField(
            model_name="kpiconfig",
            name="repetitive_estimate",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="repetitive_kpi_configs",
                to="db.estimate",
            ),
        ),
        migrations.AddField(
            model_name="kpiissueattribute",
            name="difficulty_estimate_point",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="difficulty_kpi_issue_attributes",
                to="db.estimatepoint",
            ),
        ),
        migrations.AddField(
            model_name="kpiissueattribute",
            name="repetitive_estimate_point",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="repetitive_kpi_issue_attributes",
                to="db.estimatepoint",
            ),
        ),
    ]
