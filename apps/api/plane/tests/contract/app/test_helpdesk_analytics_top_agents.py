# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone

from plane.db.models import (
    HelpdeskPortal,
    HelpdeskRequest,
    HelpdeskRequestAssignee,
    HelpdeskStatus,
    User,
)


@pytest.fixture
def portal(db, workspace, create_user):
    return HelpdeskPortal.objects.create(
        workspace=workspace,
        public_slug="test-portal",
        sla_first_response_hours=4,
        sla_resolution_hours=24,
        created_by=create_user,
    )


@pytest.fixture
def terminal_status(db, workspace, create_user):
    return HelpdeskStatus.objects.create(
        workspace=workspace, name="Resolved", is_terminal=True, created_by=create_user
    )


@pytest.fixture
def fast_agent(db):
    user = User.objects.create(email="fast-agent@plane.so", username="fast-agent", first_name="Fast", last_name="A")
    user.set_password("password")
    user.save()
    return user


@pytest.fixture
def slow_agent(db):
    user = User.objects.create(email="slow-agent@plane.so", username="slow-agent", first_name="Slow", last_name="A")
    user.set_password("password")
    user.save()
    return user


def _make_request(workspace, portal, status, create_user, response_hours, resolution_hours):
    now = timezone.now()
    req = HelpdeskRequest.objects.create(
        workspace=workspace,
        portal=portal,
        title="Ticket",
        status=status,
        created_by=create_user,
    )
    HelpdeskRequest.objects.filter(id=req.id).update(
        created_at=now,
        first_responded_at=now + timedelta(hours=response_hours),
        resolved_at=now + timedelta(hours=resolution_hours),
    )
    req.refresh_from_db()
    return req


@pytest.mark.contract
@pytest.mark.django_db
class TestHelpdeskAnalyticsTopAgentsSLA:
    """`top_agents` carries per-agent SLA compliance, not just raw ticket count.

    Guards against the Executive Dashboard's Team Performance table treating
    ticket VOLUME as if it were a quality signal (see helpers.ts on the web app).
    """

    def _url(self, workspace_slug):
        return reverse("helpdesk-analytics", kwargs={"slug": workspace_slug})

    def test_agent_who_misses_sla_scores_lower_than_agent_who_meets_it(
        self, session_client, workspace, portal, terminal_status, create_user, fast_agent, slow_agent
    ):
        # fast_agent: responds in 1h (within 4h SLA), resolves in 2h (within 24h SLA).
        fast_ticket = _make_request(workspace, portal, terminal_status, create_user, response_hours=1, resolution_hours=2)
        HelpdeskRequestAssignee.objects.create(
            request=fast_ticket, assignee=fast_agent, workspace=workspace, created_by=create_user
        )

        # slow_agent: responds in 10h (misses 4h SLA), resolves in 48h (misses 24h SLA).
        slow_ticket = _make_request(
            workspace, portal, terminal_status, create_user, response_hours=10, resolution_hours=48
        )
        HelpdeskRequestAssignee.objects.create(
            request=slow_ticket, assignee=slow_agent, workspace=workspace, created_by=create_user
        )

        response = session_client.get(self._url(workspace.slug), {"date_filter": "last_30_days"})
        assert response.status_code == 200
        agents = {a["agent_id"]: a for a in response.data["charts"]["top_agents"]}

        fast_row = agents[str(fast_agent.id)]
        assert fast_row["count"] == 1
        assert fast_row["sla_first_response_pct"] == 100.0
        assert fast_row["sla_resolution_pct"] == 100.0

        slow_row = agents[str(slow_agent.id)]
        assert slow_row["count"] == 1
        assert slow_row["sla_first_response_pct"] == 0.0
        assert slow_row["sla_resolution_pct"] == 0.0

        # The two agents have identical ticket volume (1 each) -- their SLA
        # percentages, not their counts, must be what differs.
        assert fast_row["count"] == slow_row["count"]
        assert fast_row["sla_resolution_pct"] != slow_row["sla_resolution_pct"]

    def test_sla_pct_is_null_when_portal_has_no_sla_configured(
        self, session_client, workspace, terminal_status, create_user, fast_agent
    ):
        no_sla_portal = HelpdeskPortal.objects.create(
            workspace=workspace, public_slug="no-sla-portal", created_by=create_user
        )
        ticket = _make_request(workspace, no_sla_portal, terminal_status, create_user, response_hours=1, resolution_hours=2)
        HelpdeskRequestAssignee.objects.create(
            request=ticket, assignee=fast_agent, workspace=workspace, created_by=create_user
        )

        response = session_client.get(
            self._url(workspace.slug), {"date_filter": "last_30_days", "portal_id": str(no_sla_portal.id)}
        )
        assert response.status_code == 200
        agents = {a["agent_id"]: a for a in response.data["charts"]["top_agents"]}
        row = agents[str(fast_agent.id)]
        assert row["count"] == 1
        assert row["sla_first_response_pct"] is None
        assert row["sla_resolution_pct"] is None
