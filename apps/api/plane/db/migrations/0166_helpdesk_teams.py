# Generated migration for HelpdeskTeam model and team FK on HelpdeskRequest.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

import uuid


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('db', '0165_helpdesk_request_activity'),
    ]

    operations = [
        migrations.CreateModel(
            name='HelpdeskTeam',
            fields=[
                ('id', models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Created At')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Last Modified At')),
                ('deleted_at', models.DateTimeField(blank=True, null=True)),
                ('name', models.CharField(max_length=255)),
                ('description', models.TextField(blank=True, default='')),
                ('color', models.CharField(default='#3B82F6', max_length=20)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='helpdeskteam_created_by', to=settings.AUTH_USER_MODEL, verbose_name='Created By')),
                ('members', models.ManyToManyField(blank=True, related_name='helpdesk_teams', to=settings.AUTH_USER_MODEL)),
                ('project', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='helpdesk_teams', to='db.project')),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='helpdeskteam_updated_by', to=settings.AUTH_USER_MODEL, verbose_name='Last Modified By')),
                ('workspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='helpdesk_teams', to='db.workspace')),
            ],
            options={
                'verbose_name': 'Helpdesk Team',
                'verbose_name_plural': 'Helpdesk Teams',
                'db_table': 'helpdesk_teams',
                'ordering': ('name',),
            },
        ),
        migrations.AddField(
            model_name='helpdeskrequest',
            name='team',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='requests', to='db.helpdeskteam'),
        ),
    ]
