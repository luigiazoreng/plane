from collections import defaultdict

from django.db.models import Count, Q

from plane.db.models import WorkspaceMember
from plane.db.models.helpdesk import HelpdeskPortal, HelpdeskRequestAssignee, HelpdeskStatus


HELPDESK_INACTIVE_STATUS_NAMES = {"resolved", "closed"}


def normalize_helpdesk_auto_assignment_config(config):
    if not isinstance(config, dict):
        config = {}

    member_ids = []
    for member_id in config.get("member_ids", []) or []:
        normalized_member_id = str(member_id).strip()
        if normalized_member_id and normalized_member_id not in member_ids:
            member_ids.append(normalized_member_id)

    active_status_ids = []
    for status_id in config.get("active_status_ids", []) or []:
        normalized_status_id = str(status_id).strip()
        if normalized_status_id and normalized_status_id not in active_status_ids:
            active_status_ids.append(normalized_status_id)

    version = config.get("version", 1)
    try:
        version = int(version)
    except (TypeError, ValueError):
        version = 1

    return {
        "version": version,
        "member_ids": member_ids,
        "active_status_ids": active_status_ids,
    }


def get_helpdesk_active_status_ids(workspace, config):
    configured_status_ids = config.get("active_status_ids") or []
    if configured_status_ids:
        return list(
            HelpdeskStatus.objects.filter(
                workspace=workspace,
                deleted_at__isnull=True,
                id__in=configured_status_ids,
            ).values_list("id", flat=True)
        )

    active_status_ids = []
    for status in HelpdeskStatus.objects.filter(workspace=workspace, deleted_at__isnull=True).only("id", "name"):
        if (status.name or "").strip().lower() not in HELPDESK_INACTIVE_STATUS_NAMES:
            active_status_ids.append(status.id)
    return active_status_ids


def resolve_load_balanced_assignee(portal):
    config = normalize_helpdesk_auto_assignment_config(portal.auto_assignment_config)
    member_ids = config.get("member_ids", [])
    if not member_ids:
        return None

    eligible_member_ids = list(
        WorkspaceMember.objects.filter(
            workspace=portal.workspace,
            is_active=True,
            deleted_at__isnull=True,
            member_id__in=member_ids,
            member__is_active=True,
            member__is_bot=False,
        ).values_list("member_id", flat=True)
    )
    if not eligible_member_ids:
        return None

    active_status_ids = get_helpdesk_active_status_ids(portal.workspace, config)
    active_request_filter = Q(request__status__isnull=True)
    if active_status_ids:
        active_request_filter |= Q(request__status_id__in=active_status_ids)

    counts = defaultdict(int)
    for row in (
        HelpdeskRequestAssignee.objects.filter(
            request__workspace=portal.workspace,
            request__deleted_at__isnull=True,
            deleted_at__isnull=True,
            assignee_id__in=eligible_member_ids,
        )
        .filter(active_request_filter)
        .values("assignee_id")
        .annotate(active_count=Count("id"))
    ):
        counts[str(row["assignee_id"])] = row["active_count"]

    ranked_member_ids = sorted(
        (str(member_id) for member_id in eligible_member_ids),
        key=lambda member_id: (counts[member_id], member_id),
    )
    return ranked_member_ids[0] if ranked_member_ids else None


def resolve_helpdesk_auto_assignee(portal, request_payload=None):
    if not portal or not portal.auto_assignment_enabled:
        return None

    if portal.auto_assignment_type != HelpdeskPortal.AutoAssignmentType.LOAD_BALANCE:
        return None

    return resolve_load_balanced_assignee(portal)


def assign_helpdesk_request_automatically(helpdesk_request, request_payload=None):
    if not helpdesk_request or helpdesk_request.assignees.exists():
        return None

    assignee_id = resolve_helpdesk_auto_assignee(helpdesk_request.portal, request_payload=request_payload)
    if not assignee_id:
        return None

    helpdesk_request.assignees.set([assignee_id])
    return assignee_id
