from django.urls import path
from plane.app.views.helpdesk import (
    HelpdeskSSEView,
    HelpdeskSSETokenView,
    HelpdeskCustomerLoginEndpoint,
    HelpdeskCustomerRegisterEndpoint,
    PublicHelpdeskCustomerLoginEndpoint,
    PublicHelpdeskCustomerRegisterEndpoint,
    PublicHelpdeskCustomerForgotPasswordEndpoint,
    PublicHelpdeskCustomerResetPasswordEndpoint,
    HelpdeskPortalViewSet,
    PublicHelpdeskPortalEndpoint,
    HelpdeskPortalEmailLogsEndpoint,
    HelpdeskPortalIMAPLogsEndpoint,
    HelpdeskPortalIMAPSyncEndpoint,
    HelpdeskFormViewSet,
    HelpdeskFormFieldViewSet,
    PublicHelpdeskFormListEndpoint,
    PublicHelpdeskFormDetailEndpoint,
    PublicHelpdeskFormSubmitEndpoint,
    HelpdeskRequestViewSet,
    PublicHelpdeskRequestEndpoint,
    HelpdeskRequestIssueViewSet,
    HelpdeskLinkedIssueLookupEndpoint,
    HelpdeskRequestIntakeIssueViewSet,
    HelpdeskRequestCommentViewSet,
    PublicHelpdeskCommentEndpoint,
    HelpdeskStatusViewSet,
    HelpdeskAnalyticsEndpoint,
    HelpdeskMemberViewSet,
    HelpdeskCustomerViewSet,
    HelpdeskAssetEndpoint,
    PublicHelpdeskAssetEndpoint,
    HelpdeskRequestActivityViewSet,
    HelpdeskCustomerHistoryEndpoint,
    HelpdeskCustomerStatsEndpoint,
    HelpdeskTeamViewSet,
    HelpdeskMacroViewSet,
)
from plane.app.views.helpdesk.inbound import PublicHelpdeskInboundEmailEndpoint

urlpatterns = [
    # --- Customer auth (workspace-level) ---
    path(
        "workspaces/<str:slug>/helpdesk/login/",
        HelpdeskCustomerLoginEndpoint.as_view(),
        name="helpdesk-customer-login",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/register/",
        HelpdeskCustomerRegisterEndpoint.as_view(),
        name="helpdesk-customer-register",
    ),

    # --- Team management (workspace-level) ---
    path(
        "workspaces/<str:slug>/helpdesk/teams/",
        HelpdeskTeamViewSet.as_view({"get": "list", "post": "create"}),
        name="helpdesk-teams",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/teams/<uuid:pk>/",
        HelpdeskTeamViewSet.as_view({
            "get": "retrieve",
            "patch": "partial_update",
            "delete": "destroy",
        }),
        name="helpdesk-team-detail",
    ),

    # --- Macro management (workspace-level) ---
    path(
        "workspaces/<str:slug>/helpdesk/macros/",
        HelpdeskMacroViewSet.as_view({"get": "list", "post": "create"}),
        name="helpdesk-macros",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/macros/<uuid:pk>/",
        HelpdeskMacroViewSet.as_view({
            "get": "retrieve",
            "patch": "partial_update",
            "delete": "destroy",
        }),
        name="helpdesk-macro-detail",
    ),

    # --- Status management (workspace-level) ---
    path(
        "workspaces/<str:slug>/helpdesk/statuses/",
        HelpdeskStatusViewSet.as_view({"get": "list", "post": "create"}),
        name="helpdesk-status",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/statuses/<uuid:pk>/",
        HelpdeskStatusViewSet.as_view({
            "get": "retrieve",
            "patch": "partial_update",
            "delete": "destroy",
        }),
        name="helpdesk-status-detail",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/statuses/reorder/",
        HelpdeskStatusViewSet.as_view({"post": "reorder"}),
        name="helpdesk-status-reorder",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/statuses/<uuid:pk>/set-default/",
        HelpdeskStatusViewSet.as_view({"post": "set_default"}),
        name="helpdesk-status-set-default",
    ),

    # --- Portal management (workspace-level) ---
    path(
        "workspaces/<str:slug>/helpdesk/portals/",
        HelpdeskPortalViewSet.as_view({"get": "list", "post": "create"}),
        name="helpdesk-portal",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/portals/<uuid:pk>/",
        HelpdeskPortalViewSet.as_view({
            "get": "retrieve",
            "put": "update",
            "patch": "partial_update",
            "delete": "destroy",
        }),
        name="helpdesk-portal-detail",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/portals/<uuid:pk>/email-logs/",
        HelpdeskPortalEmailLogsEndpoint.as_view(),
        name="helpdesk-portal-email-logs",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/portals/<uuid:pk>/imap-logs/",
        HelpdeskPortalIMAPLogsEndpoint.as_view(),
        name="helpdesk-portal-imap-logs",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/portals/<uuid:pk>/imap-sync/",
        HelpdeskPortalIMAPSyncEndpoint.as_view(),
        name="helpdesk-portal-imap-sync",
    ),
    # --- Attachments (agent) ---
    path(
        "workspaces/<str:slug>/helpdesk/assets/",
        HelpdeskAssetEndpoint.as_view(),
        name="helpdesk-asset",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/assets/<uuid:asset_id>/",
        HelpdeskAssetEndpoint.as_view(),
        name="helpdesk-asset-detail",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/forms/",
        HelpdeskFormViewSet.as_view({"get": "list", "post": "create"}),
        name="helpdesk-form",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/forms/<uuid:pk>/",
        HelpdeskFormViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="helpdesk-form-detail",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/forms/reorder/",
        HelpdeskFormViewSet.as_view({"post": "reorder"}),
        name="helpdesk-form-reorder",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/forms/<uuid:pk>/set-active/",
        HelpdeskFormViewSet.as_view({"post": "set_active"}),
        name="helpdesk-form-set-active",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/form-fields/",
        HelpdeskFormFieldViewSet.as_view({"get": "list", "post": "create"}),
        name="helpdesk-form-field",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/form-fields/<uuid:pk>/",
        HelpdeskFormFieldViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="helpdesk-form-field-detail",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/form-fields/reorder/",
        HelpdeskFormFieldViewSet.as_view({"post": "reorder"}),
        name="helpdesk-form-field-reorder",
    ),

    # --- Public portal (unchanged) ---
    path(
        "helpdesk/public/portals/<str:public_slug>/",
        PublicHelpdeskPortalEndpoint.as_view(),
        name="public-helpdesk-portal",
    ),
    path(
        "helpdesk/public/portals/<str:public_slug>/forms/",
        PublicHelpdeskFormListEndpoint.as_view(),
        name="public-helpdesk-form-list",
    ),
    path(
        "helpdesk/public/portals/<str:public_slug>/forms/<str:form_slug>/",
        PublicHelpdeskFormDetailEndpoint.as_view(),
        name="public-helpdesk-form-detail",
    ),
    path(
        "helpdesk/public/portals/<str:public_slug>/forms/<str:form_slug>/submit/",
        PublicHelpdeskFormSubmitEndpoint.as_view(),
        name="public-helpdesk-form-submit",
    ),
    path(
        "helpdesk/public/portals/<str:public_slug>/auth/login/",
        PublicHelpdeskCustomerLoginEndpoint.as_view(),
        name="public-helpdesk-customer-login",
    ),
    path(
        "helpdesk/public/portals/<str:public_slug>/auth/register/",
        PublicHelpdeskCustomerRegisterEndpoint.as_view(),
        name="public-helpdesk-customer-register",
    ),
    path(
        "helpdesk/public/portals/<str:public_slug>/auth/forgot-password/",
        PublicHelpdeskCustomerForgotPasswordEndpoint.as_view(),
        name="public-helpdesk-customer-forgot-password",
    ),
    path(
        "helpdesk/public/portals/<str:public_slug>/auth/reset-password/",
        PublicHelpdeskCustomerResetPasswordEndpoint.as_view(),
        name="public-helpdesk-customer-reset-password",
    ),
    path(
        "helpdesk/public/portals/<str:public_slug>/requests/",
        PublicHelpdeskRequestEndpoint.as_view({"get": "list", "post": "create"}),
        name="public-helpdesk-request",
    ),
    path(
        "helpdesk/public/portals/<str:public_slug>/requests/<uuid:pk>/",
        PublicHelpdeskRequestEndpoint.as_view({"get": "retrieve"}),
        name="public-helpdesk-request-detail",
    ),

    # --- Requests (workspace-level) ---
    path(
        "workspaces/<str:slug>/helpdesk/requests/",
        HelpdeskRequestViewSet.as_view({"get": "list", "post": "create"}),
        name="helpdesk-request",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/requests/<uuid:pk>/",
        HelpdeskRequestViewSet.as_view({
            "get": "retrieve",
            "put": "update",
            "patch": "partial_update",
            "delete": "destroy",
        }),
        name="helpdesk-request-detail",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/requests/<uuid:pk>/archive/",
        HelpdeskRequestViewSet.as_view({"post": "archive", "delete": "unarchive"}),
        name="helpdesk-request-archive-unarchive",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/requests/<uuid:pk>/mark-read/",
        HelpdeskRequestViewSet.as_view({"post": "mark_read"}),
        name="helpdesk-request-mark-read",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/requests/<uuid:pk>/bookmark/",
        HelpdeskRequestViewSet.as_view({"post": "toggle_bookmark"}),
        name="helpdesk-request-bookmark",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/requests/<uuid:pk>/snooze/",
        HelpdeskRequestViewSet.as_view({"post": "snooze"}),
        name="helpdesk-request-snooze",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/requests/<uuid:request_pk>/activities/",
        HelpdeskRequestActivityViewSet.as_view({"get": "list"}),
        name="helpdesk-request-activities",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/requests/<uuid:pk>/customer-history/",
        HelpdeskCustomerHistoryEndpoint.as_view(),
        name="helpdesk-request-customer-history",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/requests/<uuid:pk>/customer-stats/",
        HelpdeskCustomerStatsEndpoint.as_view(),
        name="helpdesk-request-customer-stats",
    ),

    # --- Request → Issue links ---
    path(
        "workspaces/<str:slug>/helpdesk/request-issues/",
        HelpdeskRequestIssueViewSet.as_view({"get": "list", "post": "create"}),
        name="helpdesk-request-issue",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/request-issues/<uuid:pk>/",
        HelpdeskRequestIssueViewSet.as_view({"get": "retrieve", "delete": "destroy"}),
        name="helpdesk-request-issue-detail",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/linked-issues/lookup/",
        HelpdeskLinkedIssueLookupEndpoint.as_view(),
        name="helpdesk-linked-issue-lookup",
    ),

    # --- Request → Intake Issue links (forwarding to dev) ---
    path(
        "workspaces/<str:slug>/helpdesk/request-intake-issues/",
        HelpdeskRequestIntakeIssueViewSet.as_view({"get": "list", "post": "create"}),
        name="helpdesk-request-intake-issue",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/request-intake-issues/<uuid:pk>/",
        HelpdeskRequestIntakeIssueViewSet.as_view({"get": "retrieve", "delete": "destroy"}),
        name="helpdesk-request-intake-issue-detail",
    ),

    # --- Comments (workspace-level) ---
    path(
        "workspaces/<str:slug>/helpdesk/requests/<uuid:request_pk>/comments/",
        HelpdeskRequestCommentViewSet.as_view({"get": "list", "post": "create"}),
        name="helpdesk-request-comment",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/requests/<uuid:request_pk>/comments/<uuid:pk>/",
        HelpdeskRequestCommentViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="helpdesk-request-comment-detail",
    ),

    # --- Member management ---
    path(
        "workspaces/<str:slug>/helpdesk/members/",
        HelpdeskMemberViewSet.as_view({"get": "list", "post": "create"}),
        name="helpdesk-member",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/members/<uuid:pk>/",
        HelpdeskMemberViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="helpdesk-member-detail",
    ),

    # --- Customer management (admin) ---
    path(
        "workspaces/<str:slug>/helpdesk/customers/",
        HelpdeskCustomerViewSet.as_view({"get": "list"}),
        name="helpdesk-customer-list",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/customers/<uuid:pk>/",
        HelpdeskCustomerViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="helpdesk-customer-detail",
    ),

    # --- Analytics ---
    path(
        "workspaces/<str:slug>/helpdesk/analytics/",
        HelpdeskAnalyticsEndpoint.as_view(),
        name="helpdesk-analytics",
    ),

    # --- SSE live events ---
    path(
        "workspaces/<str:slug>/helpdesk/sse-token/",
        HelpdeskSSETokenView.as_view(),
        name="helpdesk-sse-token",
    ),
    path(
        "workspaces/<str:slug>/helpdesk/events/",
        HelpdeskSSEView.as_view(),
        name="helpdesk-sse",
    ),

    # --- Public comments ---
    path(
        "helpdesk/public/portals/<str:public_slug>/requests/<uuid:request_pk>/comments/",
        PublicHelpdeskCommentEndpoint.as_view(),
        name="public-helpdesk-comment",
    ),

    # --- Attachments (public portal) ---
    path(
        "helpdesk/public/portals/<str:public_slug>/assets/",
        PublicHelpdeskAssetEndpoint.as_view(),
        name="public-helpdesk-asset",
    ),
    path(
        "helpdesk/public/portals/<str:public_slug>/assets/<uuid:asset_id>/",
        PublicHelpdeskAssetEndpoint.as_view(),
        name="public-helpdesk-asset-detail",
    ),

    # --- Inbound Email Webhook ---
    path(
        "helpdesk/public/inbound/",
        PublicHelpdeskInboundEmailEndpoint.as_view(),
        name="public-helpdesk-inbound",
    ),
]
