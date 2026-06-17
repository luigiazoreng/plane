# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import jwt
import pytest
from django.conf import settings
from django.urls import reverse
from rest_framework import status

from plane.db.models.helpdesk import HelpdeskCustomer, HelpdeskForm, HelpdeskFormField, HelpdeskPortal, HelpdeskRequest


@pytest.fixture
def portal(workspace, create_user):
    return HelpdeskPortal.objects.create(
        workspace=workspace,
        is_public=True,
        require_login=False,
        public_slug="support-portal",
        created_by=create_user,
    )


@pytest.fixture
def customer(workspace):
    customer = HelpdeskCustomer.objects.create(
        email="customer@example.com",
        name="Customer One",
        workspace=workspace,
    )
    customer.set_password("customer-password")
    customer.save()
    return customer


@pytest.fixture
def customer_token(customer):
    payload = {
        "customer_id": str(customer.id),
        "workspace_id": str(customer.workspace_id),
        "email": customer.email,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


@pytest.fixture
def default_form(portal, create_user):
    form = HelpdeskForm.objects.create(
        workspace=portal.workspace,
        portal=portal,
        name="General Support",
        description="Default helpdesk form",
        slug="general-support",
        visibility="public",
        is_active=True,
        sequence=10000,
        success_message="Request received.",
        created_by=create_user,
    )
    HelpdeskFormField.objects.create(
        workspace=portal.workspace,
        form=form,
        key="title",
        label="Subject",
        field_type="system_title",
        required=True,
        sequence=10000,
        is_system=True,
        created_by=create_user,
    )
    HelpdeskFormField.objects.create(
        workspace=portal.workspace,
        form=form,
        key="description",
        label="Description",
        field_type="system_description",
        required=True,
        sequence=20000,
        is_system=True,
        created_by=create_user,
    )
    HelpdeskFormField.objects.create(
        workspace=portal.workspace,
        form=form,
        key="category",
        label="Category",
        field_type="select",
        required=True,
        sequence=30000,
        options=[{"label": "Billing", "value": "billing"}],
        created_by=create_user,
    )
    return form


@pytest.mark.contract
class TestHelpdeskPortalAndFormsAPI:
    @pytest.mark.django_db
    def test_create_portal_workspace_level(self, session_client, workspace):
        url = reverse("helpdesk-portal", kwargs={"slug": workspace.slug})
        response = session_client.post(
            url,
            {"is_public": True, "require_login": False, "public_slug": "portal-create"},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["public_slug"] == "portal-create"

    @pytest.mark.django_db
    def test_create_form_and_fields(self, session_client, workspace, portal):
        form_url = reverse("helpdesk-form", kwargs={"slug": workspace.slug})
        form_response = session_client.post(
            form_url,
            {
                "portal": str(portal.id),
                "name": "Billing Support",
                "slug": "billing-support",
                "visibility": "public",
                "is_active": True,
                "sequence": 10000,
            },
            format="json",
        )
        assert form_response.status_code == status.HTTP_201_CREATED

        field_url = reverse("helpdesk-form-field", kwargs={"slug": workspace.slug})
        field_response = session_client.post(
            field_url,
            {
                "form": form_response.data["id"],
                "key": "invoice-id",
                "label": "Invoice ID",
                "field_type": "short_text",
                "required": False,
                "sequence": 30000,
                "options": [],
                "validation": {},
                "ui_props": {},
            },
            format="json",
        )
        assert field_response.status_code == status.HTTP_201_CREATED
        assert field_response.data["key"] == "invoice-id"

    @pytest.mark.django_db
    def test_reorder_forms(self, session_client, workspace, portal, create_user):
        form_one = HelpdeskForm.objects.create(
            workspace=workspace,
            portal=portal,
            name="Form One",
            slug="form-one",
            sequence=10000,
            created_by=create_user,
        )
        form_two = HelpdeskForm.objects.create(
            workspace=workspace,
            portal=portal,
            name="Form Two",
            slug="form-two",
            sequence=20000,
            created_by=create_user,
        )

        url = reverse("helpdesk-form-reorder", kwargs={"slug": workspace.slug})
        response = session_client.post(
            url,
            [
                {"id": str(form_one.id), "sequence": 20000},
                {"id": str(form_two.id), "sequence": 10000},
            ],
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data[0]["id"] == str(form_two.id)


@pytest.mark.contract
class TestPublicHelpdeskForms:
    @pytest.mark.django_db
    def test_list_public_forms_without_auth(self, api_client, portal, default_form, create_user):
        HelpdeskForm.objects.create(
            workspace=portal.workspace,
            portal=portal,
            name="Private Support",
            slug="private-support",
            visibility="private",
            sequence=20000,
            created_by=create_user,
        )
        url = reverse("public-helpdesk-form-list", kwargs={"public_slug": portal.public_slug})
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]["slug"] == default_form.slug

    @pytest.mark.django_db
    def test_list_private_forms_with_auth(self, api_client, portal, default_form, customer_token, create_user):
        HelpdeskForm.objects.create(
            workspace=portal.workspace,
            portal=portal,
            name="Private Support",
            slug="private-support",
            visibility="private",
            sequence=20000,
            created_by=create_user,
        )
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {customer_token}")
        url = reverse("public-helpdesk-form-list", kwargs={"public_slug": portal.public_slug})
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 2
        api_client.credentials()

    @pytest.mark.django_db
    def test_private_form_requires_login(self, api_client, portal, create_user):
        private_form = HelpdeskForm.objects.create(
            workspace=portal.workspace,
            portal=portal,
            name="Private Support",
            slug="private-support",
            visibility="private",
            sequence=10000,
            created_by=create_user,
        )
        url = reverse(
            "public-helpdesk-form-detail",
            kwargs={"public_slug": portal.public_slug, "form_slug": private_form.slug},
        )
        response = api_client.get(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.django_db
    def test_submit_public_form_success(self, api_client, portal, default_form):
        url = reverse(
            "public-helpdesk-form-submit",
            kwargs={"public_slug": portal.public_slug, "form_slug": default_form.slug},
        )
        response = api_client.post(
            url,
            {
                "title": "Need help with billing",
                "description": "My last invoice is incorrect.",
                "category": "billing",
                "contact_email": "user@example.com",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["title"] == "Need help with billing"
        assert response.data["form_responses"]["category"] == "billing"
        assert HelpdeskRequest.objects.filter(form=default_form).exists()

    @pytest.mark.django_db
    def test_submit_public_form_invalid_select(self, api_client, portal, default_form):
        url = reverse(
            "public-helpdesk-form-submit",
            kwargs={"public_slug": portal.public_slug, "form_slug": default_form.slug},
        )
        response = api_client.post(
            url,
            {
                "title": "Need help",
                "description": "Problem details",
                "category": "unknown",
                "contact_email": "user@example.com",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "category" in response.data

    @pytest.mark.django_db
    def test_submit_private_form_with_login(self, api_client, portal, customer_token, create_user):
        form = HelpdeskForm.objects.create(
            workspace=portal.workspace,
            portal=portal,
            name="Private Support",
            slug="private-support",
            visibility="private",
            sequence=10000,
            created_by=create_user,
        )
        HelpdeskFormField.objects.create(
            workspace=portal.workspace,
            form=form,
            key="title",
            label="Subject",
            field_type="system_title",
            required=True,
            sequence=10000,
            is_system=True,
            created_by=create_user,
        )
        HelpdeskFormField.objects.create(
            workspace=portal.workspace,
            form=form,
            key="description",
            label="Description",
            field_type="system_description",
            required=True,
            sequence=20000,
            is_system=True,
            created_by=create_user,
        )

        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {customer_token}")
        url = reverse(
            "public-helpdesk-form-submit",
            kwargs={"public_slug": portal.public_slug, "form_slug": form.slug},
        )
        response = api_client.post(
            url,
            {
                "title": "Private request",
                "description": "Visible only to logged in customers.",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        api_client.credentials()
