from rest_framework import status
from rest_framework.response import Response

from plane.app.views.base import BaseAPIView
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers.kpi import KpiIssueAttributeSerializer
from plane.db.models import Issue, KpiConfig, KpiIssueAttribute, Workspace
from plane.kpi.contract import default_contract, resolve_contract
from plane.kpi.engine import calcular, sample_curve


def _issue_type_name(issue, attribute):
    if attribute is not None and attribute.type_override:
        return attribute.type_override
    if issue.type_id and issue.type is not None:
        return issue.type.name
    return None


def _build_task(issue, attribute):
    return {
        "priority": issue.priority,
        "due_date": issue.target_date,
        "delivered_date": issue.completed_at,
        "difficulty": attribute.difficulty if attribute else None,
        "repetitive": attribute.repetitive if attribute else None,
        "importance": attribute.importance if attribute else None,
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
            .select_related("type", "state", "kpi_attribute")
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
                    "difficulty": task["difficulty"],
                    "repetitive": task["repetitive"],
                    "importance": task["importance"],
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
            ("difficulty", tables.get("difficulty", {})),
            ("repetitive", tables.get("repetitive", {})),
            ("importance", tables.get("importance", {})),
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
                {"issue": str(issue_id), "difficulty": None, "repetitive": None, "importance": None, "type_override": None}
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
