from datetime import datetime, time, timedelta

import pytest
from django.utils import timezone

from plane.app.helpdesk import sla
from plane.db.models.helpdesk import (
    HelpdeskPortal,
    HelpdeskRequest,
    HelpdeskRequestPriority,
    HelpdeskSLAPolicy,
)


@pytest.fixture
def portal(workspace):
    return HelpdeskPortal.objects.create(
        workspace=workspace,
        public_slug="sla-portal",
        sla_first_response_hours=8,
        sla_resolution_hours=48,
    )


def make_request(portal, **kwargs):
    defaults = {
        "workspace": portal.workspace,
        "portal": portal,
        "title": "Printer is offline",
        "priority": HelpdeskRequestPriority.MEDIUM,
    }
    defaults.update(kwargs)
    return HelpdeskRequest.objects.create(**defaults)


@pytest.mark.unit
@pytest.mark.django_db
class TestResolveSLATarget:
    def test_falls_back_to_portal_when_no_policy_exists(self, portal):
        assert sla.resolve_sla_target(portal, HelpdeskRequestPriority.URGENT) == (8, 48)

    def test_active_policy_overrides_the_portal_pair(self, portal):
        HelpdeskSLAPolicy.objects.create(
            workspace=portal.workspace,
            portal=portal,
            priority=HelpdeskRequestPriority.URGENT,
            first_response_hours=1,
            resolution_hours=4,
        )
        assert sla.resolve_sla_target(portal, HelpdeskRequestPriority.URGENT) == (1, 4)
        # Other priorities are untouched by an urgent-only policy.
        assert sla.resolve_sla_target(portal, HelpdeskRequestPriority.LOW) == (8, 48)

    def test_inactive_policy_is_ignored(self, portal):
        HelpdeskSLAPolicy.objects.create(
            workspace=portal.workspace,
            portal=portal,
            priority=HelpdeskRequestPriority.URGENT,
            first_response_hours=1,
            resolution_hours=4,
            is_active=False,
        )
        assert sla.resolve_sla_target(portal, HelpdeskRequestPriority.URGENT) == (8, 48)

    def test_null_leg_on_a_policy_means_no_target_not_inherit(self, portal):
        """A policy must be able to lift a portal-wide deadline for one priority."""
        HelpdeskSLAPolicy.objects.create(
            workspace=portal.workspace,
            portal=portal,
            priority=HelpdeskRequestPriority.LOW,
            first_response_hours=None,
            resolution_hours=72,
        )
        assert sla.resolve_sla_target(portal, HelpdeskRequestPriority.LOW) == (None, 72)

    def test_portal_without_sla_configured_yields_no_targets(self, workspace):
        bare = HelpdeskPortal.objects.create(workspace=workspace, public_slug="bare")
        assert sla.resolve_sla_target(bare, HelpdeskRequestPriority.HIGH) == (None, None)


@pytest.mark.unit
@pytest.mark.django_db
class TestApplyDueDates:
    def test_writes_both_deadlines_from_the_priority_policy(self, portal):
        HelpdeskSLAPolicy.objects.create(
            workspace=portal.workspace,
            portal=portal,
            priority=HelpdeskRequestPriority.URGENT,
            first_response_hours=1,
            resolution_hours=4,
        )
        req = make_request(portal, priority=HelpdeskRequestPriority.URGENT)

        sla.apply_sla_due_dates(req)
        req.refresh_from_db()

        assert req.sla_first_response_due_at == req.created_at + timedelta(hours=1)
        assert req.sla_resolution_due_at == req.created_at + timedelta(hours=4)

    def test_escalation_recounts_from_creation_not_from_the_escalation(self, portal):
        """An urgent deadline must be measured from when the customer opened the ticket."""
        HelpdeskSLAPolicy.objects.create(
            workspace=portal.workspace,
            portal=portal,
            priority=HelpdeskRequestPriority.URGENT,
            first_response_hours=2,
            resolution_hours=6,
        )
        req = make_request(portal, priority=HelpdeskRequestPriority.LOW)
        sla.apply_sla_due_dates(req)

        req.priority = HelpdeskRequestPriority.URGENT
        sla.apply_sla_due_dates(req)
        req.refresh_from_db()

        assert req.sla_resolution_due_at == req.created_at + timedelta(hours=6)

    def test_already_accumulated_pause_time_is_given_back(self, portal):
        req = make_request(portal, total_paused_duration=timedelta(hours=5))
        sla.apply_sla_due_dates(req)
        req.refresh_from_db()

        assert req.sla_resolution_due_at == req.created_at + timedelta(hours=48) + timedelta(hours=5)

    def test_no_target_clears_the_deadlines(self, workspace):
        bare = HelpdeskPortal.objects.create(workspace=workspace, public_slug="bare-2")
        req = make_request(bare)
        sla.apply_sla_due_dates(req)
        req.refresh_from_db()

        assert req.sla_first_response_due_at is None
        assert req.sla_resolution_due_at is None

    def test_target_date_extends_resolution_due_at(self, portal):
        req = make_request(portal)
        # Portal resolution is 48 hours (~2 days). Set target_date 10 days out.
        future_date = (req.created_at + timedelta(days=10)).date()
        req.target_date = future_date
        req.save()

        sla.apply_sla_due_dates(req)
        req.refresh_from_db()

        expected_due = timezone.make_aware(datetime.combine(future_date, time(23, 59, 59)))
        assert req.sla_resolution_due_at == expected_due
        # First response is completely unaffected
        assert req.sla_first_response_due_at == req.created_at + timedelta(hours=8)

    def test_target_date_earlier_does_not_shorten_policy_resolution_sla(self, portal):
        req = make_request(portal)
        # Portal resolution is 48 hours. Set target_date to tomorrow (earlier than 48h).
        near_date = (req.created_at + timedelta(days=1)).date()
        req.target_date = near_date
        req.save()

        sla.apply_sla_due_dates(req)
        req.refresh_from_db()

        # Policy gives 48 hours; an aggressive target date must not shorten the contractual SLA
        assert req.sla_resolution_due_at == req.created_at + timedelta(hours=48)

    def test_target_date_sets_resolution_due_when_portal_has_no_sla(self, workspace):
        bare = HelpdeskPortal.objects.create(workspace=workspace, public_slug="bare-target")
        req = make_request(bare)
        future_date = (req.created_at + timedelta(days=5)).date()
        req.target_date = future_date
        req.save()

        sla.apply_sla_due_dates(req)
        req.refresh_from_db()

        expected_due = timezone.make_aware(datetime.combine(future_date, time(23, 59, 59)))
        assert req.sla_resolution_due_at == expected_due
        assert req.sla_first_response_due_at is None

    def test_clearing_target_date_restores_policy_resolution_due(self, portal):
        req = make_request(portal)
        future_date = (req.created_at + timedelta(days=10)).date()
        req.target_date = future_date
        req.save()
        sla.apply_sla_due_dates(req)
        req.refresh_from_db()

        # Now clear target_date
        req.target_date = None
        req.save()
        sla.apply_sla_due_dates(req)
        req.refresh_from_db()

        assert req.sla_resolution_due_at == req.created_at + timedelta(hours=48)

    def test_target_date_with_paused_duration_preserves_paused_time(self, portal):
        req = make_request(portal, total_paused_duration=timedelta(hours=6))
        future_date = (req.created_at + timedelta(days=10)).date()
        req.target_date = future_date
        req.save()

        sla.apply_sla_due_dates(req)
        req.refresh_from_db()

        expected_due = timezone.make_aware(datetime.combine(future_date, time(23, 59, 59))) + timedelta(hours=6)
        assert req.sla_resolution_due_at == expected_due


@pytest.mark.unit
@pytest.mark.django_db
class TestPauseResume:
    def test_resume_shifts_both_deadlines_by_the_pause_length(self, portal):
        now = timezone.now()
        req = make_request(portal)
        sla.apply_sla_due_dates(req)
        original_resolution = req.sla_resolution_due_at
        original_first = req.sla_first_response_due_at

        req.sla_paused_at = now - timedelta(hours=3)
        fields = sla.resume_fields_after_pause(req, now=now)

        assert fields["sla_paused_at"] is None
        assert fields["total_paused_duration"] == timedelta(hours=3)
        assert fields["sla_resolution_due_at"] == original_resolution + timedelta(hours=3)
        assert fields["sla_first_response_due_at"] == original_first + timedelta(hours=3)

    def test_resume_on_a_request_that_was_not_paused_is_a_no_op(self, portal):
        req = make_request(portal)
        assert sla.resume_fields_after_pause(req) == {}

    def test_a_paused_ticket_does_not_breach_while_the_clock_is_stopped(self, portal):
        """The whole point of pausing: waiting on the customer cannot burn the SLA."""
        now = timezone.now()
        req = make_request(portal)
        req.sla_resolution_due_at = now - timedelta(hours=2)  # nominally overdue
        req.sla_paused_at = now - timedelta(hours=10)  # but paused well before that

        state = sla.leg_state(req, sla.RESOLUTION, now=now)
        assert state["status"] == sla.STATUS_OK
        assert state["breached"] is False


@pytest.mark.unit
@pytest.mark.django_db
class TestLegState:
    def test_no_deadline_reports_none(self, portal):
        req = make_request(portal)
        assert sla.leg_state(req, sla.RESOLUTION)["status"] == sla.STATUS_NONE

    def test_open_and_past_the_deadline_is_breached(self, portal):
        now = timezone.now()
        req = make_request(portal)
        req.sla_resolution_due_at = now - timedelta(minutes=1)

        state = sla.leg_state(req, sla.RESOLUTION, now=now)
        assert state["status"] == sla.STATUS_BREACHED
        assert state["breached"] is True

    def test_resolved_after_the_deadline_stays_breached(self, portal):
        """Closing a late ticket does not un-break the SLA."""
        now = timezone.now()
        req = make_request(portal)
        req.sla_resolution_due_at = now - timedelta(hours=5)
        req.resolved_at = now - timedelta(hours=1)

        state = sla.leg_state(req, sla.RESOLUTION, now=now)
        assert state["status"] == sla.STATUS_BREACHED
        assert state["breached"] is True

    def test_resolved_before_the_deadline_is_met(self, portal):
        now = timezone.now()
        req = make_request(portal)
        req.sla_resolution_due_at = now + timedelta(hours=5)
        req.resolved_at = now - timedelta(hours=1)

        state = sla.leg_state(req, sla.RESOLUTION, now=now)
        assert state["status"] == sla.STATUS_MET
        assert state["breached"] is False

    def test_inside_the_at_risk_window(self, portal):
        now = timezone.now()
        req = make_request(portal)
        req.sla_resolution_due_at = now + sla.AT_RISK_WINDOW - timedelta(minutes=10)

        assert sla.leg_state(req, sla.RESOLUTION, now=now)["status"] == sla.STATUS_AT_RISK

    def test_comfortably_inside_the_window_is_ok(self, portal):
        now = timezone.now()
        req = make_request(portal)
        req.sla_resolution_due_at = now + sla.AT_RISK_WINDOW + timedelta(hours=1)

        state = sla.leg_state(req, sla.RESOLUTION, now=now)
        assert state["status"] == sla.STATUS_OK
        assert state["remaining_seconds"] > 0


@pytest.mark.unit
@pytest.mark.django_db
class TestSnapshot:
    def test_a_breach_on_either_leg_drives_the_rollup(self, portal):
        now = timezone.now()
        req = make_request(portal)
        req.sla_first_response_due_at = now - timedelta(hours=1)  # breached
        req.sla_resolution_due_at = now + timedelta(days=1)  # fine

        assert sla.sla_snapshot(req, now=now)["status"] == sla.STATUS_BREACHED

    def test_no_targets_at_all_reports_none(self, portal):
        req = make_request(portal)
        assert sla.sla_snapshot(req)["status"] == sla.STATUS_NONE


@pytest.mark.unit
@pytest.mark.django_db
class TestStatusFilter:
    def _qs(self, now):
        return sla.annotate_sla(HelpdeskRequest.objects.all(), now=now)

    def test_breached_filter_finds_the_overdue_ticket_only(self, portal):
        now = timezone.now()
        overdue = make_request(portal, title="overdue")
        HelpdeskRequest.objects.filter(pk=overdue.pk).update(sla_resolution_due_at=now - timedelta(hours=1))
        healthy = make_request(portal, title="healthy")
        HelpdeskRequest.objects.filter(pk=healthy.pk).update(sla_resolution_due_at=now + timedelta(days=2))

        found = self._qs(now).filter(sla.sla_status_filter(sla.STATUS_BREACHED, now=now))
        assert list(found.values_list("id", flat=True)) == [overdue.id]

    def test_at_risk_excludes_already_breached_tickets(self, portal):
        """The two filters must partition, or a dashboard double-counts."""
        now = timezone.now()
        both = make_request(portal, title="breached and near")
        HelpdeskRequest.objects.filter(pk=both.pk).update(
            sla_first_response_due_at=now - timedelta(hours=1),
            sla_resolution_due_at=now + timedelta(hours=1),
        )

        at_risk = self._qs(now).filter(sla.sla_status_filter(sla.STATUS_AT_RISK, now=now))
        breached = self._qs(now).filter(sla.sla_status_filter(sla.STATUS_BREACHED, now=now))

        assert list(at_risk.values_list("id", flat=True)) == []
        assert list(breached.values_list("id", flat=True)) == [both.id]

    def test_a_paused_ticket_is_not_reported_as_breached_in_sql(self, portal):
        """Same rule as leg_state, enforced in the queryset annotation."""
        now = timezone.now()
        paused = make_request(portal, title="paused")
        HelpdeskRequest.objects.filter(pk=paused.pk).update(
            sla_resolution_due_at=now - timedelta(hours=2),
            sla_paused_at=now - timedelta(hours=10),
        )

        breached = self._qs(now).filter(sla.sla_status_filter(sla.STATUS_BREACHED, now=now))
        assert list(breached.values_list("id", flat=True)) == []

    def test_unknown_value_returns_none_so_callers_can_ignore_it(self):
        assert sla.sla_status_filter("banana") is None
