from plane.db.models import WorkspaceMember, HelpdeskMember

ADMIN = 20
MEMBER = 15
GUEST = 5


def get_helpdesk_role(user, workspace_slug):
    """
    Returns the effective helpdesk role (int) for the user, or None if not a workspace member.
    Workspace admins bypass helpdesk-level roles and always receive ADMIN (20).
    """
    ws = WorkspaceMember.objects.filter(
        member=user,
        workspace__slug=workspace_slug,
        is_active=True,
    ).first()
    if not ws:
        return None
    if ws.role == ADMIN:
        return ADMIN

    hd = HelpdeskMember.objects.filter(
        member=user,
        workspace__slug=workspace_slug,
        is_active=True,
        deleted_at__isnull=True,
    ).first()
    return hd.role if hd else None
