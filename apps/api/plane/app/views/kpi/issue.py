from rest_framework import status
from rest_framework.response import Response

from plane.app.views.base import BaseAPIView
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers.kpi import KpiIssueAttributeSerializer
from plane.db.models import EstimatePoint, Issue, KpiIssueAttribute, Workspace
from plane.kpi.contract import resolve_contract
from plane.kpi.engine import calcular, sample_curve


def _issue_type_name(issue, attribute):
    if attribute is not None and attribute.type_override:
        return attribute.type_override
    if issue.type_id and issue.type is not None:
        return issue.type.name
    return None


def _difficulty_value(issue, attribute):
    """Difficulty key = KPI difficulty estimate point, falling back to native estimate.

    The selected estimate point value is looked up in ``config.tables.difficulty``.
    Fallback to Issue.estimate_point preserves historical KPI data.
    """
    if (
        attribute is not None
        and attribute.difficulty_estimate_point_id
        and attribute.difficulty_estimate_point is not None
    ):
        return attribute.difficulty_estimate_point.value
    if issue.estimate_point_id and issue.estimate_point is not None:
        return issue.estimate_point.value
    return None


def _repetitive_value(attribute):
    if (
        attribute is not None
        and attribute.repetitive_estimate_point_id
        and attribute.repetitive_estimate_point is not None
    ):
        return attribute.repetitive_estimate_point.value
    return attribute.repetitive if attribute else None


def _build_task(issue, attribute):
    return {
        "priority": issue.priority,
        "due_date": issue.target_date,
        "delivered_date": issue.completed_at,
        "difficulty": _difficulty_value(issue, attribute),
        "repetitive": _repetitive_value(attribute),
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

        issues = (
            Issue.issue_objects.filter(workspace=workspace, project_id=project_id)
            .select_related(
                "type",
                "state",
                "kpi_attribute",
                "kpi_attribute__difficulty_estimate_point",
                "kpi_attribute__repetitive_estimate_point",
                "estimate_point",
            )
            .order_by("-created_at")
        )

        results = []
        sum_vp = 0.0
        sum_vf = 0.0
        counts = {"on_time": 0, "early": 0, "late": 0, "pending": 0}

        for issue in issues:
            attribute = getattr(issue, "kpi_attribute", None)
            task = _build_task(issue, attribute)
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
                    "difficulty_estimate_point": (
                        str(attribute.difficulty_estimate_point_id)
                        if attribute and attribute.difficulty_estimate_point_id
                        else None
                    ),
                    "repetitive_estimate_point": (
                        str(attribute.repetitive_estimate_point_id)
                        if attribute and attribute.repetitive_estimate_point_id
                        else None
                    ),
                    "difficulty": task["difficulty"],
                    "repetitive": task["repetitive"],
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

    def _validate_estimate_points(self, data, config, project_id):
        checks = [
            ("difficulty_estimate_point", "difficulty_estimate"),
            ("repetitive_estimate_point", "repetitive_estimate"),
        ]
        for point_field, estimate_field in checks:
            if point_field not in data:
                continue
            point_id = data.get(point_field)
            if point_id in (None, ""):
                continue
            configured_estimate_id = getattr(config, f"{estimate_field}_id", None) if config else None
            if configured_estimate_id is None:
                return f"No {estimate_field} is configured for this project."
            point = EstimatePoint.objects.filter(id=point_id, project_id=project_id).first()
            if point is None or str(point.estimate_id) != str(configured_estimate_id):
                return f"{point_field} is not valid for the configured {estimate_field}."
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
                    "difficulty_estimate_point": None,
                    "repetitive_estimate_point": None,
                    "type_override": None,
                }
            )
        return Response(KpiIssueAttributeSerializer(attribute).data)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def put(self, request, slug, project_id, issue_id):
        workspace = Workspace.objects.get(slug=slug)
        # Validate categorical levels against the effective config.
        contract, config = resolve_contract(workspace, project_id)
        error = self._validate_levels(request.data, contract)
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)
        error = self._validate_estimate_points(request.data, config, project_id)
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


def _get_issue_and_attribute(slug, project_id, issue_id):
    issue = Issue.objects.filter(workspace__slug=slug, project_id=project_id, id=issue_id).first()
    if issue is None:
        return None, None
    attribute, _ = KpiIssueAttribute.objects.get_or_create(
        workspace=issue.workspace,
        project_id=project_id,
        issue=issue,
    )
    return issue, attribute


def _configured_estimate_error(config, estimate_field):
    if config is None or getattr(config, f"{estimate_field}_id", None) is None:
        return f"No {estimate_field} is configured for this project."
    return None


def _estimate_point_for_config(point_id, project_id, estimate_id):
    if point_id in (None, ""):
        return None
    return EstimatePoint.objects.filter(id=point_id, project_id=project_id, estimate_id=estimate_id).first()


class KpiIssueEstimateEndpoint(BaseAPIView):
    """Set KPI Difficulty estimate point without changing Issue.estimate_point.

    This keeps the legacy route as a compatibility alias. Body:
    ``{"estimate_point": "<id>" | null}``.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def put(self, request, slug, project_id, issue_id):
        workspace = Workspace.objects.get(slug=slug)
        _, config = resolve_contract(workspace, project_id)
        issue, attribute = _get_issue_and_attribute(slug, project_id, issue_id)
        if issue is None:
            return Response({"error": "Issue not found."}, status=status.HTTP_404_NOT_FOUND)

        estimate_point_id = request.data.get("estimate_point")

        if estimate_point_id in (None, ""):
            attribute.difficulty_estimate_point = None
            attribute.save(update_fields=["difficulty_estimate_point", "updated_at"])
            return Response(
                {"issue": str(issue_id), "estimate_point": None, "difficulty_estimate_point": None}
            )

        error = _configured_estimate_error(config, "difficulty_estimate")
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

        point = _estimate_point_for_config(estimate_point_id, project_id, config.difficulty_estimate_id)
        if point is None:
            return Response(
                {"error": "estimate_point is not valid for the configured difficulty_estimate."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        attribute.difficulty_estimate_point = point
        attribute.save(update_fields=["difficulty_estimate_point", "updated_at"])
        return Response(
            {
                "issue": str(issue_id),
                "estimate_point": str(point.id),
                "difficulty_estimate_point": str(point.id),
            }
        )


class KpiIssueRepetitiveEstimateEndpoint(BaseAPIView):
    """Set KPI Repetitive estimate point without using the legacy text field."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def put(self, request, slug, project_id, issue_id):
        workspace = Workspace.objects.get(slug=slug)
        _, config = resolve_contract(workspace, project_id)
        issue, attribute = _get_issue_and_attribute(slug, project_id, issue_id)
        if issue is None:
            return Response({"error": "Issue not found."}, status=status.HTTP_404_NOT_FOUND)

        estimate_point_id = request.data.get("estimate_point")

        if estimate_point_id in (None, ""):
            attribute.repetitive_estimate_point = None
            attribute.save(update_fields=["repetitive_estimate_point", "updated_at"])
            return Response({"issue": str(issue_id), "repetitive_estimate_point": None})

        error = _configured_estimate_error(config, "repetitive_estimate")
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

        point = _estimate_point_for_config(estimate_point_id, project_id, config.repetitive_estimate_id)
        if point is None:
            return Response(
                {"error": "estimate_point is not valid for the configured repetitive_estimate."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        attribute.repetitive_estimate_point = point
        attribute.save(update_fields=["repetitive_estimate_point", "updated_at"])
        return Response({"issue": str(issue_id), "repetitive_estimate_point": str(point.id)})


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
