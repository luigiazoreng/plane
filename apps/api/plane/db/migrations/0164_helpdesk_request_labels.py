# Generated migration for adding labels M2M to HelpdeskRequest.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('db', '0163_helpdesk_imap_sync_log_related_names'),
    ]

    operations = [
        migrations.AddField(
            model_name='helpdeskrequest',
            name='labels',
            field=models.ManyToManyField(
                blank=True,
                related_name='helpdesk_requests',
                to='db.label',
            ),
        ),
    ]
