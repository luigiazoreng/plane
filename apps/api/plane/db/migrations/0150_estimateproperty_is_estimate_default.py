from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0149_remove_kpi_difficulty_repetitive_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="estimateproperty",
            name="is_estimate_default",
            field=models.BooleanField(default=False),
        ),
        migrations.AddConstraint(
            model_name="estimateproperty",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True), ("is_estimate_default", True)),
                fields=("project", "estimate"),
                name="estimateproperty_unique_default_per_project_estimate",
            ),
        ),
    ]
