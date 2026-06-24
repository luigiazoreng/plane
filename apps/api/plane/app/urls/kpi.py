from django.urls import path

from plane.app.views.kpi import (
    KpiWorkspaceConfigEndpoint,
    KpiProjectConfigEndpoint,
    KpiIssueListEndpoint,
    KpiIssueAttributeEndpoint,
    KpiPreviewEndpoint,
)

urlpatterns = [
    # Workspace-default config
    path(
        "workspaces/<str:slug>/kpi/config/",
        KpiWorkspaceConfigEndpoint.as_view(),
        name="kpi-workspace-config",
    ),
    # Per-project config (with inheritance)
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/kpi/config/",
        KpiProjectConfigEndpoint.as_view(),
        name="kpi-project-config",
    ),
    # Project issues with computed KPI values + aggregates
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/kpi/issues/",
        KpiIssueListEndpoint.as_view(),
        name="kpi-issues",
    ),
    # Per-issue KPI attributes
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/kpi/issues/<uuid:issue_id>/attributes/",
        KpiIssueAttributeEndpoint.as_view(),
        name="kpi-issue-attributes",
    ),
    # Preview / curve recompute (no persistence)
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/kpi/preview/",
        KpiPreviewEndpoint.as_view(),
        name="kpi-preview",
    ),
]
