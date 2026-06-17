from datetime import timedelta

from django.db.models import Avg, Count, ExpressionWrapper, F, fields
from django.db.models.functions import TruncDate, TruncMonth
from rest_framework.response import Response

from plane.app.views.base import BaseAPIView
from plane.db.models import Workspace
from plane.db.models.helpdesk import HelpdeskPortal, HelpdeskRequest, HelpdeskRequestAssignee, HelpdeskStatus
from plane.app.helpdesk.statuses import get_helpdesk_active_status_ids
from plane.utils.date_utils import get_analytics_date_range, get_chart_period_range


def _safe_pct_change(current, previous):
    if previous and previous > 0:
        return round((current - previous) / previous * 100, 1)
    return None


def _duration_to_hours(td):
    if td is None:
        return None
    return round(td.total_seconds() / 3600, 2)


def _get_trunc_fn(date_filter):
    if date_filter in ("yesterday", "last_7_days", "last_30_days"):
        return TruncDate
    return TruncMonth


class HelpdeskAnalyticsEndpoint(BaseAPIView):
    SLA_HISTORY_CUTOFF = "2026-06-17"

    def get(self, request, slug):
        date_filter = request.query_params.get("date_filter", "last_30_days")
        portal_id = request.query_params.get("portal_id")

        date_ranges = get_analytics_date_range(date_filter)
        chart_range = get_chart_period_range(date_filter)

        if not date_ranges:
            return Response({"error": "Invalid date_filter"}, status=400)

        current_range = date_ranges["current"]
        previous_range = date_ranges.get("previous")

        base_qs = HelpdeskRequest.objects.filter(workspace__slug=slug)
        if portal_id:
            base_qs = base_qs.filter(portal_id=portal_id)

        # --- KPIs ---
        current_qs = base_qs.filter(
            created_at__gte=current_range["gte"],
            created_at__lte=current_range["lte"],
        )
        total_current = current_qs.count()

        terminal_ids = list(
            HelpdeskStatus.objects.filter(workspace__slug=slug, is_terminal=True).values_list("id", flat=True)
        )
        resolved_current = current_qs.filter(status_id__in=terminal_ids).count()
        workspace = Workspace.objects.filter(slug=slug).only("id").first()
        active_status_ids = get_helpdesk_active_status_ids(workspace, []) if workspace else []
        open_current = current_qs.filter(status_id__in=active_status_ids).count() + current_qs.filter(
            status__isnull=True
        ).count()

        total_previous = None
        pct_change = None
        if previous_range:
            total_previous = base_qs.filter(
                created_at__gte=previous_range["gte"],
                created_at__lte=previous_range["lte"],
            ).count()
            pct_change = _safe_pct_change(total_current, total_previous)

        avg_response_td = (
            current_qs.filter(first_responded_at__isnull=False)
            .annotate(
                response_duration=ExpressionWrapper(
                    F("first_responded_at") - F("created_at"),
                    output_field=fields.DurationField(),
                )
            )
            .aggregate(avg=Avg("response_duration"))["avg"]
        )

        avg_resolution_td = (
            current_qs.filter(resolved_at__isnull=False)
            .annotate(
                resolution_duration=ExpressionWrapper(
                    F("resolved_at") - F("created_at"),
                    output_field=fields.DurationField(),
                )
            )
            .aggregate(avg=Avg("resolution_duration"))["avg"]
        )

        # --- SLA ---
        portal = None
        sla_data = {
            "first_response_pct": None,
            "resolution_pct": None,
            "sla_first_response_hours": None,
            "sla_resolution_hours": None,
            "scope": "ambiguous",
            "historical_cutoff": self.SLA_HISTORY_CUTOFF,
            "historical_note": (
                f"SLA compliance is reliable for requests created on or after {self.SLA_HISTORY_CUTOFF} "
                "or when response/resolution timestamps are present."
            ),
        }
        if portal_id:
            portal = HelpdeskPortal.objects.filter(id=portal_id, workspace__slug=slug).first()
            sla_data["scope"] = "portal"
        else:
            workspace_portals = list(HelpdeskPortal.objects.filter(workspace__slug=slug))
            if len(workspace_portals) == 1:
                portal = workspace_portals[0]
                sla_data["scope"] = "workspace_default"
            elif len(workspace_portals) > 1:
                portal = None
                sla_data["scope"] = "ambiguous"

        if portal:
            sla_data["sla_first_response_hours"] = portal.sla_first_response_hours
            sla_data["sla_resolution_hours"] = portal.sla_resolution_hours

            if portal.sla_first_response_hours:
                sla_threshold = timedelta(hours=portal.sla_first_response_hours)
                responded_qs = current_qs.filter(first_responded_at__isnull=False).annotate(
                    response_duration=ExpressionWrapper(
                        F("first_responded_at") - F("created_at"),
                        output_field=fields.DurationField(),
                    )
                )
                total_responded = responded_qs.count()
                if total_responded > 0:
                    within_sla = responded_qs.filter(response_duration__lte=sla_threshold).count()
                    sla_data["first_response_pct"] = round(within_sla / total_responded * 100, 1)

            if portal.sla_resolution_hours:
                sla_threshold = timedelta(hours=portal.sla_resolution_hours)
                resolved_qs = current_qs.filter(resolved_at__isnull=False).annotate(
                    resolution_duration=ExpressionWrapper(
                        F("resolved_at") - F("created_at"),
                        output_field=fields.DurationField(),
                    )
                )
                total_resolved = resolved_qs.count()
                if total_resolved > 0:
                    within_sla = resolved_qs.filter(resolution_duration__lte=sla_threshold).count()
                    sla_data["resolution_pct"] = round(within_sla / total_resolved * 100, 1)

        # --- Charts ---
        trunc_fn = _get_trunc_fn(date_filter)

        requests_over_time = list(
            current_qs.annotate(date=trunc_fn("created_at"))
            .values("date")
            .annotate(count=Count("id"))
            .order_by("date")
            .values("date", "count")
        )

        by_status = list(
            current_qs.filter(status__isnull=False)
            .values("status_id", "status__name", "status__color")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
        by_status_formatted = [
            {
                "status_id": str(row["status_id"]),
                "status_name": row["status__name"],
                "color": row["status__color"],
                "count": row["count"],
            }
            for row in by_status
        ]

        by_source = list(
            current_qs.values("source").annotate(count=Count("id")).order_by("-count")
        )

        resolution_time_trend = list(
            current_qs.filter(resolved_at__isnull=False)
            .annotate(
                date=trunc_fn("created_at"),
                resolution_duration=ExpressionWrapper(
                    F("resolved_at") - F("created_at"),
                    output_field=fields.DurationField(),
                ),
            )
            .values("date")
            .annotate(avg_duration=Avg("resolution_duration"))
            .order_by("date")
        )
        resolution_trend_formatted = [
            {
                "date": str(row["date"].date()) if hasattr(row["date"], "date") else str(row["date"]),
                "avg_hours": _duration_to_hours(row["avg_duration"]),
            }
            for row in resolution_time_trend
        ]

        top_agents = list(
            HelpdeskRequestAssignee.objects.filter(
                request__workspace__slug=slug,
                request__status_id__in=terminal_ids,
                request__resolved_at__gte=current_range["gte"],
                request__resolved_at__lte=current_range["lte"],
            )
            .values("assignee_id", "assignee__display_name")
            .annotate(count=Count("request_id", distinct=True))
            .order_by("-count")[:10]
        )
        top_agents_formatted = [
            {
                "agent_id": str(row["assignee_id"]),
                "display_name": row["assignee__display_name"] or "",
                "count": row["count"],
            }
            for row in top_agents
        ]

        def format_date(val):
            if val is None:
                return None
            if hasattr(val, "date"):
                return str(val.date())
            return str(val)

        return Response(
            {
                "kpis": {
                    "total_requests": {
                        "current": total_current,
                        "previous": total_previous,
                        "pct_change": pct_change,
                    },
                    "open_requests": {"current": open_current},
                    "resolved_requests": {"current": resolved_current},
                    "avg_first_response_hours": {"current": _duration_to_hours(avg_response_td)},
                    "avg_resolution_hours": {"current": _duration_to_hours(avg_resolution_td)},
                },
                "sla": sla_data,
                "charts": {
                    "requests_over_time": [
                        {"date": format_date(row["date"]), "count": row["count"]}
                        for row in requests_over_time
                    ],
                    "by_status": by_status_formatted,
                    "by_source": [{"source": row["source"], "count": row["count"]} for row in by_source],
                    "resolution_time_trend": resolution_trend_formatted,
                    "top_agents": top_agents_formatted,
                },
            }
        )
