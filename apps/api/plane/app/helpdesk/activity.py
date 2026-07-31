# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Helpers for recording audit-log entries on helpdesk requests.

Call `record_helpdesk_activity` from any view that mutates a request field.
Call `record_helpdesk_comment_activity` when a new comment is created.
Call `diff_and_record_activities` for automatic diff-based recording on
partial updates (status, priority, assignees, labels).
"""

from plane.db.models.helpdesk import HelpdeskRequestActivity


def record_helpdesk_activity(
    request_obj,
    user,
    field,
    old_value="",
    new_value="",
    old_identifier=None,
    new_identifier=None,
    verb="updated",
):
    """Create a single activity log entry."""
    return HelpdeskRequestActivity.objects.create(
        request=request_obj,
        workspace_id=request_obj.workspace_id,
        actor=user,
        verb=verb,
        field=field,
        old_value=str(old_value) if old_value is not None else "",
        new_value=str(new_value) if new_value is not None else "",
        old_identifier=old_identifier,
        new_identifier=new_identifier,
    )


def record_helpdesk_comment_activity(request_obj, user, is_internal=False):
    """Record that a comment was added."""
    verb = "internal_note" if is_internal else "commented"
    return record_helpdesk_activity(
        request_obj, user, field="comment", verb=verb,
    )


def diff_and_record_activities(request_obj, user, old_snapshot, new_data):
    """Compare old_snapshot with new_data and record an activity for each
    changed field.

    old_snapshot is a dict captured before the update:
        {
            "status_id": str(instance.status_id) or None,
            "priority": instance.priority,
            "assignee_ids": sorted list of str UUIDs,
            "label_ids": sorted list of str UUIDs,
        }

    new_data is the raw request.data dict from the PATCH.
    """
    activities = []

    # Status
    new_status = new_data.get("status")
    if new_status and str(new_status) != str(old_snapshot.get("status_id") or ""):
        activities.append(record_helpdesk_activity(
            request_obj, user, "status",
            old_value=old_snapshot.get("status_id") or "",
            new_value=str(new_status),
            old_identifier=old_snapshot.get("status_id") if old_snapshot.get("status_id") else None,
            new_identifier=new_status,
        ))

    # Priority
    new_priority = new_data.get("priority")
    if new_priority and new_priority != old_snapshot.get("priority"):
        activities.append(record_helpdesk_activity(
            request_obj, user, "priority",
            old_value=old_snapshot.get("priority", ""),
            new_value=new_priority,
        ))

    # Team
    new_team = new_data.get("team")
    if new_team is not None and str(new_team or "") != str(old_snapshot.get("team_id") or ""):
        activities.append(record_helpdesk_activity(
            request_obj, user, "team",
            old_value=old_snapshot.get("team_id") or "",
            new_value=str(new_team) if new_team else "",
            old_identifier=old_snapshot.get("team_id"),
            new_identifier=new_team,
        ))

    # Assignees
    new_assignees = new_data.get("assignees")
    if new_assignees is not None:
        old_set = set(old_snapshot.get("assignee_ids", []))
        new_set = set(str(uid) for uid in new_assignees)
        added = new_set - old_set
        removed = old_set - new_set
        for uid in added:
            activities.append(record_helpdesk_activity(
                request_obj, user, "assignees",
                new_value=uid, new_identifier=uid, verb="added",
            ))
        for uid in removed:
            activities.append(record_helpdesk_activity(
                request_obj, user, "assignees",
                old_value=uid, old_identifier=uid, verb="removed",
            ))

    # Labels
    new_labels = new_data.get("labels")
    if new_labels is not None:
        old_set = set(old_snapshot.get("label_ids", []))
        new_set = set(str(uid) for uid in new_labels)
        added = new_set - old_set
        removed = old_set - new_set
        for uid in added:
            activities.append(record_helpdesk_activity(
                request_obj, user, "labels",
                new_value=uid, new_identifier=uid, verb="added",
            ))
        for uid in removed:
            activities.append(record_helpdesk_activity(
                request_obj, user, "labels",
                old_value=uid, old_identifier=uid, verb="removed",
            ))

    return activities
