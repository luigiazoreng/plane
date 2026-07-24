# Generated manually

from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('db', '0159_helpdeskportal_imap_fields'),
    ]

    operations = [
        migrations.CreateModel(
            name='HelpdeskIMAPSyncLog',
            fields=[
                ('id', models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Created At')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Last Modified At')),
                ('status', models.CharField(choices=[('success', 'Success'), ('error', 'Error')], max_length=50)),
                ('emails_fetched', models.IntegerField(default=0)),
                ('error_message', models.TextField(blank=True, null=True)),
                ('created_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_created_by', to='db.user', verbose_name='Created By')),
                ('portal', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='imap_sync_logs', to='db.helpdeskportal')),
                ('updated_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_updated_by', to='db.user', verbose_name='Last Modified By')),
                ('workspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='%(class)s_workspace', to='db.workspace')),
            ],
            options={
                'verbose_name': 'Helpdesk IMAP Sync Log',
                'verbose_name_plural': 'Helpdesk IMAP Sync Logs',
                'db_table': 'helpdesk_imap_sync_logs',
                'ordering': ('-created_at',),
            },
        ),
    ]
