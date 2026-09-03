from django.db.models import Count, Q
from rest_framework import status
from rest_framework.response import Response

from plane.app.helpdesk import sla as sla_service
from plane.app.helpdesk.permissions import ADMIN, get_helpdesk_role
from plane.app.serializers.helpdesk import HelpdeskSLAPolicySerializer
from plane.app.views.base import BaseAPIView, BaseViewSet
from plane.db.models import Workspace
from plane.db.models.helpdesk import (
    HelpdeskPortal,
    HelpdeskRequest,
    HelpdeskRequestPriority,
    HelpdeskSLAPolicy,
)


class HelpdeskSLAPolicyViewSet(BaseViewSet):
    """Per-priority SLA targets.

    Reading is open to any helpdesk role -- an agent needs to know the deadline
    they are working against. Writing is ADMIN only, same floor as statuses:
    changing a policy moves the deadline of every open ticket at that priority.
    """

    serializer_class = HelpdeskSLAPolicySerializer
    model = HelpdeskSLAPolicy

    def get_queryset(self):
        queryset = (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"), deleted_at__isnull=True)
            .select_related("portal")
        )
        portal_id = self.request.query_params.get("portal")
        if portal_id:
            queryset = queryset.filter(portal_id=portal_id)
        return queryset.order_by("portal", "priority")

    def _require_admin(self, request, slug):
        role = get_helpdesk_role(request.user, slug)
        if role is None or role < ADMIN:
            return Response(
                {"error": "Only Helpdesk Admins can manage SLA policies."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return None

    def list(self, request, *args, **kwargs):
        if get_helpdesk_role(request.user, self.kwargs.get("slug")) is None:
            return Response({"error": "Access denied."}, status=status.HTTP_403_FORBIDDEN)
        return super().list(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        if get_helpdesk_role(request.user, self.kwargs.get("slug")) is None:
            return Response({"error": "Access denied."}, status=status.HTTP_403_FORBIDDEN)
        return super().retrieve(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        denied = self._require_admin(request, self.kwargs.get("slug"))
        if denied:
            return denied
        return super().create(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        denied = self._require_admin(request, self.kwargs.get("slug"))
        if denied:
            return denied
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        denied = self._require_admin(request, self.kwargs.get("slug"))
        if denied:
            return denied
        return super().destroy(request, *args, **kwargs)

    def perform_create(self, serializer):
        from rest_framework.exceptions import ValidationError

        workspace = Workspace.objects.get(slug=self.kwargs.get("slug"))
        portal_id = self.request.data.get("portal")
        # Without this check a workspace admin could attach a policy to another
        # workspace's portal by guessing its id.
        portal = HelpdeskPortal.objects.filter(id=portal_id, workspace=workspace).first()
        if not portal:
            raise ValidationError({"portal": "Portal not found for this workspace."})
        serializer.save(workspace=workspace, portal=portal)


class HelpdeskSLASummaryEndpoint(BaseAPIView):
    """Counts of breached / at-risk / healthy open tickets, broken down by priority.

    Separate from HelpdeskAnalyticsEndpoint on purpose: analytics answers "how
    did we do last month", this answers "what is on fire right now", so it looks
    at live deadlines rather than historical durations.
    """

    def get(self, request, slug):
        if get_helpdesk_role(request.user, slug) is None:
            return Response({"error": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        queryset = HelpdeskRequest.objects.filter(
            workspace__slug=slug,
            archived_at__isnull=True,
            deleted_at__isnull=True,
        )
        portal_id = request.query_params.get("portal")
        if portal_id:
            queryset = queryset.filter(portal_id=portal_id)

        queryset = sla_service.annotate_sla(queryset)

        breached = sla_service.sla_status_filter(sla_service.STATUS_BREACHED)
        at_risk = sla_service.sla_status_filter(sla_service.STATUS_AT_RISK)

        totals = queryset.aggregate(
            total=Count("id"),
            breached=Count("id", filter=breached),
            at_risk=Count("id", filter=at_risk),
            unresolved=Count("id", filter=Q(resolved_at__isnull=True)),
        )

        by_priority = list(
            queryset.values("priority").annotate(
                total=Count("id"),
                breached=Count("id", filter=breached),
                at_risk=Count("id", filter=at_risk),
            )
        )
        # Report every priority, including the ones with no tickets -- a zero is
        # a meaningful answer here and the caller should not have to guess
        # whether a missing key means zero or means "not computed".
        counts_by_priority = {row["priority"]: row for row in by_priority}
        priorities = []
        for priority, _label in HelpdeskRequestPriority.choices:
            row = counts_by_priority.get(priority, {})
            priorities.append(
                {
                    "priority": priority,
                    "total": row.get("total", 0),
                    "breached": row.get("breached", 0),
                    "at_risk": row.get("at_risk", 0),
                }
            )

        return Response(
            {
                "totals": totals,
                "by_priority": priorities,
                "at_risk_window_hours": sla_service.AT_RISK_WINDOW.total_seconds() / 3600,
            }
        )
