from plane.db.models.helpdesk import HelpdeskStatus


HELPDESK_INACTIVE_STATUS_NAMES = {"resolved", "closed"}


def get_helpdesk_active_status_ids(workspace, configured_status_ids=None):
    configured_status_ids = configured_status_ids or []
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
