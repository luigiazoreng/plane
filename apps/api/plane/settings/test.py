# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Test Settings"""

from .common import *  # noqa

DEBUG = True

# Send it in a dummy outbox
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

# Run Celery tasks synchronously (in-process) during tests instead of
# publishing to the real broker/worker -- the worker container runs against
# a different settings module/database, so `.delay()` calls (e.g.
# issue_activity) would otherwise be dequeued against the wrong DB, or never
# observed synchronously by test assertions at all.
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

INSTALLED_APPS.append(  # noqa
    "plane.tests"
)
