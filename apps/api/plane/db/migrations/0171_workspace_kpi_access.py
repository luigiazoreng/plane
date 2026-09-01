# Grants that let non-admin workspace members open the KPI/Executive panels.
#
# Only the CreateModel is here. makemigrations would also emit 25 AlterField
# operations on helpdesk tables -- pre-existing model/migration drift that shows
# up on a clean checkout too -- and bundling that unrelated churn into this
# migration would make it impossible to review or revert on its own. The
# CreateModel body below is verbatim from the autodetector.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

import uuid


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('db', '0170_helpdesk_sla_pause'),
    ]

    operations = [
        migrations.CreateModel(
            name='WorkspaceKpiAccess',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Created At')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Last Modified At')),
                ('deleted_at', models.DateTimeField(blank=True, null=True, verbose_name='Deleted At')),
                ('id', models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ('is_active', models.BooleanField(default=True)),
                ('created_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_created_by', to=settings.AUTH_USER_MODEL, verbose_name='Created By')),
                ('member', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='workspace_kpi_access', to=settings.AUTH_USER_MODEL)),
                ('project', models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name='project_%(class)s', to='db.project')),
                ('updated_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_updated_by', to=settings.AUTH_USER_MODEL, verbose_name='Last Modified By')),
                ('workspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='workspace_%(class)s', to='db.workspace')),
            ],
            options={
                'verbose_name': 'Workspace KPI Access',
                'verbose_name_plural': 'Workspace KPI Access',
                'db_table': 'workspace_kpi_access',
                'ordering': ('-created_at',),
                'unique_together': {('workspace', 'member', 'deleted_at')},
            },
        ),
    ]
