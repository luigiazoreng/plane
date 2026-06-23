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
                migrations.RunSQL(
                    """
                    ALTER TABLE helpdesk_requests
                    ADD COLUMN IF NOT EXISTS sla_resolution_due_at timestamp with time zone NULL
                    """,
                    reverse_sql=migrations.RunSQL.noop,
                ),
                migrations.RunSQL(
                    """
                    ALTER TABLE helpdesk_requests
                    ADD COLUMN IF NOT EXISTS external_source varchar(255) NOT NULL DEFAULT ''
                    """,
                    reverse_sql=migrations.RunSQL.noop,
                ),
                migrations.RunSQL(
                    """
                    ALTER TABLE helpdesk_requests
                    ADD COLUMN IF NOT EXISTS external_id varchar(255) NOT NULL DEFAULT ''
                    """,
                    reverse_sql=migrations.RunSQL.noop,
                ),
                migrations.RunSQL(
                    """
                    ALTER TABLE helpdesk_requests
                    ADD COLUMN IF NOT EXISTS import_metadata jsonb NOT NULL DEFAULT '{}'::jsonb
                    """,
                    reverse_sql=migrations.RunSQL.noop,
                ),
                migrations.RunSQL(
                    "ALTER TABLE helpdesk_requests ALTER COLUMN external_source SET DEFAULT ''",
                    reverse_sql="ALTER TABLE helpdesk_requests ALTER COLUMN external_source DROP DEFAULT",
                ),
                migrations.RunSQL(
                    "UPDATE helpdesk_requests SET external_source = '' WHERE external_source IS NULL",
                    reverse_sql=migrations.RunSQL.noop,
                ),
                migrations.RunSQL(
                    "ALTER TABLE helpdesk_requests ALTER COLUMN external_source SET NOT NULL",
                    reverse_sql="ALTER TABLE helpdesk_requests ALTER COLUMN external_source DROP NOT NULL",
                ),
                migrations.RunSQL(
                    "ALTER TABLE helpdesk_requests ALTER COLUMN external_id SET DEFAULT ''",
                    reverse_sql="ALTER TABLE helpdesk_requests ALTER COLUMN external_id DROP DEFAULT",
                ),
                migrations.RunSQL(
                    "UPDATE helpdesk_requests SET external_id = '' WHERE external_id IS NULL",
                    reverse_sql=migrations.RunSQL.noop,
                ),
                migrations.RunSQL(
                    "ALTER TABLE helpdesk_requests ALTER COLUMN external_id SET NOT NULL",
                    reverse_sql="ALTER TABLE helpdesk_requests ALTER COLUMN external_id DROP NOT NULL",
                ),
                migrations.RunSQL(
                    "ALTER TABLE helpdesk_requests ALTER COLUMN import_metadata SET DEFAULT '{}'::jsonb",
                    reverse_sql="ALTER TABLE helpdesk_requests ALTER COLUMN import_metadata DROP DEFAULT",
                ),
                migrations.RunSQL(
                    "UPDATE helpdesk_requests SET import_metadata = '{}'::jsonb WHERE import_metadata IS NULL",
                    reverse_sql=migrations.RunSQL.noop,
                ),
                migrations.RunSQL(
                    "ALTER TABLE helpdesk_requests ALTER COLUMN import_metadata SET NOT NULL",
                    reverse_sql="ALTER TABLE helpdesk_requests ALTER COLUMN import_metadata DROP NOT NULL",
                ),
            ],
        ),
    ]
