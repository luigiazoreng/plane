# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import datetime

from django.db import migrations, models


def mark_waiting_status_pauses_sla(apps, schema_editor):
    HelpdeskStatus = apps.get_model("db", "HelpdeskStatus")
    HelpdeskStatus.objects.filter(name__iexact="waiting").update(pauses_sla=True)


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0169_helpdesk_bookmarks"),
    ]

    operations = [
        migrations.AddField(
            model_name="helpdeskstatus",
            name="pauses_sla",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="helpdeskrequest",
            name="sla_paused_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="helpdeskrequest",
            name="total_paused_duration",
            field=models.DurationField(default=datetime.timedelta(0)),
        ),
        migrations.RunPython(mark_waiting_status_pauses_sla, migrations.RunPython.noop),
    ]
