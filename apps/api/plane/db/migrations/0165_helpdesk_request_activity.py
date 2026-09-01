# Generated migration for HelpdeskRequestActivity model.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

import uuid


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('db', '0164_helpdesk_request_labels'),
    ]

    operations = [
        migrations.CreateModel(
            name='HelpdeskRequestActivity',
            fields=[
                ('id', models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Created At')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Last Modified At')),
                ('deleted_at', models.DateTimeField(blank=True, null=True)),
                ('verb', models.CharField(default='updated', max_length=50)),
                ('field', models.CharField(blank=True, default='', max_length=255)),
                ('old_value', models.TextField(blank=True, default='')),
                ('new_value', models.TextField(blank=True, default='')),
                ('old_identifier', models.UUIDField(blank=True, null=True)),
                ('new_identifier', models.UUIDField(blank=True, null=True)),
                ('actor', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='helpdesk_activities',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('request', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='activities',
                    to='db.helpdeskrequest',
                )),
                ('workspace', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='helpdesk_request_activities',
                    to='db.workspace',
                )),
                ('project', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='helpdesk_request_activities',
                    to='db.project',
                )),
                ('created_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='helpdeskrequestactivity_created_by',
                    to=settings.AUTH_USER_MODEL,
                    verbose_name='Created By',
                )),
                ('updated_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='helpdeskrequestactivity_updated_by',
                    to=settings.AUTH_USER_MODEL,
                    verbose_name='Last Modified By',
                )),
            ],
            options={
                'verbose_name': 'Helpdesk Request Activity',
                'verbose_name_plural': 'Helpdesk Request Activities',
                'db_table': 'helpdesk_request_activities',
                'ordering': ('created_at',),
            },
        ),
    ]
