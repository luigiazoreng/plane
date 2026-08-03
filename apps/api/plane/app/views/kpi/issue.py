from datetime import date, datetime, time, timedelta

from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.views.base import BaseAPIView
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers.kpi import KpiIssueAttributeSerializer
from plane.db.models import (
    EstimateProperty,
    EstimatePropertyRole,
    Issue,
    IssueEstimatePropertyValue,
    KpiIssueAttribute,
    Project,
    Workspace,
)
from plane.kpi.contract import resolve_contract, resolve_contracts_bulk
from plane.kpi.engine import calcular, sample_curve


def _issue_labels(issue, attribute):
    if attribute is not None and attribute.type_override:
        # Fallback to scalar override if it exists (legacy compatibility)
        return [attribute.type_override]
    return [str(label.id) for label in issue.labels.all()]


class KpiPropertyResolver:
    """Bulk-resolves the project's Difficulty/Repetitive EstimateProperty and each
    issue's selected IssueEstimatePropertyValue, to avoid N+1 queries across
    KpiIssueListEndpoint / KpiMemberAggregateEndpoint /
    WorkspaceKpiMemberAggregateEndpoint. `issues` must be a materialized list
    (not a lazy queryset), since every issue's id/project_id is needed upfront.
    """

    def __init__(self, issues):
        project_ids = {issue.project_id for issue in issues}
        self._property_ids_by_project = {pid: {} for pid in project_ids}
        for row in EstimateProperty.objects.filter(project_id__in=project_ids, kpi_role__isnull=False).values(
            "project_id", "kpi_role", "id"
        ):
            self._property_ids_by_project[row["project_id"]][row["kpi_role"]] = row["id"]

        all_property_ids = {pid for roles in self._property_ids_by_project.values() for pid in roles.values()}
        self._points = {}
        if all_property_ids:
            issue_ids = [issue.id for issue in issues]
            for value in IssueEstimatePropertyValue.objects.filter(
                issue_id__in=issue_ids, property_id__in=all_property_ids, estimate_point__isnull=False
            ).select_related("estimate_point"):
                self._points[(value.issue_id, value.property_id)] = value.estimate_point

    def points_for(self, issue):
        """Returns (difficulty_point, repetitive_point), either an EstimatePoint or None."""
        roles = self._property_ids_by_project.get(issue.project_id, {})
        difficulty_property_id = roles.get(EstimatePropertyRole.DIFFICULTY)
        repetitive_property_id = roles.get(EstimatePropertyRole.REPETITIVE)
        difficulty_point = self._points.get((issue.id, difficulty_property_id)) if difficulty_property_id else None
        repetitive_point = self._points.get((issue.id, repetitive_property_id)) if repetitive_property_id else None
        return difficulty_point, repetitive_point


def _difficulty_lookup_key(issue, difficulty_point):
    """Difficulty key for config.tables.difficulty = the resolved Difficulty
    EstimateProperty's point id, falling back to the native Issue.estimate_point id.

    Keyed by EstimatePoint id, not value, so renaming a point's value doesn't
    silently zero its configured contribution to Vp (see migration
    0145_kpi_difficulty_rekey_by_point_id). Use _difficulty_display_value for the
    human-readable value instead -- this key is for the engine lookup only.
    """
    if difficulty_point is not None:
        return str(difficulty_point.id)
    if issue.estimate_point_id and issue.estimate_point is not None:
        return str(issue.estimate_point_id)
    return None


def _difficulty_display_value(issue, difficulty_point):
    """Human-readable difficulty value for display; not used in Vp calculation."""
    if difficulty_point is not None:
        return difficulty_point.value
    if issue.estimate_point_id and issue.estimate_point is not None:
        return issue.estimate_point.value
    return None


def _repetitive_lookup_key(attribute, repetitive_point):
    """Repetitive key for config.tables.repetitive = the resolved Repetitive
    EstimateProperty's point id when configured, else the legacy free-text label.
    Keyed by point id (not value) for the same rename-safety reason as
    _difficulty_lookup_key.
    """
    if repetitive_point is not None:
        return str(repetitive_point.id)
    return attribute.repetitive if attribute else None


def _repetitive_display_value(attribute, repetitive_point):
    """Human-readable repetitive value for display; not used in Vp calculation."""
    if repetitive_point is not None:
        return repetitive_point.value
    return attribute.repetitive if attribute else None


def _build_task(issue, attribute, difficulty_point, repetitive_point):
    return {
        "priority": issue.priority,
        "due_date": issue.target_date,
        "delivered_date": issue.completed_at,
        "difficulty": _difficulty_lookup_key(issue, difficulty_point),
        "repetitive": _repetitive_lookup_key(attribute, repetitive_point),
        "type": _issue_labels(issue, attribute),
    }


def _status_of(completed_at, d):
    if completed_at is None or d is None:
        return "pending"
    if d > 0:
        return "late"
    if d < 0:
        return "early"
    return "on_time"


def _empty_counts():
    return {"on_time": 0, "early": 0, "late": 0, "pending": 0}


def _accumulate_member_buckets(issue, calc, row_status, buckets):
    """Add an issue's Vp/Vf to each of its assignees' buckets, split equally.

    A work item with N assignees gives each of them Vp/N and Vf/N, so the sum of
    every member's score matches the project-wide total. Returns False when the
    issue has no assignee (the caller counts those separately) -- a mixed
    "Unassigned" row would distort a ranking of real people.

    Only delivered items (``calc["d"] is not None``) contribute to Vp/Vf here,
    matching the project-level rule in KpiIssueListEndpoint /
    WorkspaceKpiOverviewEndpoint. A member's raw open-work volume must not by
    itself lower their efficiency -- only their delivered work's Vf/Vp ratio
    does. Pending items still count toward `counts["pending"]` so the workload
    stays visible, it just no longer feeds the score.
    """
    assignees = list(issue.assignees.all())
    if not assignees:
        return False

    n = len(assignees)
    delivered = calc["d"] is not None
    vp_share = calc["Vp"] / n if delivered else 0.0
    vf_share = (calc["Vf"] / n) if delivered and calc["Vf"] is not None else None

    for user in assignees:
        bucket = buckets.setdefault(
            str(user.id),
            {
                "user_id": str(user.id),
                "display_name": user.display_name,
                "avatar_url": user.avatar_url,
                "sum_vp": 0.0,
                "sum_vf": 0.0,
                "counts": _empty_counts(),
            },
        )
        bucket["sum_vp"] += vp_share
        if vf_share is not None:
            bucket["sum_vf"] += vf_share
        bucket["counts"][row_status] += 1
    return True


def _finalize_member_buckets(buckets, decimals):
    """Round the accumulated buckets, derive efficiency and rank by final score."""
    results = []
    for bucket in buckets.values():
        bucket["sum_vp"] = round(bucket["sum_vp"], decimals)
        bucket["sum_vf"] = round(bucket["sum_vf"], decimals)
        bucket["efficiency"] = round(bucket["sum_vf"] / bucket["sum_vp"], 4) if bucket["sum_vp"] else None
        results.append(bucket)

    results.sort(key=lambda r: r["sum_vf"], reverse=True)
    return results


def _active_kpi_projects(workspace, user):
    """Projects of the workspace whose KPI panel is enabled AND the user belongs to.

    Every filter matters: ``kpi_view`` is the per-project feature toggle (the
    "active KPIs" the workspace panel consolidates); the membership filter keeps
    a workspace-wide endpoint from leaking scores of projects the requester
    cannot open; and archived projects are dropped so finished work stops moving
    the current number. All three mirror the guards other workspace-level
    endpoints apply (see plane.app.views.workspace).
    """
    return (
        Project.objects.filter(
            workspace=workspace,
            kpi_view=True,
            archived_at__isnull=True,
            project_projectmember__member=user,
            project_projectmember__is_active=True,
        )
        .distinct()
        .order_by("name")
    )


# Period presets, in days. "all" disables the filter.
PERIOD_DAYS = {"7d": 7, "30d": 30, "90d": 90, "180d": 180, "365d": 365}
DEFAULT_PERIOD = "90d"
PERIOD_ERROR = "Invalid period. Use period=7d|30d|90d|180d|365d|all or start=&end= as YYYY-MM-DD."


def _resolve_period(request, default=DEFAULT_PERIOD):
    """Resolve the requested reporting window.

    Accepts either ``?period=7d|30d|90d|180d|365d|all`` or an explicit
    ``?start=YYYY-MM-DD&end=YYYY-MM-DD``. Returns
    ``(key, start_date_or_None, end_date_or_None)``; both dates are None for
    the "all" window. ``default`` is what an absent ``period`` param means --
    the project endpoints pass "all" so that callers predating the parameter
    keep their previous unfiltered behaviour.
    """
    start_param = request.GET.get("start")
    end_param = request.GET.get("end")
    if start_param and end_param:
        try:
            start = date.fromisoformat(start_param)
            end = date.fromisoformat(end_param)
        except ValueError:
            return None, None, None
        if start > end:
            return None, None, None
        return "custom", start, end

    period = request.GET.get("period", default)
    if period == "all":
        return "all", None, None
    if period not in PERIOD_DAYS:
        return None, None, None

    end = timezone.now().date()
    return period, end - timedelta(days=PERIOD_DAYS[period]), end


def _period_filter(start, end):
    """Q object selecting the issues that belong to the reporting window.

    A delivered item is placed by ``completed_at``; an open one has no delivery
    date, so it is placed by its due date instead. That keeps pending work whose
    deadline falls in the window while dropping items delivered long ago.
    """
    if start is None or end is None:
        return Q()
    start_dt = timezone.make_aware(datetime.combine(start, time.min))
    end_dt = timezone.make_aware(datetime.combine(end, time.max))
    return Q(completed_at__gte=start_dt, completed_at__lte=end_dt) | Q(
        completed_at__isnull=True, target_date__gte=start, target_date__lte=end
    )


class KpiIssueListEndpoint(BaseAPIView):
    """List a project's work items with computed Vp/d/p/Vf plus aggregates.

    Honours the same ``?period=``/``?start=&end=`` window as the workspace
    panel; omitting it defaults to ``all`` so existing callers keep the
    unfiltered, whole-project view they were written against.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        workspace = Workspace.objects.get(slug=slug)
        contract, _ = resolve_contract(workspace, project_id)

        period_key, start, end = _resolve_period(request, default="all")
        if period_key is None:
            return Response({"error": PERIOD_ERROR}, status=status.HTTP_400_BAD_REQUEST)

        issues = list(
            Issue.issue_objects.filter(workspace=workspace, project_id=project_id)
            .filter(_period_filter(start, end))
            .select_related("state", "kpi_attribute", "estimate_point")
            .order_by("-created_at")
        )
        resolver = KpiPropertyResolver(issues)

        aggregates_only = request.GET.get("aggregates_only", "false").lower() == "true"

        results = []
        sum_vp = 0.0
        sum_vf = 0.0
        counts = {"on_time": 0, "early": 0, "late": 0, "pending": 0}

        for issue in issues:
            attribute = getattr(issue, "kpi_attribute", None)
            difficulty_point, repetitive_point = resolver.points_for(issue)
            task = _build_task(issue, attribute, difficulty_point, repetitive_point)
            calc = calcular(task, contract)
            row_status = _status_of(issue.completed_at, calc["d"])
            counts[row_status] += 1
            if calc["d"] is not None:
                sum_vp += calc["Vp"]
                sum_vf += calc["Vf"] if calc["Vf"] is not None else 0.0

            if not aggregates_only:
                results.append(
                    {
                        "id": str(issue.id),
                        "name": issue.name,
                        "sequence_id": issue.sequence_id,
                        "priority": issue.priority,
                        "target_date": issue.target_date,
                        "completed_at": issue.completed_at,
                        "state_group": issue.state.group if issue.state_id else None,
                        "estimate_point": str(issue.estimate_point_id) if issue.estimate_point_id else None,
                        "difficulty_estimate_point": str(difficulty_point.id) if difficulty_point else None,
                        "repetitive_estimate_point": str(repetitive_point.id) if repetitive_point else None,
                        "difficulty": _difficulty_display_value(issue, difficulty_point),
                        "repetitive": _repetitive_display_value(attribute, repetitive_point),
                        "type": task["type"],
                        "vp": calc["Vp"],
                        "d": calc["d"],
                        "p": calc["p"],
                        "vf": calc["Vf"],
                        "status": row_status,
                    }
                )

        decimals = contract["params"].get("vf_decimals", 2)
        efficiency = round(sum_vf / sum_vp, 4) if sum_vp else None

        return Response(
            {
                "results": results,
                "aggregates": {
                    "sum_vp": round(sum_vp, decimals),
                    "sum_vf": round(sum_vf, decimals),
                    "efficiency": efficiency,
                    "counts": counts,
                    "total": len(issues),
                },
                "period": {
                    "key": period_key,
                    "start": start.isoformat() if start else None,
                    "end": end.isoformat() if end else None,
                },
            }
        )


class KpiMemberAggregateEndpoint(BaseAPIView):
    """Per-member breakdown of Vp/Vf for a project's work items.

    Each issue's Vp/Vf is split equally across its assignees so the sum of
    all members' scores matches the project-wide totals from
    ``KpiIssueListEndpoint``. Issues without an assignee are omitted from
    ``results`` (a mixed "Unassigned" row would distort a ranking of real
    people) but are counted in ``unassigned_count``.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        workspace = Workspace.objects.get(slug=slug)
        contract, _ = resolve_contract(workspace, project_id)

        period_key, start, end = _resolve_period(request, default="all")
        if period_key is None:
            return Response({"error": PERIOD_ERROR}, status=status.HTTP_400_BAD_REQUEST)

        issues = list(
            Issue.issue_objects.filter(workspace=workspace, project_id=project_id)
            .filter(_period_filter(start, end))
            .select_related("kpi_attribute", "estimate_point")
            .prefetch_related("assignees", "labels")
        )
        resolver = KpiPropertyResolver(issues)

        buckets = {}
        unassigned_count = 0

        for issue in issues:
            attribute = getattr(issue, "kpi_attribute", None)
            difficulty_point, repetitive_point = resolver.points_for(issue)
            task = _build_task(issue, attribute, difficulty_point, repetitive_point)
            calc = calcular(task, contract)
            row_status = _status_of(issue.completed_at, calc["d"])

            if not _accumulate_member_buckets(issue, calc, row_status, buckets):
                unassigned_count += 1

        decimals = contract["params"].get("vf_decimals", 2)
        return Response(
            {
                "results": _finalize_member_buckets(buckets, decimals),
                "unassigned_count": unassigned_count,
                "period": {
                    "key": period_key,
                    "start": start.isoformat() if start else None,
                    "end": end.isoformat() if end else None,
                },
            }
        )


class WorkspaceKpiMemberAggregateEndpoint(BaseAPIView):
    """Per-member breakdown of Vp/Vf across the workspace's active KPI projects.

    Scoped to projects with ``kpi_view`` enabled that the requester is a member
    of, so the ranking covers exactly the projects whose KPI panel they can open.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        project_ids = list(_active_kpi_projects(workspace, request.user).values_list("id", flat=True))
        contracts = resolve_contracts_bulk(workspace, project_ids)

        issues = list(
            Issue.issue_objects.filter(workspace=workspace, project_id__in=project_ids)
            .select_related("kpi_attribute", "estimate_point")
            .prefetch_related("assignees", "labels")
        )
        resolver = KpiPropertyResolver(issues)

        buckets = {}
        unassigned_count = 0

        for issue in issues:
            attribute = getattr(issue, "kpi_attribute", None)
            difficulty_point, repetitive_point = resolver.points_for(issue)
            task = _build_task(issue, attribute, difficulty_point, repetitive_point)
            contract, _ = contracts[issue.project_id]
            calc = calcular(task, contract)
            row_status = _status_of(issue.completed_at, calc["d"])

            if not _accumulate_member_buckets(issue, calc, row_status, buckets):
                unassigned_count += 1

        ws_contract, _ = resolve_contract(workspace, None)
        decimals = ws_contract["params"].get("vf_decimals", 2)
        return Response(
            {
                "results": _finalize_member_buckets(buckets, decimals),
                "unassigned_count": unassigned_count,
            }
        )


class WorkspaceKpiOverviewEndpoint(BaseAPIView):
    """Consolidated KPI panel for the whole workspace.

    Vf is NOT comparable across projects: ``tables.difficulty`` is keyed by each
    project's own EstimatePoint ids, and priority points / ``b`` / ``k`` /
    ``penalty_mode`` may diverge per project. Summing Vf would silently let the
    project with the largest point tables dominate the number.

    Efficiency (Vf/Vp) is dimensionless, so the unified KPI is the mean of each
    project's efficiency weighted by how many scored work items it contributed::

        eff_p = sum(Vf_p) / sum(Vp_p)        # scored items only
        KPI   = sum(eff_p * n_p) / sum(n_p)

    Projects with no scored item (or a zero Vp total) have no defined efficiency
    and are listed with ``efficiency: null`` while staying out of the average.

    One pass over the issues feeds all three blocks -- per project, per member
    and the unified summary -- so the panel costs a single scan.

    ``projects``/``unified`` and ``members`` now agree: all three blocks count
    only delivered items in Vp/Vf (see ``_accumulate_member_buckets``). A
    member's raw open-work volume never lowers their efficiency by itself --
    carrying a larger backlog than a teammate must not make someone look less
    efficient than someone who simply has less assigned to them. Open work
    still surfaces via ``counts["pending"]``, just not via Vp/Vf.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)

        period_key, start, end = _resolve_period(request)
        if period_key is None:
            return Response({"error": PERIOD_ERROR}, status=status.HTTP_400_BAD_REQUEST)

        projects = list(_active_kpi_projects(workspace, request.user))
        project_ids = [project.id for project in projects]
        contracts = resolve_contracts_bulk(workspace, project_ids)

        issues = list(
            Issue.issue_objects.filter(workspace=workspace, project_id__in=project_ids)
            .filter(_period_filter(start, end))
            .select_related("kpi_attribute", "estimate_point")
            .prefetch_related("assignees", "labels")
        )
        resolver = KpiPropertyResolver(issues)

        stats = {
            pid: {"sum_vp": 0.0, "sum_vf": 0.0, "scored_items": 0, "counts": _empty_counts()} for pid in project_ids
        }
        buckets = {}
        unassigned_count = 0
        total_counts = _empty_counts()

        for issue in issues:
            attribute = getattr(issue, "kpi_attribute", None)
            difficulty_point, repetitive_point = resolver.points_for(issue)
            task = _build_task(issue, attribute, difficulty_point, repetitive_point)
            contract, _ = contracts[issue.project_id]
            calc = calcular(task, contract)
            row_status = _status_of(issue.completed_at, calc["d"])

            stat = stats[issue.project_id]
            stat["counts"][row_status] += 1
            total_counts[row_status] += 1
            # Only delivered items carry a multiplier; pending ones would drag
            # efficiency toward zero for work that simply is not due yet.
            if calc["d"] is not None:
                stat["sum_vp"] += calc["Vp"]
                stat["sum_vf"] += calc["Vf"] if calc["Vf"] is not None else 0.0
                stat["scored_items"] += 1

            if not _accumulate_member_buckets(issue, calc, row_status, buckets):
                unassigned_count += 1

        ws_contract, _ = resolve_contract(workspace, None)
        decimals = ws_contract["params"].get("vf_decimals", 2)

        total_scored = sum(stat["scored_items"] for stat in stats.values())

        project_rows = []
        weighted_efficiency_sum = 0.0
        projects_in_average = 0
        for project in projects:
            stat = stats[project.id]
            contract, cfg = contracts[project.id]
            efficiency = round(stat["sum_vf"] / stat["sum_vp"], 4) if stat["sum_vp"] else None

            if efficiency is not None:
                weighted_efficiency_sum += efficiency * stat["scored_items"]
                projects_in_average += 1

            project_rows.append(
                {
                    "project_id": str(project.id),
                    "name": project.name,
                    "identifier": project.identifier,
                    "logo_props": project.logo_props,
                    "sum_vp": round(stat["sum_vp"], decimals),
                    "sum_vf": round(stat["sum_vf"], decimals),
                    "efficiency": efficiency,
                    "scored_items": stat["scored_items"],
                    "counts": stat["counts"],
                    "contribution": (
                        round(efficiency * stat["scored_items"] / total_scored, 4)
                        if efficiency is not None and total_scored
                        else None
                    ),
                    "penalty_mode": contract["params"]["penalty_mode"],
                    "k": contract["params"]["k"],
                    "inherited_config": cfg is None or cfg.project_id is None,
                }
            )

        project_rows.sort(key=lambda row: (row["efficiency"] is None, -(row["efficiency"] or 0)))

        unified = {
            "kpi": round(weighted_efficiency_sum / total_scored, 4) if total_scored else None,
            "method": "item_weighted_efficiency",
            "scored_items": total_scored,
            "project_count": len(projects),
            "projects_in_average": projects_in_average,
            # Mixed-scale totals: informative, but never the basis of `kpi`.
            "sum_vp_raw": round(sum(stat["sum_vp"] for stat in stats.values()), decimals),
            "sum_vf_raw": round(sum(stat["sum_vf"] for stat in stats.values()), decimals),
            "counts": total_counts,
        }

        return Response(
            {
                "period": {
                    "key": period_key,
                    "start": start.isoformat() if start else None,
                    "end": end.isoformat() if end else None,
                },
                "unified": unified,
                "projects": project_rows,
                "members": _finalize_member_buckets(buckets, decimals),
                "unassigned_count": unassigned_count,
            }
        )


class KpiIssueAttributeEndpoint(BaseAPIView):
    """Read/update the KPI categorical attributes of a single issue."""

    def _validate_levels(self, data, contract):
        tables = contract["tables"]
        checks = [
            ("repetitive", tables.get("repetitive", {})),
            ("type_override", tables.get("type", {})),
        ]
        for field, table in checks:
            value = data.get(field)
            if value not in (None, "") and value not in table:
                return f"'{value}' is not a valid level for {field}."
        return None

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        attribute = KpiIssueAttribute.objects.filter(
            workspace__slug=slug, project_id=project_id, issue_id=issue_id
        ).first()
        if attribute is None:
            return Response(
                {
                    "issue": str(issue_id),
                    "repetitive": None,
                    "type_override": None,
                }
            )
        return Response(KpiIssueAttributeSerializer(attribute).data)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def put(self, request, slug, project_id, issue_id):
        workspace = Workspace.objects.get(slug=slug)
        # Validate categorical levels against the effective config.
        contract, _ = resolve_contract(workspace, project_id)
        error = self._validate_levels(request.data, contract)
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

        issue = Issue.objects.filter(workspace=workspace, project_id=project_id, id=issue_id).first()
        if issue is None:
            return Response({"error": "Issue not found."}, status=status.HTTP_404_NOT_FOUND)

        attribute = KpiIssueAttribute.objects.filter(issue=issue).first()
        serializer = KpiIssueAttributeSerializer(
            instance=attribute, data=request.data, partial=bool(attribute)
        )
        serializer.is_valid(raise_exception=True)
        serializer.save(workspace=workspace, project_id=project_id, issue=issue)
        return Response(serializer.data)


ALLOWED_PRIORITIES = {"urgent", "high", "medium", "low", "none"}


class KpiIssuePriorityEndpoint(BaseAPIView):
    """Set the issue's native priority (Importance source) from the KPI table.

    Importance (I) is driven by ``Issue.priority``; this lets the KPI screen edit
    the same priority the rest of Plane uses. Body:
    ``{"priority": "<urgent|high|medium|low|none>"}``.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def put(self, request, slug, project_id, issue_id):
        issue = Issue.objects.filter(workspace__slug=slug, project_id=project_id, id=issue_id).first()
        if issue is None:
            return Response({"error": "Issue not found."}, status=status.HTTP_404_NOT_FOUND)

        priority = request.data.get("priority")
        if priority not in ALLOWED_PRIORITIES:
            return Response(
                {"error": f"priority must be one of {sorted(ALLOWED_PRIORITIES)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Direct queryset update: Issue.save() re-derives completed_at from the
        # state, which is unrelated to this priority change.
        Issue.objects.filter(id=issue.id).update(priority=priority)
        return Response({"issue": str(issue_id), "priority": priority})


class KpiPreviewEndpoint(BaseAPIView):
    """Recompute p(d)/Vf for an arbitrary payload, without persisting.

    Body: ``{"task": {...}, "config": {...optional override...}}``.
    Returns the single result plus the p(d) curve for the task's priority.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def post(self, request, slug, project_id):
        workspace = Workspace.objects.get(slug=slug)
        override = request.data.get("config")
        if override and "tables" in override and "params" in override:
            contract = override
        else:
            contract, _ = resolve_contract(workspace, project_id)

        task = request.data.get("task", {})
        result = calcular(task, contract)

        priority_row = contract["tables"].get("priority", {}).get(task.get("priority"))
        b = priority_row.get("b", 0.0) if priority_row else 0.0
        d_min = request.data.get("d_min", -3)
        d_max = request.data.get("d_max", 20)
        curve = sample_curve(b, contract, d_min=d_min, d_max=d_max)

        return Response({"result": result, "curve": curve, "b": b})
