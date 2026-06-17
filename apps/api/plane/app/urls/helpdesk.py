from django.urls import path
from plane.app.views.helpdesk import (
    HelpdeskCustomerLoginEndpoint,
    HelpdeskCustomerRegisterEndpoint,
    PublicHelpdeskCustomerLoginEndpoint,
    PublicHelpdeskCustomerRegisterEndpoint,
    HelpdeskPortalViewSet,
    PublicHelpdeskPortalEndpoint,
    HelpdeskFormViewSet,
    HelpdeskFormFieldViewSet,
    PublicHelpdeskFormListEndpoint,
    PublicHelpdeskFormDetailEndpoint,
    PublicHelpdeskFormSubmitEndpoint,
    HelpdeskRequestViewSet,
    PublicHelpdeskRequestEndpoint,
    HelpdeskRequestIssueViewSet,
    HelpdeskRequestIntakeIssueViewSet,
    HelpdeskRequestCommentViewSet,
    PublicHelpdeskCommentEndpoint,
    HelpdeskStatusViewSet,
    HelpdeskAnalyticsEndpoint,
)

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

    # --- Analytics ---
    path(
        "workspaces/<str:slug>/helpdesk/analytics/",
        HelpdeskAnalyticsEndpoint.as_view(),
        name="helpdesk-analytics",
    ),

    # --- Public comments ---
    path(
        "helpdesk/public/portals/<str:public_slug>/requests/<uuid:request_pk>/comments/",
        PublicHelpdeskCommentEndpoint.as_view(),
        name="public-helpdesk-comment",
    ),
]
