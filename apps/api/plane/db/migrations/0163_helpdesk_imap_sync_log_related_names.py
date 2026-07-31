# Pre-existing model/migration drift, unrelated to any feature: HelpdeskIMAPSyncLog
# inherits the workspace/project FKs from WorkspaceBaseModel, whose related_name
# uses the `%(class)s` pattern, but the original migration recorded the concrete
# names. related_name is resolved in Python, so both operations emit no SQL —
# this migration only realigns the recorded state so future makemigrations runs
# stop regenerating them.

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('db', '0162_helpdesk_request_priority'),
    ]

    operations = [
        migrations.AlterField(
            model_name='helpdeskimapsynclog',
            name='project',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name='project_%(class)s', to='db.project'),
        ),
        migrations.AlterField(
            model_name='helpdeskimapsynclog',
            name='workspace',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='workspace_%(class)s', to='db.workspace'),
        ),
    ]
