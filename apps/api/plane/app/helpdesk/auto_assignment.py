from collections import defaultdict

from django.db.models import Count, Q

from plane.db.models import WorkspaceMember
from plane.db.models.helpdesk import HelpdeskPortal, HelpdeskRequestAssignee

from .statuses import get_helpdesk_active_status_ids


def normalize_helpdesk_auto_assignment_config(config, assignment_type=HelpdeskPortal.AutoAssignmentType.LOAD_BALANCE):
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

    capacity_limit = config.get("capacity_limit")
    try:
        capacity_limit = int(capacity_limit) if capacity_limit is not None else None
    except (TypeError, ValueError):
        capacity_limit = None
    if capacity_limit is not None and capacity_limit <= 0:
        capacity_limit = None

    normalized = {
        "version": version,
        "member_ids": member_ids,
        "active_status_ids": active_status_ids,
        "capacity_limit": capacity_limit,
        "round_robin_last_assignee_id": None,
    }

    if assignment_type == HelpdeskPortal.AutoAssignmentType.ROUND_ROBIN:
        last_assignee_id = str(config.get("round_robin_last_assignee_id") or "").strip() or None
        normalized["round_robin_last_assignee_id"] = last_assignee_id

    return normalized


def _get_eligible_member_ids(portal):
    config = normalize_helpdesk_auto_assignment_config(portal.auto_assignment_config, portal.auto_assignment_type)
    member_ids = config.get("member_ids", [])
    if not member_ids:
        return []

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
    return sorted(str(member_id) for member_id in eligible_member_ids)


def _get_active_request_counts(portal, eligible_member_ids, active_status_ids):
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

    return counts


def resolve_load_balanced_assignee(portal):
    config = normalize_helpdesk_auto_assignment_config(portal.auto_assignment_config, portal.auto_assignment_type)
    eligible_member_ids = _get_eligible_member_ids(portal)
    if not eligible_member_ids:
        return None, config

    active_status_ids = get_helpdesk_active_status_ids(portal.workspace, config.get("active_status_ids"))
    counts = _get_active_request_counts(portal, eligible_member_ids, active_status_ids)

    ranked_member_ids = sorted(
        eligible_member_ids,
        key=lambda member_id: (counts[member_id], member_id),
    )
    return (ranked_member_ids[0] if ranked_member_ids else None), config


def resolve_round_robin_assignee(portal):
    config = normalize_helpdesk_auto_assignment_config(portal.auto_assignment_config, portal.auto_assignment_type)
    eligible_member_ids = _get_eligible_member_ids(portal)
    if not eligible_member_ids:
        return None, config

    last_assignee_id = config.get("round_robin_last_assignee_id")
    if last_assignee_id in eligible_member_ids:
        last_index = eligible_member_ids.index(last_assignee_id)
        selected_member_id = eligible_member_ids[(last_index + 1) % len(eligible_member_ids)]
    else:
        selected_member_id = eligible_member_ids[0]

    config["round_robin_last_assignee_id"] = selected_member_id
    portal.auto_assignment_config = config
    portal.save(update_fields=["auto_assignment_config", "updated_at"])
    return selected_member_id, config


def resolve_capacity_assignee(portal):
    config = normalize_helpdesk_auto_assignment_config(portal.auto_assignment_config, portal.auto_assignment_type)
    eligible_member_ids = _get_eligible_member_ids(portal)
    if not eligible_member_ids:
        return None, config

    active_status_ids = get_helpdesk_active_status_ids(portal.workspace, config.get("active_status_ids"))
    counts = _get_active_request_counts(portal, eligible_member_ids, active_status_ids)
    capacity_limit = config.get("capacity_limit")
    if capacity_limit is None:
        return resolve_load_balanced_assignee(portal)

    ranked_member_ids = sorted(
        (member_id for member_id in eligible_member_ids if counts[member_id] < capacity_limit),
        key=lambda member_id: (counts[member_id], member_id),
    )
    return (ranked_member_ids[0] if ranked_member_ids else None), config


AUTO_ASSIGNMENT_RESOLVERS = {
    HelpdeskPortal.AutoAssignmentType.LOAD_BALANCE: resolve_load_balanced_assignee,
    HelpdeskPortal.AutoAssignmentType.ROUND_ROBIN: resolve_round_robin_assignee,
    HelpdeskPortal.AutoAssignmentType.CAPACITY: resolve_capacity_assignee,
}


def resolve_helpdesk_auto_assignee(portal, request_payload=None):
    if not portal or not portal.auto_assignment_enabled:
        return None

    resolver = AUTO_ASSIGNMENT_RESOLVERS.get(portal.auto_assignment_type)
    if not resolver:
        return None

    assignee_id, _config = resolver(portal)
    return assignee_id


def assign_helpdesk_request_automatically(helpdesk_request, request_payload=None):
    if not helpdesk_request or helpdesk_request.assignees.exists():
        return None

    assignee_id = resolve_helpdesk_auto_assignee(helpdesk_request.portal, request_payload=request_payload)
    if not assignee_id:
        return None

    # assignees.set() doesn't know about the through model's workspace field
    # (it's not part of through_fields), so it inserts workspace_id=NULL and
    # trips the NOT NULL constraint. Create the through row directly instead.
    HelpdeskRequestAssignee.objects.create(
        request=helpdesk_request,
        assignee_id=assignee_id,
        workspace_id=helpdesk_request.workspace_id,
    )
    return assignee_id
