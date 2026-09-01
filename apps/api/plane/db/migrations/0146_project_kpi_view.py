from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0145_kpi_difficulty_rekey_by_point_id"),
    ]

    operations = [
        migrations.AddField(
            model_name="project",
            name="kpi_view",
            field=models.BooleanField(default=False),
        ),
    ]
