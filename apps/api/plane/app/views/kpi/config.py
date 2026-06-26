from rest_framework import status
from rest_framework.response import Response

from plane.app.views.base import BaseAPIView
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers.kpi import KpiConfigSerializer
from plane.db.models import KpiConfig, Workspace
from plane.kpi.contract import default_contract


def _default_payload(inherited, project_id=None):
    """Synthetic payload (id=None) when no KpiConfig row exists yet."""
    contract = default_contract()
    return {
        "id": None,
        "name": "KPI Configuration",
        "tables": contract["tables"],
        "is_active": True,
        "is_default_seed": True,
        "inherited": inherited,
        "project": project_id,
        "difficulty_estimate": None,
        "repetitive_estimate": None,
        **contract["params"],
    }


def _config_payload(cfg, inherited):
    data = KpiConfigSerializer(cfg).data
    data["is_default_seed"] = False
    data["inherited"] = inherited
    return data


class KpiWorkspaceConfigEndpoint(BaseAPIView):
    """Workspace-default KPI config (project=null)."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        cfg = KpiConfig.objects.filter(workspace=workspace, project__isnull=True).first()
        if cfg is None:
            return Response(_default_payload(inherited=False))
        return Response(_config_payload(cfg, inherited=False))

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def put(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        cfg = KpiConfig.objects.filter(workspace=workspace, project__isnull=True).first()
        serializer = KpiConfigSerializer(
            instance=cfg,
            data=request.data,
            partial=bool(cfg),
            context={"project_estimates_allowed": False},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save(workspace=workspace, project=None)
        return Response(_config_payload(serializer.instance, inherited=False))


class KpiProjectConfigEndpoint(BaseAPIView):
    """Per-project KPI config with workspace-default inheritance on GET."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        workspace = Workspace.objects.get(slug=slug)
        cfg = KpiConfig.objects.filter(workspace=workspace, project_id=project_id).first()
        if cfg is not None:
            return Response(_config_payload(cfg, inherited=False))
        # Fall back to the workspace default, then the seed defaults.
        ws_cfg = KpiConfig.objects.filter(workspace=workspace, project__isnull=True).first()
        if ws_cfg is not None:
            return Response(_config_payload(ws_cfg, inherited=True))
        return Response(_default_payload(inherited=True, project_id=project_id))

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def put(self, request, slug, project_id):
        workspace = Workspace.objects.get(slug=slug)
        cfg = KpiConfig.objects.filter(workspace=workspace, project_id=project_id).first()
        serializer = KpiConfigSerializer(
            instance=cfg,
            data=request.data,
            partial=bool(cfg),
            context={"project_id": project_id},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save(workspace=workspace, project_id=project_id)
        return Response(_config_payload(serializer.instance, inherited=False))

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def delete(self, request, slug, project_id):
        """Remove the project override so it falls back to the workspace default."""
        workspace = Workspace.objects.get(slug=slug)
        KpiConfig.objects.filter(workspace=workspace, project_id=project_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
