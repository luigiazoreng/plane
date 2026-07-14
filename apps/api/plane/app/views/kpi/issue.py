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
    Workspace,
)
from plane.kpi.contract import resolve_contract
from plane.kpi.engine import calcular, sample_curve


def _issue_type_name(issue, attribute):
    if attribute is not None and attribute.type_override:
        return attribute.type_override
    if issue.type_id and issue.type is not None:
        return issue.type.name
    return None


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
        "type": _issue_type_name(issue, attribute),
    }


def _status_of(completed_at, d):
    if completed_at is None or d is None:
        return "pending"
    if d > 0:
        return "late"
    if d < 0:
        return "early"
    return "on_time"


class KpiIssueListEndpoint(BaseAPIView):
    """List a project's work items with computed Vp/d/p/Vf plus aggregates."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        workspace = Workspace.objects.get(slug=slug)
        contract, _ = resolve_contract(workspace, project_id)

        issues = list(
            Issue.issue_objects.filter(workspace=workspace, project_id=project_id)
            .select_related("type", "state", "kpi_attribute", "estimate_point")
            .order_by("-created_at")
        )
        resolver = KpiPropertyResolver(issues)

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
                    "total": len(results),
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

        issues = list(
            Issue.issue_objects.filter(workspace=workspace, project_id=project_id)
            .select_related("type", "state", "kpi_attribute", "estimate_point")
            .prefetch_related("assignees")
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

            assignees = list(issue.assignees.all())
            if not assignees:
                unassigned_count += 1
                continue

            n = len(assignees)
            vp_share = calc["Vp"] / n
            vf_share = (calc["Vf"] / n) if calc["Vf"] is not None else None

            for user in assignees:
                bucket = buckets.setdefault(
                    str(user.id),
                    {
                        "user_id": str(user.id),
                        "display_name": user.display_name,
                        "avatar_url": user.avatar_url,
                        "sum_vp": 0.0,
                        "sum_vf": 0.0,
                        "counts": {"on_time": 0, "early": 0, "late": 0, "pending": 0},
                    },
                )
                bucket["sum_vp"] += vp_share
                if vf_share is not None:
                    bucket["sum_vf"] += vf_share
                bucket["counts"][row_status] += 1

        decimals = contract["params"].get("vf_decimals", 2)
        results = []
        for bucket in buckets.values():
            bucket["sum_vp"] = round(bucket["sum_vp"], decimals)
            bucket["sum_vf"] = round(bucket["sum_vf"], decimals)
            bucket["efficiency"] = round(bucket["sum_vf"] / bucket["sum_vp"], 4) if bucket["sum_vp"] else None
            results.append(bucket)

        results.sort(key=lambda r: r["sum_vf"], reverse=True)

        return Response({"results": results, "unassigned_count": unassigned_count})


class WorkspaceKpiMemberAggregateEndpoint(BaseAPIView):
    """Per-member breakdown of Vp/Vf across ALL projects in a workspace."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)

        issues = list(
            Issue.issue_objects.filter(workspace=workspace)
            .select_related("type", "state", "kpi_attribute", "estimate_point")
            .prefetch_related("assignees")
        )
        resolver = KpiPropertyResolver(issues)

        buckets = {}
        unassigned_count = 0
        contracts_by_project = {}

        def get_contract(project_id):
            if project_id not in contracts_by_project:
                contract, _ = resolve_contract(workspace, project_id)
                contracts_by_project[project_id] = contract
            return contracts_by_project[project_id]

        for issue in issues:
            attribute = getattr(issue, "kpi_attribute", None)
            difficulty_point, repetitive_point = resolver.points_for(issue)
            task = _build_task(issue, attribute, difficulty_point, repetitive_point)
            contract = get_contract(issue.project_id)
            calc = calcular(task, contract)
            row_status = _status_of(issue.completed_at, calc["d"])

            assignees = list(issue.assignees.all())
            if not assignees:
                unassigned_count += 1
                continue

            n = len(assignees)
            vp_share = calc["Vp"] / n
            vf_share = (calc["Vf"] / n) if calc["Vf"] is not None else None

            for user in assignees:
                bucket = buckets.setdefault(
                    str(user.id),
                    {
                        "user_id": str(user.id),
                        "display_name": user.display_name,
                        "avatar_url": user.avatar_url,
                        "sum_vp": 0.0,
                        "sum_vf": 0.0,
                        "counts": {"on_time": 0, "early": 0, "late": 0, "pending": 0},
                    },
                )
                bucket["sum_vp"] += vp_share
                if vf_share is not None:
                    bucket["sum_vf"] += vf_share
                bucket["counts"][row_status] += 1

        ws_contract, _ = resolve_contract(workspace, None)
        decimals = ws_contract["params"].get("vf_decimals", 2)
        
        results = []
        for bucket in buckets.values():
            bucket["sum_vp"] = round(bucket["sum_vp"], decimals)
            bucket["sum_vf"] = round(bucket["sum_vf"], decimals)
            bucket["efficiency"] = round(bucket["sum_vf"] / bucket["sum_vp"], 4) if bucket["sum_vp"] else None
            results.append(bucket)

        results.sort(key=lambda r: r["sum_vf"], reverse=True)

        return Response({"results": results, "unassigned_count": unassigned_count})


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
