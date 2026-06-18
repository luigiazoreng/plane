from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0130_helpdesk_analytics_fields"),
    ]

    operations = [
        migrations.AlterField(
            model_name="helpdeskrequest",
            name="description",
            field=models.TextField(blank=True, default=""),
        ),
    ]
