from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0137_helpdeskrequest_archived_at"),
    ]

    operations = [
        migrations.AddField(
            model_name="helpdeskrequest",
            name="start_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="helpdeskrequest",
            name="target_date",
            field=models.DateField(blank=True, null=True),
        ),
    ]
