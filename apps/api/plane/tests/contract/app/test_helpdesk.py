# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import timedelta
from unittest import mock

import jwt
import pytest
from django.conf import settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from plane.db.models import FileAsset, User, WorkspaceMember
from plane.db.models.helpdesk import (
    HelpdeskCustomer,
    HelpdeskForm,
    HelpdeskFormField,
    HelpdeskPortal,
    HelpdeskRequest,
    HelpdeskRequestActivity,
    HelpdeskStatus,
)


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


@pytest.fixture
def open_status(workspace, create_user):
    return HelpdeskStatus.objects.create(
        workspace=workspace,
        name="Open",
        color="#F97316",
        sequence=10000,
        is_default=True,
        created_by=create_user,
    )


@pytest.fixture
def resolved_status(workspace, create_user):
    return HelpdeskStatus.objects.create(
        workspace=workspace,
        name="Resolved",
        color="#10B981",
        sequence=20000,
        is_default=False,
        created_by=create_user,
    )


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

    @pytest.mark.django_db
    def test_update_portal_auto_assignment_settings(self, session_client, workspace, portal, create_user):
        teammate = User.objects.create(email="agent-one@plane.so", first_name="Agent", last_name="One")
        WorkspaceMember.objects.create(workspace=workspace, member=teammate, role=15)

        url = reverse("helpdesk-portal-detail", kwargs={"slug": workspace.slug, "pk": portal.id})
        response = session_client.patch(
            url,
            {
                "auto_assignment_enabled": True,
                "auto_assignment_type": "load_balance",
                "auto_assignment_config": {
                    "version": 1,
                    "member_ids": [str(teammate.id)],
                },
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["auto_assignment_enabled"] is True
        assert response.data["auto_assignment_type"] == "load_balance"
        assert response.data["auto_assignment_config"]["member_ids"] == [str(teammate.id)]


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

    @pytest.mark.django_db
    def test_submit_public_form_auto_assigns_lowest_active_member(
        self,
        api_client,
        portal,
        default_form,
        open_status,
        resolved_status,
        create_user,
    ):
        agent_one = User.objects.create(email="agent-load-1@plane.so", first_name="Agent", last_name="One")
        agent_two = User.objects.create(email="agent-load-2@plane.so", first_name="Agent", last_name="Two")
        WorkspaceMember.objects.create(workspace=portal.workspace, member=agent_one, role=15)
        WorkspaceMember.objects.create(workspace=portal.workspace, member=agent_two, role=15)

        portal.auto_assignment_enabled = True
        portal.auto_assignment_type = "load_balance"
        portal.auto_assignment_config = {
            "version": 1,
            "member_ids": [str(agent_one.id), str(agent_two.id)],
        }
        portal.save(update_fields=["auto_assignment_enabled", "auto_assignment_type", "auto_assignment_config"])

        overloaded_request = HelpdeskRequest.objects.create(
            workspace=portal.workspace,
            portal=portal,
            title="Existing open request",
            description="Still active",
            status=open_status,
        )
        overloaded_request.assignees.set([agent_one.id])

        resolved_request = HelpdeskRequest.objects.create(
            workspace=portal.workspace,
            portal=portal,
            title="Resolved request",
            description="Should not count",
            status=resolved_status,
        )
        resolved_request.assignees.set([agent_two.id])

        url = reverse(
            "public-helpdesk-form-submit",
            kwargs={"public_slug": portal.public_slug, "form_slug": default_form.slug},
        )
        response = api_client.post(
            url,
            {
                "title": "Auto assign me",
                "description": "Choose the lightest agent",
                "category": "billing",
                "contact_email": "user@example.com",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        created_request = HelpdeskRequest.objects.get(id=response.data["id"])
        assert [str(assignee_id) for assignee_id in created_request.assignees.values_list("id", flat=True)] == [
            str(agent_two.id)
        ]

    @pytest.mark.django_db
    def test_submit_public_form_auto_assign_uses_deterministic_tie_breaker(
        self,
        api_client,
        portal,
        default_form,
    ):
        low_id_agent = User.objects.create(email="agent-a@plane.so", first_name="Agent", last_name="A")
        high_id_agent = User.objects.create(email="agent-b@plane.so", first_name="Agent", last_name="B")
        WorkspaceMember.objects.create(workspace=portal.workspace, member=low_id_agent, role=15)
        WorkspaceMember.objects.create(workspace=portal.workspace, member=high_id_agent, role=15)

        expected_agent_id = min(str(low_id_agent.id), str(high_id_agent.id))

        portal.auto_assignment_enabled = True
        portal.auto_assignment_type = "load_balance"
        portal.auto_assignment_config = {
            "version": 1,
            "member_ids": [str(high_id_agent.id), str(low_id_agent.id)],
        }
        portal.save(update_fields=["auto_assignment_enabled", "auto_assignment_type", "auto_assignment_config"])

        url = reverse(
            "public-helpdesk-form-submit",
            kwargs={"public_slug": portal.public_slug, "form_slug": default_form.slug},
        )
        response = api_client.post(
            url,
            {
                "title": "Tie breaker",
                "description": "Nobody has current load",
                "category": "billing",
                "contact_email": "user@example.com",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        created_request = HelpdeskRequest.objects.get(id=response.data["id"])
        assert [str(assignee_id) for assignee_id in created_request.assignees.values_list("id", flat=True)] == [
            expected_agent_id
        ]

    @pytest.mark.django_db
    def test_submit_public_form_without_eligible_agents_stays_unassigned(self, api_client, portal, default_form):
        portal.auto_assignment_enabled = True
        portal.auto_assignment_type = "load_balance"
        portal.auto_assignment_config = {"version": 1, "member_ids": []}
        portal.save(update_fields=["auto_assignment_enabled", "auto_assignment_type", "auto_assignment_config"])

        url = reverse(
            "public-helpdesk-form-submit",
            kwargs={"public_slug": portal.public_slug, "form_slug": default_form.slug},
        )
        response = api_client.post(
            url,
            {
                "title": "Nobody is eligible",
                "description": "Leave this ticket unassigned",
                "category": "billing",
                "contact_email": "user@example.com",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        created_request = HelpdeskRequest.objects.get(id=response.data["id"])
        assert created_request.assignees.count() == 0


@pytest.fixture
def make_request(workspace, portal, open_status, create_user):
    """Factory for helpdesk requests, so priority tests can build a small queue."""

    def _make(title, priority="none", status_obj=None):
        return HelpdeskRequest.objects.create(
            workspace=workspace,
            portal=portal,
            title=title,
            priority=priority,
            status=status_obj or open_status,
            created_by=create_user,
        )

    return _make


@pytest.mark.contract
class TestHelpdeskRequestPriorityAPI:
    @pytest.mark.django_db
    def test_priority_defaults_to_none(self, session_client, workspace, make_request):
        request_obj = make_request("Sem prioridade definida")

        response = session_client.get(
            reverse("helpdesk-request-detail", kwargs={"slug": workspace.slug, "pk": request_obj.id})
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["priority"] == "none"

    @pytest.mark.django_db
    def test_update_priority(self, session_client, workspace, make_request):
        request_obj = make_request("Erro 500 na API")

        response = session_client.patch(
            reverse("helpdesk-request-detail", kwargs={"slug": workspace.slug, "pk": request_obj.id}),
            {"priority": "urgent"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["priority"] == "urgent"
        request_obj.refresh_from_db()
        assert request_obj.priority == "urgent"

    @pytest.mark.django_db
    def test_rejects_unknown_priority(self, session_client, workspace, make_request):
        request_obj = make_request("Prioridade inválida")

        response = session_client.patch(
            reverse("helpdesk-request-detail", kwargs={"slug": workspace.slug, "pk": request_obj.id}),
            {"priority": "critical"},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "priority" in response.data
        request_obj.refresh_from_db()
        assert request_obj.priority == "none"

    @pytest.mark.django_db
    def test_filter_by_priority(self, session_client, workspace, make_request):
        make_request("Urgente", priority="urgent")
        make_request("Alta", priority="high")
        make_request("Baixa", priority="low")

        response = session_client.get(
            reverse("helpdesk-request", kwargs={"slug": workspace.slug}),
            {"priority": "urgent,high"},
        )

        assert response.status_code == status.HTTP_200_OK
        returned = {item["title"] for item in response.data["results"]}
        assert returned == {"Urgente", "Alta"}

    @pytest.mark.django_db
    def test_order_by_priority_uses_severity_not_alphabetical(self, session_client, workspace, make_request):
        # Alphabetically this would be high < low < none < urgent, which is
        # meaningless for triage. Severity order must win.
        make_request("Baixa", priority="low")
        make_request("Urgente", priority="urgent")
        make_request("Sem", priority="none")
        make_request("Media", priority="medium")
        make_request("Alta", priority="high")

        response = session_client.get(
            reverse("helpdesk-request", kwargs={"slug": workspace.slug}),
            {"order_by": "priority"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert [item["priority"] for item in response.data["results"]] == [
            "urgent",
            "high",
            "medium",
            "low",
            "none",
        ]


@pytest.fixture
def waiting_status(workspace, create_user):
    """A status that pauses the SLA clock, mirroring the default 'Waiting' seed."""
    return HelpdeskStatus.objects.create(
        workspace=workspace,
        name="Waiting",
        color="#8B5CF6",
        sequence=15000,
        is_default=False,
        pauses_sla=True,
        created_by=create_user,
    )


@pytest.mark.contract
class TestHelpdeskRequestSlaPauseAPI:
    """A ticket sitting in a pauses_sla status (e.g. Waiting) must not accrue
    SLA breach time -- see request.py `partial_update`."""

    @pytest.mark.django_db
    def test_moving_to_pausing_status_starts_the_pause(self, session_client, workspace, make_request, waiting_status):
        request_obj = make_request("Aguardando retorno do cliente")

        response = session_client.patch(
            reverse("helpdesk-request-detail", kwargs={"slug": workspace.slug, "pk": request_obj.id}),
            {"status": str(waiting_status.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        request_obj.refresh_from_db()
        assert request_obj.sla_paused_at is not None
        assert request_obj.total_paused_duration == timedelta(0)

    @pytest.mark.django_db
    def test_leaving_pausing_status_accumulates_duration_and_clears_paused_at(
        self, session_client, workspace, make_request, waiting_status, open_status
    ):
        request_obj = make_request("Ticket voltou da espera", status_obj=waiting_status)
        paused_at = timezone.now() - timedelta(hours=3)
        HelpdeskRequest.objects.filter(id=request_obj.id).update(sla_paused_at=paused_at)

        with mock.patch(
            "plane.app.views.helpdesk.request.timezone.now", return_value=paused_at + timedelta(hours=3)
        ):
            response = session_client.patch(
                reverse("helpdesk-request-detail", kwargs={"slug": workspace.slug, "pk": request_obj.id}),
                {"status": str(open_status.id)},
                format="json",
            )

        assert response.status_code == status.HTTP_200_OK
        request_obj.refresh_from_db()
        assert request_obj.sla_paused_at is None
        assert request_obj.total_paused_duration == timedelta(hours=3)

    @pytest.mark.django_db
    def test_moving_between_two_pausing_statuses_keeps_the_original_paused_at(
        self, session_client, workspace, make_request, waiting_status, create_user
    ):
        other_pausing_status = HelpdeskStatus.objects.create(
            workspace=workspace, name="On Hold", pauses_sla=True, sequence=16000, created_by=create_user
        )
        request_obj = make_request("Fica pausado trocando de status", status_obj=waiting_status)
        original_paused_at = timezone.now() - timedelta(hours=5)
        HelpdeskRequest.objects.filter(id=request_obj.id).update(sla_paused_at=original_paused_at)

        response = session_client.patch(
            reverse("helpdesk-request-detail", kwargs={"slug": workspace.slug, "pk": request_obj.id}),
            {"status": str(other_pausing_status.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        request_obj.refresh_from_db()
        assert request_obj.sla_paused_at == original_paused_at
        assert request_obj.total_paused_duration == timedelta(0)

    @pytest.mark.django_db
    def test_moving_from_pausing_status_directly_to_terminal_closes_pause_and_resolves(
        self, session_client, workspace, make_request, waiting_status, create_user
    ):
        terminal_status = HelpdeskStatus.objects.create(
            workspace=workspace, name="Resolved", is_terminal=True, sequence=40000, created_by=create_user
        )
        request_obj = make_request("Resolvido direto da espera", status_obj=waiting_status)
        paused_at = timezone.now() - timedelta(hours=2)
        HelpdeskRequest.objects.filter(id=request_obj.id).update(sla_paused_at=paused_at)

        with mock.patch(
            "plane.app.views.helpdesk.request.timezone.now", return_value=paused_at + timedelta(hours=2)
        ):
            response = session_client.patch(
                reverse("helpdesk-request-detail", kwargs={"slug": workspace.slug, "pk": request_obj.id}),
                {"status": str(terminal_status.id)},
                format="json",
            )

        assert response.status_code == status.HTTP_200_OK
        request_obj.refresh_from_db()
        assert request_obj.sla_paused_at is None
        assert request_obj.total_paused_duration == timedelta(hours=2)
        assert request_obj.resolved_at is not None

    @pytest.mark.django_db
    def test_total_paused_seconds_reflects_closed_pause_duration(self, session_client, workspace, make_request):
        request_obj = make_request("Ticket com pausa acumulada")
        HelpdeskRequest.objects.filter(id=request_obj.id).update(total_paused_duration=timedelta(hours=1, minutes=30))

        response = session_client.get(
            reverse("helpdesk-request-detail", kwargs={"slug": workspace.slug, "pk": request_obj.id})
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["total_paused_seconds"] == 5400

    @pytest.mark.django_db
    def test_sla_paused_at_and_total_paused_duration_are_not_client_writable(
        self, session_client, workspace, make_request
    ):
        request_obj = make_request("Cliente não deve setar isso manualmente")

        response = session_client.patch(
            reverse("helpdesk-request-detail", kwargs={"slug": workspace.slug, "pk": request_obj.id}),
            {"sla_paused_at": timezone.now().isoformat(), "title": "Cliente não deve setar isso manualmente"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        request_obj.refresh_from_db()
        assert request_obj.sla_paused_at is None


@pytest.mark.contract
class TestHelpdeskRequestTargetDateAPI:
    @pytest.mark.django_db
    def test_update_target_date(self, session_client, workspace, make_request):
        request_obj = make_request("Ticket sem prazo definido")

        response = session_client.patch(
            reverse("helpdesk-request-detail", kwargs={"slug": workspace.slug, "pk": request_obj.id}),
            {"target_date": "2026-09-01"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["target_date"] == "2026-09-01"
        request_obj.refresh_from_db()
        assert str(request_obj.target_date) == "2026-09-01"

    @pytest.mark.django_db
    def test_rejects_target_date_before_start_date(self, session_client, workspace, make_request):
        request_obj = make_request("Prazo inconsistente")

        response = session_client.patch(
            reverse("helpdesk-request-detail", kwargs={"slug": workspace.slug, "pk": request_obj.id}),
            {"start_date": "2026-09-10", "target_date": "2026-09-01"},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        request_obj.refresh_from_db()
        assert request_obj.target_date is None


@pytest.mark.contract
class TestUploadCredentials:
    """entity_type do FileAsset criado por HelpdeskAssetEndpoint.post.

    Bloqueador do plano (feat 2026-08-04-helpdesk-editor-anexos-ticket): o
    default do endpoint é COMMENT_ENTITY. Callers de formulário de request
    (editor de descrição, campo de anexo dedicado) DEVEM passar entity_type
    explícito, senão o anexo vira silenciosamente um anexo de comentário.
    Estes testes documentam esse contrato para o frontend (Stage B2).
    """

    def _payload(self, **overrides):
        payload = {"name": "screenshot.png", "type": "image/png", "size": 1024}
        payload.update(overrides)
        return payload

    @pytest.mark.django_db
    def test_defaults_to_comment_entity_when_unspecified(self, session_client, workspace):
        response = session_client.post(
            reverse("helpdesk-asset", kwargs={"slug": workspace.slug}),
            self._payload(),
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        asset_id = response.data["asset_id"]
        asset = FileAsset.objects.get(id=asset_id)
        assert asset.entity_type == FileAsset.EntityTypeContext.HELPDESK_COMMENT_ATTACHMENT

    @pytest.mark.django_db
    def test_accepts_explicit_request_entity_type(self, session_client, workspace):
        response = session_client.post(
            reverse("helpdesk-asset", kwargs={"slug": workspace.slug}),
            self._payload(entity_type=FileAsset.EntityTypeContext.HELPDESK_REQUEST_ATTACHMENT),
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        asset_id = response.data["asset_id"]
        asset = FileAsset.objects.get(id=asset_id)
        assert asset.entity_type == FileAsset.EntityTypeContext.HELPDESK_REQUEST_ATTACHMENT

    @pytest.mark.django_db
    def test_rejects_unknown_entity_type(self, session_client, workspace):
        response = session_client.post(
            reverse("helpdesk-asset", kwargs={"slug": workspace.slug}),
            self._payload(entity_type="not_a_real_entity_type"),
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["error"] == "Invalid entity type."


@pytest.mark.contract
class TestHelpdeskFormChatToggle:
    @pytest.mark.django_db
    def test_form_enable_chat_allows_customer_reply_when_portal_chat_disabled(
        self, api_client, session_client, workspace, portal, default_form, customer, customer_token
    ):
        portal.enable_chat = False
        portal.save(update_fields=["enable_chat"])

        # Enable chat on the form via form settings API
        form_detail_url = reverse("helpdesk-form-detail", kwargs={"slug": workspace.slug, "pk": default_form.id})
        patch_resp = session_client.patch(form_detail_url, {"enable_chat": True}, format="json")
        assert patch_resp.status_code == status.HTTP_200_OK
        assert patch_resp.data["enable_chat"] is True

        req = HelpdeskRequest.objects.create(
            workspace=workspace,
            portal=portal,
            form=default_form,
            customer=customer,
            title="Test chat enabled on form",
            description="Body",
        )

        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {customer_token}")
        req_detail_url = reverse(
            "public-helpdesk-request-detail",
            kwargs={"public_slug": portal.public_slug, "pk": req.id},
        )
        req_resp = api_client.get(req_detail_url)
        assert req_resp.status_code == status.HTTP_200_OK
        assert req_resp.data["form_detail"]["enable_chat"] is True

        comment_url = reverse(
            "public-helpdesk-comment",
            kwargs={"public_slug": portal.public_slug, "request_pk": req.id},
        )
        comment_resp = api_client.post(comment_url, {"content": "Customer reply from form chat"}, format="json")
        assert comment_resp.status_code == status.HTTP_201_CREATED
        assert comment_resp.data["content"] == "Customer reply from form chat"
        api_client.credentials()

    @pytest.mark.django_db
    def test_form_disable_chat_blocks_customer_reply(
        self, api_client, workspace, portal, default_form, customer, customer_token
    ):
        portal.enable_chat = True
        portal.save(update_fields=["enable_chat"])
        default_form.enable_chat = False
        default_form.save(update_fields=["enable_chat"])

        req = HelpdeskRequest.objects.create(
            workspace=workspace,
            portal=portal,
            form=default_form,
            customer=customer,
            title="Test chat disabled on form",
            description="Body",
        )

        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {customer_token}")
        comment_url = reverse(
            "public-helpdesk-comment",
            kwargs={"public_slug": portal.public_slug, "request_pk": req.id},
        )
        comment_resp = api_client.post(comment_url, {"content": "Should be blocked"}, format="json")
        assert comment_resp.status_code == status.HTTP_403_FORBIDDEN
        assert comment_resp.data["error"] == "Chat not enabled for this form"
        api_client.credentials()

    @pytest.mark.django_db
    def test_fallback_to_portal_chat_when_request_has_no_form(
        self, api_client, workspace, portal, customer, customer_token
    ):
        # Portal chat enabled
        portal.enable_chat = True
        portal.save(update_fields=["enable_chat"])

        req = HelpdeskRequest.objects.create(
            workspace=workspace,
            portal=portal,
            form=None,
            customer=customer,
            title="Request without form",
            description="Body",
        )

        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {customer_token}")
        comment_url = reverse(
            "public-helpdesk-comment",
            kwargs={"public_slug": portal.public_slug, "request_pk": req.id},
        )
        comment_resp = api_client.post(comment_url, {"content": "Reply to ticket without form"}, format="json")
        assert comment_resp.status_code == status.HTTP_201_CREATED

        # Portal chat disabled
        portal.enable_chat = False
        portal.save(update_fields=["enable_chat"])
        comment_resp2 = api_client.post(comment_url, {"content": "Should be blocked"}, format="json")
        assert comment_resp2.status_code == status.HTTP_403_FORBIDDEN
        assert comment_resp2.data["error"] == "Chat not enabled for this portal"
        api_client.credentials()

    @pytest.mark.django_db
    def test_post_comment_records_timeline_activity(
        self, api_client, workspace, portal, default_form, customer, customer_token
    ):
        default_form.enable_chat = True
        default_form.save(update_fields=["enable_chat"])

        req = HelpdeskRequest.objects.create(
            workspace=workspace,
            portal=portal,
            form=default_form,
            customer=customer,
            title="Request for activity check",
            description="Body",
        )

        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {customer_token}")
        comment_url = reverse(
            "public-helpdesk-comment",
            kwargs={"public_slug": portal.public_slug, "request_pk": req.id},
        )
        res = api_client.post(comment_url, {"content": "Checking activity logging"}, format="json")
        assert res.status_code == status.HTTP_201_CREATED

        activity = HelpdeskRequestActivity.objects.filter(
            request=req,
            field="comment",
            verb="commented",
        ).first()
        assert activity is not None
        assert activity.actor is None
        assert activity.workspace_id == workspace.id
        api_client.credentials()

    @pytest.mark.django_db
    def test_post_comment_attachment_only_without_text(
        self, api_client, workspace, portal, default_form, customer, customer_token
    ):
        from plane.app.helpdesk.attachments import COMMENT_ENTITY, synthesize_content

        default_form.enable_chat = True
        default_form.save(update_fields=["enable_chat"])

        req = HelpdeskRequest.objects.create(
            workspace=workspace,
            portal=portal,
            form=default_form,
            customer=customer,
            title="Attachment only request",
            description="Body",
        )

        asset = FileAsset.objects.create(
            attributes={"name": "screenshot.png", "type": "image/png", "size": 1024},
            asset=f"{workspace.id}/test-screenshot.png",
            size=1024,
            workspace=workspace,
            entity_type=COMMENT_ENTITY,
            entity_identifier=None,
            is_uploaded=True,
        )

        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {customer_token}")
        comment_url = reverse(
            "public-helpdesk-comment",
            kwargs={"public_slug": portal.public_slug, "request_pk": req.id},
        )
        res = api_client.post(
            comment_url,
            {"content": "", "asset_ids": [str(asset.id)]},
            format="json",
        )
        assert res.status_code == status.HTTP_201_CREATED
        assert res.data["content"] == synthesize_content(1)

        # Asset should now be bound
        asset.refresh_from_db()
        assert asset.entity_identifier == str(res.data["id"])
        api_client.credentials()

    @pytest.mark.django_db
    def test_post_comment_empty_content_and_no_attachment_fails(
        self, api_client, workspace, portal, default_form, customer, customer_token
    ):
        default_form.enable_chat = True
        default_form.save(update_fields=["enable_chat"])

        req = HelpdeskRequest.objects.create(
            workspace=workspace,
            portal=portal,
            form=default_form,
            customer=customer,
            title="Empty comment request",
            description="Body",
        )

        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {customer_token}")
        comment_url = reverse(
            "public-helpdesk-comment",
            kwargs={"public_slug": portal.public_slug, "request_pk": req.id},
        )
        res = api_client.post(comment_url, {"content": "   ", "asset_ids": []}, format="json")
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert res.data["error"] == "Content or attachment is required"
        api_client.credentials()

    @pytest.mark.django_db
    def test_post_comment_enforces_portal_require_login(
        self, api_client, workspace, portal, default_form, customer
    ):
        portal.require_login = True
        portal.save(update_fields=["require_login"])
        default_form.enable_chat = True
        default_form.save(update_fields=["enable_chat"])

        req = HelpdeskRequest.objects.create(
            workspace=workspace,
            portal=portal,
            form=default_form,
            customer=customer,
            title="Require login request",
            description="Body",
        )

        comment_url = reverse(
            "public-helpdesk-comment",
            kwargs={"public_slug": portal.public_slug, "request_pk": req.id},
        )
        res = api_client.post(comment_url, {"content": "Anonymous attempt"}, format="json")
        assert res.status_code == status.HTTP_401_UNAUTHORIZED
        assert res.data["error"] == "Login required to post comments"

    @pytest.mark.django_db
    def test_post_and_get_comments_blocks_unauthorized_customer(
        self, api_client, workspace, portal, default_form, customer, customer_token
    ):
        default_form.enable_chat = True
        default_form.save(update_fields=["enable_chat"])

        # Customer 1 owns the ticket
        req = HelpdeskRequest.objects.create(
            workspace=workspace,
            portal=portal,
            form=default_form,
            customer=customer,
            title="Customer 1 Ticket",
            description="Body",
        )

        # Customer 2 in same workspace
        customer2 = HelpdeskCustomer.objects.create(
            email="customer2@example.com",
            name="Customer Two",
            workspace=workspace,
        )
        token2 = jwt.encode(
            {"customer_id": str(customer2.id), "workspace_id": str(workspace.id), "email": customer2.email},
            settings.SECRET_KEY,
            algorithm="HS256",
        )

        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token2}")
        comment_url = reverse(
            "public-helpdesk-comment",
            kwargs={"public_slug": portal.public_slug, "request_pk": req.id},
        )
        post_res = api_client.post(comment_url, {"content": "Impersonation attempt"}, format="json")
        assert post_res.status_code == status.HTTP_403_FORBIDDEN
        assert post_res.data["error"] == "Forbidden"

        get_res = api_client.get(comment_url)
        assert get_res.status_code == status.HTTP_403_FORBIDDEN
        assert get_res.data["error"] == "Forbidden"

        # Customer 1 succeeds
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {customer_token}")
        get_res_owner = api_client.get(comment_url)
        assert get_res_owner.status_code == status.HTTP_200_OK
        api_client.credentials()

    @pytest.mark.django_db
    def test_post_comment_expired_or_invalid_token(
        self, api_client, workspace, portal, default_form, customer
    ):
        default_form.enable_chat = True
        default_form.save(update_fields=["enable_chat"])

        req = HelpdeskRequest.objects.create(
            workspace=workspace,
            portal=portal,
            form=default_form,
            customer=customer,
            title="Token check request",
            description="Body",
        )

        comment_url = reverse(
            "public-helpdesk-comment",
            kwargs={"public_slug": portal.public_slug, "request_pk": req.id},
        )

        # Invalid token
        api_client.credentials(HTTP_AUTHORIZATION="Bearer invalid.token.payload")
        res_invalid = api_client.post(comment_url, {"content": "Hi"}, format="json")
        assert res_invalid.status_code == status.HTTP_401_UNAUTHORIZED
        assert res_invalid.data["error"] == "Invalid token"

        # Expired token
        expired_token = jwt.encode(
            {
                "customer_id": str(customer.id),
                "workspace_id": str(workspace.id),
                "exp": timezone.now() - timedelta(days=1),
            },
            settings.SECRET_KEY,
            algorithm="HS256",
        )
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {expired_token}")
        res_expired = api_client.post(comment_url, {"content": "Hi"}, format="json")
        assert res_expired.status_code == status.HTTP_401_UNAUTHORIZED
        assert res_expired.data["error"] == "Token expired"
        api_client.credentials()
