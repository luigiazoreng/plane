"""Contract tests for the public /api/v1/ helpdesk endpoints (API key auth)."""

from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from plane.db.models import User, Workspace, WorkspaceMember
from plane.db.models.helpdesk import (
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
        public_slug="api-portal",
        sla_first_response_hours=8,
        sla_resolution_hours=48,
    )


@pytest.fixture
def default_status(workspace):
    return HelpdeskStatus.objects.create(
        workspace=workspace, name="Open", is_default=True, sequence=10000
    )


def url(name, **kwargs):
    return reverse(name, kwargs=kwargs)


@pytest.mark.django_db
class TestAuthentication:
    def test_unauthenticated_request_is_rejected(self, api_client, workspace):
        response = api_client.get(url("helpdesk-requests", slug=workspace.slug))
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_a_user_with_no_workspace_membership_is_forbidden(self, api_client, workspace, db):
        """An API key is scoped to its owner, not to the workspace in the URL."""
        from plane.db.models.api import APIToken

        outsider = User.objects.create(email="outsider@plane.so")
        outsider.set_password("x")
        outsider.save()
        token = APIToken.objects.create(user=outsider, label="Outsider", token="outsider-token")
        api_client.credentials(HTTP_X_API_KEY=token.token)

        response = api_client.get(url("helpdesk-requests", slug=workspace.slug))
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
class TestRequestListCreate:
    def test_create_derives_the_deadlines_from_the_priority_policy(
        self, api_key_client, workspace, portal, default_status
    ):
        HelpdeskSLAPolicy.objects.create(
            workspace=workspace,
            portal=portal,
            priority=HelpdeskRequestPriority.URGENT,
            first_response_hours=1,
            resolution_hours=4,
        )

        response = api_key_client.post(
            url("helpdesk-requests", slug=workspace.slug),
            {
                "portal": str(portal.id),
                "title": "Servidor fora do ar",
                "priority": "urgent",
                "contact_email": "cliente@example.com",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED, response.data
        created = HelpdeskRequest.objects.get(id=response.data["id"])
        assert created.sla_first_response_due_at == created.created_at + timedelta(hours=1)
        assert created.sla_resolution_due_at == created.created_at + timedelta(hours=4)
        assert response.data["sla"]["resolution"]["status"] == "ok"

    def test_client_supplied_deadlines_are_ignored(self, api_key_client, workspace, portal, default_status):
        """Otherwise any key holder could give themselves a year to answer."""
        forged = (timezone.now() + timedelta(days=365)).isoformat()

        response = api_key_client.post(
            url("helpdesk-requests", slug=workspace.slug),
            {
                "portal": str(portal.id),
                "title": "Tentativa de forjar prazo",
                "priority": "urgent",
                "sla_resolution_due_at": forged,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        created = HelpdeskRequest.objects.get(id=response.data["id"])
        # Falls back to the portal-wide 48h, not the forged value.
        assert created.sla_resolution_due_at == created.created_at + timedelta(hours=48)

    def test_create_rejects_a_portal_from_another_workspace(self, api_key_client, workspace, create_user):
        other_ws = Workspace.objects.create(name="Other", owner=create_user, slug="other-ws-api")
        WorkspaceMember.objects.create(workspace=other_ws, member=create_user, role=20)
        foreign_portal = HelpdeskPortal.objects.create(workspace=other_ws, public_slug="foreign")

        response = api_key_client.post(
            url("helpdesk-requests", slug=workspace.slug),
            {"portal": str(foreign_portal.id), "title": "Cross-workspace"},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_rejects_a_form_from_another_workspace(
        self, api_key_client, workspace, portal, create_user
    ):
        """`form` is a plain PK field; without scoping it is a cross-tenant handle."""
        from plane.db.models.helpdesk import HelpdeskForm

        other_ws = Workspace.objects.create(name="Other", owner=create_user, slug="other-ws-form")
        WorkspaceMember.objects.create(workspace=other_ws, member=create_user, role=20)
        other_portal = HelpdeskPortal.objects.create(workspace=other_ws, public_slug="other-form")
        foreign_form = HelpdeskForm.objects.create(
            workspace=other_ws,
            portal=other_portal,
            name="Foreign",
            slug="foreign",
            visibility="public",
            sequence=10000,
        )

        response = api_key_client.post(
            url("helpdesk-requests", slug=workspace.slug),
            {"portal": str(portal.id), "title": "Injecao", "form": str(foreign_form.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "form" in response.data

    def test_list_only_returns_tickets_of_the_workspace_in_the_url(
        self, api_key_client, workspace, portal, create_user
    ):
        HelpdeskRequest.objects.create(workspace=workspace, portal=portal, title="Mine")

        other_ws = Workspace.objects.create(name="Other", owner=create_user, slug="other-ws-list")
        WorkspaceMember.objects.create(workspace=other_ws, member=create_user, role=20)
        other_portal = HelpdeskPortal.objects.create(workspace=other_ws, public_slug="other-list")
        HelpdeskRequest.objects.create(workspace=other_ws, portal=other_portal, title="Theirs")

        response = api_key_client.get(url("helpdesk-requests", slug=workspace.slug))

        assert response.status_code == status.HTTP_200_OK
        titles = [row["title"] for row in response.data["results"]]
        assert titles == ["Mine"]

    def test_filter_by_sla_status_breached(self, api_key_client, workspace, portal):
        now = timezone.now()
        overdue = HelpdeskRequest.objects.create(workspace=workspace, portal=portal, title="Atrasado")
        HelpdeskRequest.objects.filter(pk=overdue.pk).update(sla_resolution_due_at=now - timedelta(hours=2))
        healthy = HelpdeskRequest.objects.create(workspace=workspace, portal=portal, title="No prazo")
        HelpdeskRequest.objects.filter(pk=healthy.pk).update(sla_resolution_due_at=now + timedelta(days=3))

        response = api_key_client.get(
            url("helpdesk-requests", slug=workspace.slug), {"sla_status": "breached"}
        )

        assert response.status_code == status.HTTP_200_OK
        assert [row["title"] for row in response.data["results"]] == ["Atrasado"]

    def test_an_unknown_sla_status_is_a_400_not_a_silent_empty_list(
        self, api_key_client, workspace, portal
    ):
        response = api_key_client.get(
            url("helpdesk-requests", slug=workspace.slug), {"sla_status": "banana"}
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "allowed" in response.data

    def test_filter_by_priority(self, api_key_client, workspace, portal):
        HelpdeskRequest.objects.create(
            workspace=workspace, portal=portal, title="Urgente", priority="urgent"
        )
        HelpdeskRequest.objects.create(workspace=workspace, portal=portal, title="Baixa", priority="low")

        response = api_key_client.get(url("helpdesk-requests", slug=workspace.slug), {"priority": "urgent"})

        assert [row["title"] for row in response.data["results"]] == ["Urgente"]


@pytest.mark.django_db
class TestRequestDetail:
    def test_escalating_priority_recomputes_the_deadline_from_creation(
        self, api_key_client, workspace, portal
    ):
        HelpdeskSLAPolicy.objects.create(
            workspace=workspace,
            portal=portal,
            priority=HelpdeskRequestPriority.URGENT,
            first_response_hours=1,
            resolution_hours=2,
        )
        req = HelpdeskRequest.objects.create(
            workspace=workspace, portal=portal, title="Escalar", priority="low"
        )

        response = api_key_client.patch(
            url("helpdesk-requests", slug=workspace.slug, request_id=req.id),
            {"priority": "urgent"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK, response.data
        req.refresh_from_db()
        assert req.sla_resolution_due_at == req.created_at + timedelta(hours=2)

    def test_moving_into_a_pausing_status_stops_the_clock(self, api_key_client, workspace, portal):
        waiting = HelpdeskStatus.objects.create(
            workspace=workspace, name="Waiting on customer", pauses_sla=True, sequence=20000
        )
        req = HelpdeskRequest.objects.create(workspace=workspace, portal=portal, title="Pausar")

        response = api_key_client.patch(
            url("helpdesk-requests", slug=workspace.slug, request_id=req.id),
            {"status": str(waiting.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        req.refresh_from_db()
        assert req.sla_paused_at is not None
        assert response.data["sla"]["is_paused"] is True

    def test_leaving_a_pausing_status_pushes_the_deadline_forward(
        self, api_key_client, workspace, portal, default_status
    ):
        waiting = HelpdeskStatus.objects.create(
            workspace=workspace, name="Waiting", pauses_sla=True, sequence=20000
        )
        now = timezone.now()
        req = HelpdeskRequest.objects.create(
            workspace=workspace, portal=portal, title="Retomar", status=waiting
        )
        HelpdeskRequest.objects.filter(pk=req.pk).update(
            sla_resolution_due_at=now + timedelta(hours=10),
            sla_paused_at=now - timedelta(hours=3),
        )
        req.refresh_from_db()
        original_due = req.sla_resolution_due_at

        response = api_key_client.patch(
            url("helpdesk-requests", slug=workspace.slug, request_id=req.id),
            {"status": str(default_status.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        req.refresh_from_db()
        assert req.sla_paused_at is None
        assert req.total_paused_duration >= timedelta(hours=3)
        assert req.sla_resolution_due_at > original_due

    def test_retrieve_of_a_ticket_in_another_workspace_is_404(
        self, api_key_client, workspace, create_user
    ):
        other_ws = Workspace.objects.create(name="Other", owner=create_user, slug="other-ws-detail")
        WorkspaceMember.objects.create(workspace=other_ws, member=create_user, role=20)
        other_portal = HelpdeskPortal.objects.create(workspace=other_ws, public_slug="other-detail")
        foreign = HelpdeskRequest.objects.create(
            workspace=other_ws, portal=other_portal, title="Theirs"
        )

        response = api_key_client.get(
            url("helpdesk-requests", slug=workspace.slug, request_id=foreign.id)
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestSLAPolicies:
    def test_create_and_list_a_policy(self, api_key_client, workspace, portal):
        response = api_key_client.post(
            url("helpdesk-sla-policies", slug=workspace.slug),
            {
                "portal": str(portal.id),
                "priority": "urgent",
                "first_response_hours": 1,
                "resolution_hours": 4,
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data

        listing = api_key_client.get(url("helpdesk-sla-policies", slug=workspace.slug))
        assert [row["priority"] for row in listing.data["results"]] == ["urgent"]

    def test_rejects_a_policy_with_neither_leg_set(self, api_key_client, workspace, portal):
        response = api_key_client.post(
            url("helpdesk-sla-policies", slug=workspace.slug),
            {"portal": str(portal.id), "priority": "low"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_rejects_first_response_longer_than_resolution(self, api_key_client, workspace, portal):
        response = api_key_client.post(
            url("helpdesk-sla-policies", slug=workspace.slug),
            {
                "portal": str(portal.id),
                "priority": "low",
                "first_response_hours": 10,
                "resolution_hours": 4,
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_rejects_non_positive_hours(self, api_key_client, workspace, portal):
        response = api_key_client.post(
            url("helpdesk-sla-policies", slug=workspace.slug),
            {"portal": str(portal.id), "priority": "low", "resolution_hours": 0},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_deleting_a_policy_restores_the_portal_fallback(self, api_key_client, workspace, portal):
        policy = HelpdeskSLAPolicy.objects.create(
            workspace=workspace,
            portal=portal,
            priority=HelpdeskRequestPriority.URGENT,
            first_response_hours=1,
            resolution_hours=4,
        )

        response = api_key_client.delete(
            url("helpdesk-sla-policies", slug=workspace.slug, policy_id=policy.id)
        )
        assert response.status_code == status.HTTP_204_NO_CONTENT

        from plane.app.helpdesk.sla import resolve_sla_target

        assert resolve_sla_target(portal, HelpdeskRequestPriority.URGENT) == (8, 48)


@pytest.mark.django_db
class TestPrioritiesAndSummary:
    def test_priorities_report_the_target_that_applies_to_each(
        self, api_key_client, workspace, portal
    ):
        HelpdeskSLAPolicy.objects.create(
            workspace=workspace,
            portal=portal,
            priority=HelpdeskRequestPriority.URGENT,
            first_response_hours=1,
            resolution_hours=4,
        )

        response = api_key_client.get(
            url("helpdesk-priorities", slug=workspace.slug), {"portal": str(portal.id)}
        )

        assert response.status_code == status.HTTP_200_OK
        by_value = {row["value"]: row for row in response.data["results"]}
        assert by_value["urgent"]["resolution_hours"] == 4
        # Everything else still falls back to the portal pair.
        assert by_value["low"]["resolution_hours"] == 48

    def test_summary_counts_breached_and_at_risk(self, api_key_client, workspace, portal):
        now = timezone.now()
        breached = HelpdeskRequest.objects.create(
            workspace=workspace, portal=portal, title="Estourado", priority="urgent"
        )
        HelpdeskRequest.objects.filter(pk=breached.pk).update(
            sla_resolution_due_at=now - timedelta(hours=1)
        )
        at_risk = HelpdeskRequest.objects.create(
            workspace=workspace, portal=portal, title="Quase", priority="high"
        )
        HelpdeskRequest.objects.filter(pk=at_risk.pk).update(
            sla_resolution_due_at=now + timedelta(hours=1)
        )

        response = api_key_client.get(url("helpdesk-sla-summary", slug=workspace.slug))

        assert response.status_code == status.HTTP_200_OK
        assert response.data["totals"]["breached"] == 1
        assert response.data["totals"]["at_risk"] == 1
        by_priority = {row["priority"]: row for row in response.data["by_priority"]}
        assert by_priority["urgent"]["breached"] == 1
        assert by_priority["high"]["at_risk"] == 1
        # Every priority is reported, including the empty ones.
        assert set(by_priority) == {"urgent", "high", "medium", "low", "none"}

    def test_by_priority_aggregates_instead_of_grouping_per_deadline(
        self, api_key_client, workspace, portal
    ):
        """Two urgent tickets with *different* deadlines must still count as one group.

        The SLA deadline expressions are CASE expressions. Selected as
        annotations they land in the GROUP BY, which would split this into two
        rows of 1 instead of one row of 2.
        """
        now = timezone.now()
        for offset in (1, 5):
            req = HelpdeskRequest.objects.create(
                workspace=workspace, portal=portal, title=f"Estourado {offset}", priority="urgent"
            )
            HelpdeskRequest.objects.filter(pk=req.pk).update(
                sla_resolution_due_at=now - timedelta(hours=offset)
            )

        response = api_key_client.get(url("helpdesk-sla-summary", slug=workspace.slug))

        by_priority = {row["priority"]: row for row in response.data["by_priority"]}
        assert by_priority["urgent"]["breached"] == 2
        assert by_priority["urgent"]["total"] == 2
        assert response.data["totals"]["breached"] == 2


@pytest.mark.django_db
class TestRecurrenceEndpoint:
    def test_lists_the_ticket_it_repeats(self, api_key_client, workspace, portal):
        from plane.app.helpdesk.recurrence import detect_recurrence
        from plane.db.models.helpdesk import HelpdeskCustomer

        customer = HelpdeskCustomer.objects.create(
            email="rep@example.com", name="Rep", workspace=workspace
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

        response = api_key_client.get(
            url("helpdesk-request-recurrence", slug=workspace.slug, request_id=second.id)
        )

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["repeats"]) == 1
        assert response.data["repeats"][0]["related_request_detail"]["id"] == str(first.id)

        # And the original reports being repeated.
        back = api_key_client.get(
            url("helpdesk-request-recurrence", slug=workspace.slug, request_id=first.id)
        )
        assert len(back.data["repeated_by"]) == 1
        assert back.data["repeated_by"][0]["related_request_detail"]["id"] == str(second.id)
