# Generated migration for HelpdeskRequestReadReceipt model.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

import uuid


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('db', '0166_helpdesk_teams'),
    ]

    operations = [
        migrations.CreateModel(
            name='HelpdeskRequestReadReceipt',
            fields=[
                ('id', models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Created At')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Last Modified At')),
                ('deleted_at', models.DateTimeField(blank=True, null=True)),
                ('last_read_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='helpdeskrequestreadreceipt_created_by', to=settings.AUTH_USER_MODEL, verbose_name='Created By')),
                ('project', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='helpdesk_request_read_receipts', to='db.project')),
                ('request', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='read_receipts', to='db.helpdeskrequest')),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='helpdeskrequestreadreceipt_updated_by', to=settings.AUTH_USER_MODEL, verbose_name='Last Modified By')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='helpdesk_read_receipts', to=settings.AUTH_USER_MODEL)),
                ('workspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='helpdesk_request_read_receipts', to='db.workspace')),
            ],
            options={
                'verbose_name': 'Helpdesk Request Read Receipt',
                'verbose_name_plural': 'Helpdesk Request Read Receipts',
                'db_table': 'helpdesk_request_read_receipts',
                'unique_together': {('request', 'user', 'deleted_at')},
            },
        ),
    ]
