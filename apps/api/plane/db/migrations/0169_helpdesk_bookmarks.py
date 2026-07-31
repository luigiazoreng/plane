# Generated migration for HelpdeskRequestBookmark and snoozed_until.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

import uuid


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('db', '0168_helpdesk_macros'),
    ]

    operations = [
        migrations.AddField(
            model_name='helpdeskrequest',
            name='snoozed_until',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name='HelpdeskRequestBookmark',
            fields=[
                ('id', models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Created At')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Last Modified At')),
                ('deleted_at', models.DateTimeField(blank=True, null=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='helpdeskrequestbookmark_created_by', to=settings.AUTH_USER_MODEL, verbose_name='Created By')),
                ('project', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='helpdesk_request_bookmarks', to='db.project')),
                ('request', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='bookmarks', to='db.helpdeskrequest')),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='helpdeskrequestbookmark_updated_by', to=settings.AUTH_USER_MODEL, verbose_name='Last Modified By')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='helpdesk_request_bookmarks', to=settings.AUTH_USER_MODEL)),
                ('workspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='helpdesk_request_bookmarks', to='db.workspace')),
            ],
            options={
                'verbose_name': 'Helpdesk Request Bookmark',
                'verbose_name_plural': 'Helpdesk Request Bookmarks',
                'db_table': 'helpdesk_request_bookmarks',
                'unique_together': {('request', 'user', 'deleted_at')},
            },
        ),
    ]
