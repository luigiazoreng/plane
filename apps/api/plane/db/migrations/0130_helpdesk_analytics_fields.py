from django.db import migrations, models


def set_terminal_statuses(apps, schema_editor):
    HelpdeskStatus = apps.get_model("db", "HelpdeskStatus")
    HelpdeskStatus.objects.filter(name__iexact="resolved").update(is_terminal=True)
    HelpdeskStatus.objects.filter(name__iexact="closed").update(is_terminal=True)


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0129_helpdeskportal_auto_assignment"),
    ]

    operations = [
        migrations.AddField(
            model_name="helpdeskstatus",
            name="is_terminal",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="helpdeskrequest",
            name="first_responded_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="helpdeskrequest",
            name="resolved_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="helpdeskportal",
            name="sla_first_response_hours",
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="helpdeskportal",
            name="sla_resolution_hours",
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.RunPython(set_terminal_statuses, migrations.RunPython.noop),
    ]
