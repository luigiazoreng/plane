from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0133_helpdeskformfield_parent_mapping"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name="helpdeskrequest",
                    name="sla_resolution_due_at",
                    field=models.DateTimeField(blank=True, null=True),
                ),
                migrations.AddField(
                    model_name="helpdeskrequest",
                    name="external_source",
                    field=models.CharField(blank=True, default="", max_length=255),
                ),
                migrations.AddField(
                    model_name="helpdeskrequest",
                    name="external_id",
                    field=models.CharField(blank=True, default="", max_length=255),
                ),
                migrations.AddField(
                    model_name="helpdeskrequest",
                    name="import_metadata",
                    field=models.JSONField(blank=True, default=dict),
                ),
            ],
            database_operations=[
                # sla_resolution_due_at already exists as nullable — no action needed
                # Set DB-level defaults for the NOT NULL columns already in the schema
                migrations.RunSQL(
                    "ALTER TABLE helpdesk_requests ALTER COLUMN external_source SET DEFAULT ''",
                    reverse_sql="ALTER TABLE helpdesk_requests ALTER COLUMN external_source DROP DEFAULT",
                ),
                migrations.RunSQL(
                    "ALTER TABLE helpdesk_requests ALTER COLUMN external_id SET DEFAULT ''",
                    reverse_sql="ALTER TABLE helpdesk_requests ALTER COLUMN external_id DROP DEFAULT",
                ),
                migrations.RunSQL(
                    "ALTER TABLE helpdesk_requests ALTER COLUMN import_metadata SET DEFAULT '{}'::jsonb",
                    reverse_sql="ALTER TABLE helpdesk_requests ALTER COLUMN import_metadata DROP DEFAULT",
                ),
            ],
        ),
    ]
