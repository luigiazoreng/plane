"""Contract tests for the app-layer (/api/, session auth) SLA and recurrence endpoints."""

from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import User, WorkspaceMember
from plane.db.models.helpdesk import (
    HelpdeskCustomer,
    HelpdeskMember,
    HelpdeskPortal,
    HelpdeskRequest,
    HelpdeskRequestPriority,
    HelpdeskSLAPolicy,
    HelpdeskStatus,
)


@pytest.fixture
def portal(workspace):
    return HelpdeskPortal.objects.create(
        workspace=workspace,
        public_slug="app-sla-portal",
        sla_first_response_hours=8,
        sla_resolution_hours=48,
    )


@pytest.fixture
def agent_client(workspace):
    """A helpdesk MEMBER: workspace MEMBER role, so no admin bypass."""
    agent = User.objects.create(email="agent@plane.so")
    agent.set_password("x")
    agent.save()
    WorkspaceMember.objects.create(workspace=workspace, member=agent, role=15)
    HelpdeskMember.objects.create(workspace=workspace, member=agent, role=15)

    client = APIClient()
    client.force_authenticate(user=agent)
    return client


@pytest.mark.django_db
class TestSLAPolicyPermissions:
    def test_admin_can_create_a_policy(self, session_client, workspace, portal):
        response = session_client.post(
            reverse("helpdesk-sla-policy", kwargs={"slug": workspace.slug}),
            {
                "portal": str(portal.id),
                "priority": "urgent",
                "first_response_hours": 1,
                "resolution_hours": 4,
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data

    def test_a_member_agent_can_read_but_not_write(self, agent_client, workspace, portal):
        """An agent must know their deadline; only admins may move it."""
        HelpdeskSLAPolicy.objects.create(
            workspace=workspace,
            portal=portal,
            priority=HelpdeskRequestPriority.URGENT,
            first_response_hours=1,
            resolution_hours=4,
        )

        listing = agent_client.get(reverse("helpdesk-sla-policy", kwargs={"slug": workspace.slug}))
        assert listing.status_code == status.HTTP_200_OK

        write = agent_client.post(
            reverse("helpdesk-sla-policy", kwargs={"slug": workspace.slug}),
            {"portal": str(portal.id), "priority": "low", "resolution_hours": 72},
            format="json",
        )
        assert write.status_code == status.HTTP_403_FORBIDDEN

    def test_a_non_member_is_denied(self, api_client, workspace, portal, db):
        outsider = User.objects.create(email="nobody@plane.so")
        outsider.set_password("x")
        outsider.save()
        api_client.force_authenticate(user=outsider)

        response = api_client.get(reverse("helpdesk-sla-policy", kwargs={"slug": workspace.slug}))
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
class TestRequestListSLAFilters:
    def test_sla_status_breached_filter(self, session_client, workspace, portal):
        now = timezone.now()
        overdue = HelpdeskRequest.objects.create(workspace=workspace, portal=portal, title="Atrasado")
        HelpdeskRequest.objects.filter(pk=overdue.pk).update(sla_resolution_due_at=now - timedelta(hours=2))
        HelpdeskRequest.objects.create(workspace=workspace, portal=portal, title="Sem SLA")

        response = session_client.get(
            reverse("helpdesk-request", kwargs={"slug": workspace.slug}), {"sla_status": "breached"}
        )

        assert response.status_code == status.HTTP_200_OK
        assert [row["title"] for row in response.data["results"]] == ["Atrasado"]

    def test_serializer_exposes_the_sla_block(self, session_client, workspace, portal):
        now = timezone.now()
        req = HelpdeskRequest.objects.create(workspace=workspace, portal=portal, title="Com SLA")
        HelpdeskRequest.objects.filter(pk=req.pk).update(sla_resolution_due_at=now + timedelta(days=1))

        response = session_client.get(
            reverse("helpdesk-request-detail", kwargs={"slug": workspace.slug, "pk": req.id})
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["sla"]["resolution"]["status"] == "ok"
        assert response.data["sla"]["is_paused"] is False

    def test_is_recurrent_filter(self, session_client, workspace, portal):
        from plane.app.helpdesk.recurrence import detect_recurrence

        customer = HelpdeskCustomer.objects.create(
            email="rec@example.com", name="Rec", workspace=workspace
        )
        customer.set_password("x")
        customer.save()

        now = timezone.now()
        first = HelpdeskRequest.objects.create(
            workspace=workspace, portal=portal, title="Impressora fiscal travando", customer=customer
        )
        HelpdeskRequest.objects.filter(pk=first.pk).update(created_at=now - timedelta(days=1))
        second = HelpdeskRequest.objects.create(
            workspace=workspace, portal=portal, title="Impressora fiscal travando", customer=customer
        )
        detect_recurrence(second)

        response = session_client.get(
            reverse("helpdesk-request", kwargs={"slug": workspace.slug}), {"is_recurrent": "true"}
        )

        assert response.status_code == status.HTTP_200_OK
        assert [row["id"] for row in response.data["results"]] == [str(second.id)]
        assert response.data["results"][0]["recurrence_count"] == 1


@pytest.mark.django_db
class TestCreateAppliesSLA:
    def test_creating_a_ticket_through_the_agent_endpoint_sets_the_deadline(
        self, session_client, workspace, portal
    ):
        HelpdeskSLAPolicy.objects.create(
            workspace=workspace,
            portal=portal,
            priority=HelpdeskRequestPriority.HIGH,
            first_response_hours=2,
            resolution_hours=12,
        )

        response = session_client.post(
            reverse("helpdesk-request", kwargs={"slug": workspace.slug}),
            {"portal": str(portal.id), "title": "Novo chamado", "priority": "high"},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED, response.data
        created = HelpdeskRequest.objects.get(id=response.data["id"])
        assert created.sla_resolution_due_at == created.created_at + timedelta(hours=12)


@pytest.mark.django_db
class TestRecurrenceEndpoint:
    def test_rerun_detection_is_member_gated(self, api_client, workspace, portal, db):
        outsider = User.objects.create(email="outsider2@plane.so")
        outsider.set_password("x")
        outsider.save()
        api_client.force_authenticate(user=outsider)

        req = HelpdeskRequest.objects.create(workspace=workspace, portal=portal, title="X")
        response = api_client.post(
            reverse(
                "helpdesk-request-recurrence",
                kwargs={"slug": workspace.slug, "request_pk": req.id},
            )
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_rerun_detection_finds_links_established_after_creation(
        self, session_client, workspace, portal
    ):
        customer = HelpdeskCustomer.objects.create(
            email="late@example.com", name="Late", workspace=workspace
        )
        customer.set_password("x")
        customer.save()

        now = timezone.now()
        first = HelpdeskRequest.objects.create(
            workspace=workspace, portal=portal, title="Servidor fora do ar", customer=customer
        )
        HelpdeskRequest.objects.filter(pk=first.pk).update(created_at=now - timedelta(days=1))
        # Created directly in the DB, so detection never ran for it.
        second = HelpdeskRequest.objects.create(
            workspace=workspace, portal=portal, title="Servidor fora do ar", customer=customer
        )

        response = session_client.post(
            reverse(
                "helpdesk-request-recurrence",
                kwargs={"slug": workspace.slug, "request_pk": second.id},
            )
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["detected"] == 1

    def test_recurrence_of_a_ticket_in_another_workspace_is_404(
        self, session_client, workspace, create_user
    ):
        from plane.db.models import Workspace

        other_ws = Workspace.objects.create(name="Other", owner=create_user, slug="other-ws-rec")
        WorkspaceMember.objects.create(workspace=other_ws, member=create_user, role=20)
        other_portal = HelpdeskPortal.objects.create(workspace=other_ws, public_slug="other-rec")
        foreign = HelpdeskRequest.objects.create(
            workspace=other_ws, portal=other_portal, title="Theirs"
        )

        response = session_client.get(
            reverse(
                "helpdesk-request-recurrence",
                kwargs={"slug": workspace.slug, "request_pk": foreign.id},
            )
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestSLASummary:
    def test_summary_reports_live_breach_counts(self, session_client, workspace, portal):
        now = timezone.now()
        breached = HelpdeskRequest.objects.create(
            workspace=workspace, portal=portal, title="Estourado", priority="urgent"
        )
        HelpdeskRequest.objects.filter(pk=breached.pk).update(
            sla_resolution_due_at=now - timedelta(hours=1)
        )

        response = session_client.get(
            reverse("helpdesk-sla-summary", kwargs={"slug": workspace.slug})
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["totals"]["breached"] == 1
        assert response.data["at_risk_window_hours"] == 4

    def test_archived_tickets_are_excluded(self, session_client, workspace, portal):
        now = timezone.now()
        archived = HelpdeskRequest.objects.create(
            workspace=workspace, portal=portal, title="Arquivado"
        )
        HelpdeskRequest.objects.filter(pk=archived.pk).update(
            sla_resolution_due_at=now - timedelta(hours=1), archived_at=now
        )

        response = session_client.get(
            reverse("helpdesk-sla-summary", kwargs={"slug": workspace.slug})
        )
        assert response.data["totals"]["breached"] == 0
