from django.urls import path

from plane.app.views.kpi import (
    KpiWorkspaceConfigEndpoint,
    KpiProjectConfigEndpoint,
    KpiIssueListEndpoint,
    KpiMemberAggregateEndpoint,
    WorkspaceKpiMemberAggregateEndpoint,
    KpiIssueAttributeEndpoint,
    KpiIssueEstimateEndpoint,
    KpiIssueRepetitiveEstimateEndpoint,
    KpiIssuePriorityEndpoint,
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
    # Workspace members aggregates (across all projects)
    path(
        "workspaces/<str:slug>/kpi/members/",
        WorkspaceKpiMemberAggregateEndpoint.as_view(),
        name="workspace-kpi-member-aggregates",
    ),
    # Project issues with computed KPI values + aggregates
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/kpi/issues/",
        KpiIssueListEndpoint.as_view(),
        name="kpi-issues",
    ),
    # Per-member Vp/Vf breakdown (equal split across assignees)
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/kpi/members/",
        KpiMemberAggregateEndpoint.as_view(),
        name="kpi-member-aggregates",
    ),
    # Per-issue KPI attributes
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/kpi/issues/<uuid:issue_id>/attributes/",
        KpiIssueAttributeEndpoint.as_view(),
        name="kpi-issue-attributes",
    ),
    # Per-issue estimate (Difficulty source)
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/kpi/issues/<uuid:issue_id>/estimate/",
        KpiIssueEstimateEndpoint.as_view(),
        name="kpi-issue-estimate",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/kpi/issues/<uuid:issue_id>/repetitive-estimate/",
        KpiIssueRepetitiveEstimateEndpoint.as_view(),
        name="kpi-issue-repetitive-estimate",
    ),
    # Per-issue priority (Importance source)
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/kpi/issues/<uuid:issue_id>/priority/",
        KpiIssuePriorityEndpoint.as_view(),
        name="kpi-issue-priority",
    ),
    # Preview / curve recompute (no persistence)
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/kpi/preview/",
        KpiPreviewEndpoint.as_view(),
        name="kpi-preview",
    ),
]
