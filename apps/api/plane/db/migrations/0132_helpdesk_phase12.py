from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0131_helpdeskrequest_description_blank"),
    ]

    operations = [
        # cascade_select field type + parent_field_key on HelpdeskFormField
        migrations.AlterField(
            model_name="helpdeskformfield",
            name="field_type",
            field=models.CharField(
                max_length=50,
                choices=[
                    ("system_title", "System Title"),
                    ("system_description", "System Description"),
                    ("short_text", "Short Text"),
                    ("long_text", "Long Text"),
                    ("select", "Select"),
                    ("checkbox", "Checkbox"),
                    ("date", "Date"),
                    ("cascade_select", "Cascading Dropdown"),
                ],
            ),
        ),
        migrations.AddField(
            model_name="helpdeskformfield",
            name="parent_field_key",
            field=models.CharField(max_length=255, blank=True, default=""),
        ),
        # ticket_id_pattern and ticket_id_counter on HelpdeskForm
        migrations.AddField(
            model_name="helpdeskform",
            name="ticket_id_pattern",
            field=models.CharField(max_length=64, blank=True, default=""),
        ),
        migrations.AddField(
            model_name="helpdeskform",
            name="ticket_id_counter",
            field=models.PositiveIntegerField(default=0),
        ),
        # display_id on HelpdeskRequest
        migrations.AddField(
            model_name="helpdeskrequest",
            name="display_id",
            field=models.CharField(max_length=64, blank=True, default=""),
        ),
    ]
