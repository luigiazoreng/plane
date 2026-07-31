# Generated migration for HelpdeskMacro model.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

import uuid


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('db', '0167_helpdesk_read_receipts'),
    ]

    operations = [
        migrations.CreateModel(
            name='HelpdeskMacro',
            fields=[
                ('id', models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Created At')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Last Modified At')),
                ('deleted_at', models.DateTimeField(blank=True, null=True)),
                ('name', models.CharField(max_length=255)),
                ('description', models.TextField(blank=True, default='')),
                ('content', models.TextField(blank=True, default='')),
                ('is_public', models.BooleanField(default=True)),
                ('actions', models.JSONField(blank=True, default=list)),
                ('sequence', models.FloatField(default=65535)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='helpdeskmacro_created_by', to=settings.AUTH_USER_MODEL, verbose_name='Created By')),
                ('project', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='helpdesk_macros', to='db.project')),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='helpdeskmacro_updated_by', to=settings.AUTH_USER_MODEL, verbose_name='Last Modified By')),
                ('workspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='helpdesk_macros', to='db.workspace')),
            ],
            options={
                'verbose_name': 'Helpdesk Macro',
                'verbose_name_plural': 'Helpdesk Macros',
                'db_table': 'helpdesk_macros',
                'ordering': ('sequence', 'name'),
            },
        ),
    ]
