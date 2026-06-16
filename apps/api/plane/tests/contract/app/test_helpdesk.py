# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
import jwt
from django.urls import reverse
from django.conf import settings
from rest_framework import status

from plane.db.models import Project, Issue, State
from plane.db.models.helpdesk import (
    HelpdeskCustomer,
    HelpdeskPortal,
    HelpdeskRequest,
    HelpdeskRequestIssue,
)


@pytest.fixture
def project(workspace, create_user):
    return Project.objects.create(
        name="Helpdesk Project",
        identifier="HP",
        workspace=workspace,
        created_by=create_user,
    )


@pytest.fixture
def state(project):
    return State.objects.create(
        name="Todo",
        project=project,
        group="backlog",
        default=True,
    )


@pytest.fixture
def issue(workspace, project, state, create_user):
    return Issue.objects.create(
        name="Test Issue for Helpdesk",
        workspace=workspace,
        project=project,
        state=state,
        created_by=create_user,
    )


@pytest.fixture
def portal(workspace, project, create_user):
    return HelpdeskPortal.objects.create(
        workspace=workspace,
        project=project,
        is_public=True,
        require_login=False,
        public_slug="hp-portal",
        created_by=create_user,
    )


@pytest.mark.contract
class TestHelpdeskCustomerAuth:
    @pytest.mark.django_db
    def test_customer_register(self, api_client, workspace):
        url = reverse("helpdesk-customer-register", kwargs={"slug": workspace.slug})
        data = {
            "email": "customer@example.com",
            "password": "customer-password",
            "name": "Helpdesk Customer",
        }
        response = api_client.post(url, data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert "token" in response.data
        assert response.data["customer"]["email"] == "customer@example.com"
        assert HelpdeskCustomer.objects.filter(email="customer@example.com", workspace=workspace).exists()

    @pytest.mark.django_db
    def test_customer_register_missing_fields(self, api_client, workspace):
        url = reverse("helpdesk-customer-register", kwargs={"slug": workspace.slug})
        data = {
            "email": "customer@example.com",
        }
        response = api_client.post(url, data, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_customer_login(self, api_client, workspace):
        customer = HelpdeskCustomer.objects.create(
            email="customer@example.com",
            name="Customer One",
            workspace=workspace,
        )
        customer.set_password("customer-password")
        customer.save()

        url = reverse("helpdesk-customer-login", kwargs={"slug": workspace.slug})
        data = {
            "email": "customer@example.com",
            "password": "customer-password",
        }
        response = api_client.post(url, data, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert "token" in response.data

    @pytest.mark.django_db
    def test_customer_login_invalid(self, api_client, workspace):
        url = reverse("helpdesk-customer-login", kwargs={"slug": workspace.slug})
        data = {
            "email": "nonexistent@example.com",
            "password": "password",
        }
        response = api_client.post(url, data, format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.contract
class TestHelpdeskPortalAPI:
    @pytest.mark.django_db
    def test_create_portal(self, session_client, workspace, project):
        url = reverse("helpdesk-portal", kwargs={"slug": workspace.slug, "project_id": project.id})
        data = {
            "is_public": True,
            "require_login": False,
            "public_slug": "test-portal-slug",
        }
        response = session_client.post(url, data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["public_slug"] == "test-portal-slug"

    @pytest.mark.django_db
    def test_get_public_portal(self, api_client, portal):
        url = reverse("public-helpdesk-portal", kwargs={"public_slug": portal.public_slug})
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["public_slug"] == portal.public_slug


@pytest.mark.contract
class TestHelpdeskRequestAPI:
    @pytest.mark.django_db
    def test_create_public_request_anon(self, api_client, portal):
        url = reverse("public-helpdesk-request", kwargs={"public_slug": portal.public_slug})
        data = {
            "title": "Need help with login",
            "description": "I cannot log in to the portal.",
            "contact_email": "user@example.com",
        }
        response = api_client.post(url, data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["title"] == "Need help with login"
        assert HelpdeskRequest.objects.filter(title="Need help with login").exists()

    @pytest.mark.django_db
    def test_create_public_request_require_login_unauthorized(self, api_client, portal):
        portal.require_login = True
        portal.save()

        url = reverse("public-helpdesk-request", kwargs={"public_slug": portal.public_slug})
        data = {
            "title": "Need help with login",
            "description": "I cannot log in to the portal.",
        }
        response = api_client.post(url, data, format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.django_db
    def test_create_public_request_require_login_success(self, api_client, portal, workspace):
        portal.require_login = True
        portal.save()

        customer = HelpdeskCustomer.objects.create(
            email="customer@example.com",
            name="Customer One",
            workspace=workspace,
        )
        customer.set_password("customer-password")
        customer.save()

        payload = {
            "customer_id": str(customer.id),
            "email": customer.email,
        }
        token = jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        url = reverse("public-helpdesk-request", kwargs={"public_slug": portal.public_slug})
        data = {
            "title": "Need help with login",
            "description": "I cannot log in to the portal.",
        }
        response = api_client.post(url, data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["title"] == "Need help with login"
        # Reset credentials
        api_client.credentials()


@pytest.mark.contract
class TestHelpdeskRequestIssueAPI:
    @pytest.mark.django_db
    def test_link_request_to_issue(self, session_client, workspace, project, portal, issue, create_user):
        request_obj = HelpdeskRequest.objects.create(
            workspace=workspace,
            project=project,
            portal=portal,
            title="Problem X",
            description="Details of problem X",
            created_by=create_user,
        )

        url = reverse("helpdesk-request-issue", kwargs={"slug": workspace.slug, "project_id": project.id})
        data = {
            "request": str(request_obj.id),
            "issue": str(issue.id),
        }
        response = session_client.post(url, data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert HelpdeskRequestIssue.objects.filter(request=request_obj, issue=issue).exists()
