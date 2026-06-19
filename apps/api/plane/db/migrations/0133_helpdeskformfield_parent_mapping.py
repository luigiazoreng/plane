from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0132_helpdesk_phase12"),
    ]

    operations = [
        migrations.AddField(
            model_name="helpdeskformfield",
            name="parent_mapping",
            field=models.JSONField(default=dict, blank=True),
        ),
    ]
