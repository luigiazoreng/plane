# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest

from plane.db.models import Issue, Project, State


@pytest.fixture
def project(workspace):
    return Project.objects.create(name="Completion dates", identifier="DONE", workspace=workspace)


@pytest.fixture
def states(project, workspace):
    return {
        name: State.objects.create(name=name, group=group, project=project, workspace=workspace)
        for name, group in [("Todo", "unstarted"), ("Done", "completed"), ("Delivered", "completed")]
    }


@pytest.fixture
def issue(project, workspace, states):
    return Issue.objects.create(name="Task", project=project, workspace=workspace, state=states["Todo"])


DELIVERED_AT = datetime(2026, 8, 25, 15, 33, tzinfo=timezone.utc)
EDITED_AT = DELIVERED_AT + timedelta(days=78)


@pytest.mark.unit
@pytest.mark.django_db
class TestIssueCompletion:
    @pytest.mark.parametrize("field,value", [("priority", "urgent"), ("name", "Edited task")])
    def test_unrelated_edit_preserves_completion(self, issue, states, field, value):
        issue.state = states["Done"]
        with patch("plane.db.models.issue.timezone.now", return_value=DELIVERED_AT):
            issue.save()

        setattr(issue, field, value)
        with patch("plane.db.models.issue.timezone.now", return_value=EDITED_AT):
            issue.save()

        issue.refresh_from_db()
        assert getattr(issue, field) == value
        assert issue.completed_at == DELIVERED_AT

    def test_move_between_completed_states_preserves_completion(self, issue, states):
        issue.state = states["Done"]
        with patch("plane.db.models.issue.timezone.now", return_value=DELIVERED_AT):
            issue.save()
        issue.state = states["Delivered"]
        with patch("plane.db.models.issue.timezone.now", return_value=EDITED_AT):
            issue.save()
        issue.refresh_from_db()
        assert issue.state == states["Delivered"]
        assert issue.completed_at == DELIVERED_AT

    @pytest.mark.parametrize("update_fields", [None, ["state"], ["state_id"]])
    def test_reopening_and_completing_again_records_new_date(self, issue, states, update_fields):
        issue.state = states["Done"]
        with patch("plane.db.models.issue.timezone.now", return_value=DELIVERED_AT):
            issue.save(update_fields=update_fields)
        issue.refresh_from_db()
        assert issue.completed_at == DELIVERED_AT

        issue.state = states["Todo"]
        issue.save(update_fields=update_fields)
        issue.refresh_from_db()
        assert issue.completed_at is None

        issue.state = states["Done"]
        with patch("plane.db.models.issue.timezone.now", return_value=EDITED_AT):
            issue.save(update_fields=update_fields)
        issue.refresh_from_db()
        assert issue.completed_at == EDITED_AT

    @pytest.mark.parametrize("explicit_state", [True, False])
    def test_creation_in_completed_state_records_date(self, project, workspace, states, explicit_state):
        done = states["Done"]
        done.default = True
        done.save()
        with patch("plane.db.models.issue.timezone.now", return_value=DELIVERED_AT):
            issue = Issue.objects.create(
                name="Already done",
                project=project,
                workspace=workspace,
                **({"state": done} if explicit_state else {}),
            )
        issue.refresh_from_db()
        assert issue.state == done
        assert issue.completed_at == DELIVERED_AT

    def test_completed_issue_without_timestamp_gets_date(self, issue, states):
        Issue.objects.filter(pk=issue.pk).update(state=states["Done"], completed_at=None)
        issue.refresh_from_db()
        with patch("plane.db.models.issue.timezone.now", return_value=DELIVERED_AT):
            issue.save()
        issue.refresh_from_db()
        assert issue.completed_at == DELIVERED_AT

    def test_partial_edit_does_not_apply_unsaved_state(self, issue, states):
        issue.state = states["Done"]
        with patch("plane.db.models.issue.timezone.now", return_value=DELIVERED_AT):
            issue.save()
        issue.state = states["Todo"]
        issue.priority = "urgent"
        issue.save(update_fields=["priority"])
        # The instance's timestamp must also stay intact for a subsequent save.
        assert issue.completed_at == DELIVERED_AT
        issue.refresh_from_db()
        assert issue.state == states["Done"]
        assert issue.priority == "urgent"
        assert issue.completed_at == DELIVERED_AT

    def test_explicit_imported_date_is_preserved(self, project, workspace, states):
        with patch("plane.db.models.issue.timezone.now", return_value=EDITED_AT):
            issue = Issue.objects.create(
                name="Imported task",
                project=project,
                workspace=workspace,
                state=states["Done"],
                completed_at=DELIVERED_AT,
            )
        issue.refresh_from_db()
        assert issue.completed_at == DELIVERED_AT
