# Generated manually

from django.db import migrations

class Migration(migrations.Migration):

    dependencies = [
        ('db', '0160_helpdesk_imap_sync_logs'),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
            ALTER TABLE helpdesk_imap_sync_logs ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone NULL;
            ALTER TABLE helpdesk_imap_sync_logs ADD COLUMN IF NOT EXISTS workspace_id uuid NULL;
            ALTER TABLE helpdesk_imap_sync_logs ADD COLUMN IF NOT EXISTS project_id uuid NULL;
            ALTER TABLE helpdesk_imap_sync_logs ADD COLUMN IF NOT EXISTS created_by_id uuid NULL;
            ALTER TABLE helpdesk_imap_sync_logs ADD COLUMN IF NOT EXISTS updated_by_id uuid NULL;
            """,
            reverse_sql="""
            ALTER TABLE helpdesk_imap_sync_logs DROP COLUMN IF EXISTS deleted_at;
            ALTER TABLE helpdesk_imap_sync_logs DROP COLUMN IF EXISTS workspace_id;
            ALTER TABLE helpdesk_imap_sync_logs DROP COLUMN IF EXISTS project_id;
            ALTER TABLE helpdesk_imap_sync_logs DROP COLUMN IF EXISTS created_by_id;
            ALTER TABLE helpdesk_imap_sync_logs DROP COLUMN IF EXISTS updated_by_id;
            """
        ),
    ]
