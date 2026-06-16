from django.urls import path
from plane.app.views.helpdesk import (
    HelpdeskCustomerLoginEndpoint,
    HelpdeskCustomerRegisterEndpoint,
    HelpdeskPortalViewSet,
    PublicHelpdeskPortalEndpoint,
    HelpdeskRequestViewSet,
    PublicHelpdeskRequestEndpoint,
    HelpdeskRequestIssueViewSet,
)

urlpatterns = [
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
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/helpdesk/portals/",
        HelpdeskPortalViewSet.as_view({
            "get": "list",
            "post": "create"
        }),
        name="helpdesk-portal",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/helpdesk/portals/<uuid:pk>/",
        HelpdeskPortalViewSet.as_view({
            "get": "retrieve",
            "put": "update",
            "patch": "partial_update",
            "delete": "destroy"
        }),
        name="helpdesk-portal-detail",
    ),
    path(
        "helpdesk/public/portals/<str:public_slug>/",
        PublicHelpdeskPortalEndpoint.as_view(),
        name="public-helpdesk-portal",
    ),
    path(
        "helpdesk/public/portals/<str:public_slug>/requests/",
        PublicHelpdeskRequestEndpoint.as_view({
            "post": "create"
        }),
        name="public-helpdesk-request",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/helpdesk/requests/",
        HelpdeskRequestViewSet.as_view({
            "get": "list",
            "post": "create"
        }),
        name="helpdesk-request",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/helpdesk/requests/<uuid:pk>/",
        HelpdeskRequestViewSet.as_view({
            "get": "retrieve",
            "put": "update",
            "patch": "partial_update",
            "delete": "destroy"
        }),
        name="helpdesk-request-detail",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/helpdesk/request-issues/",
        HelpdeskRequestIssueViewSet.as_view({
            "get": "list",
            "post": "create"
        }),
        name="helpdesk-request-issue",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/helpdesk/request-issues/<uuid:pk>/",
        HelpdeskRequestIssueViewSet.as_view({
            "get": "retrieve",
            "delete": "destroy"
        }),
        name="helpdesk-request-issue-detail",
    ),
]
