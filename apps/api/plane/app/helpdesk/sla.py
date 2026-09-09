"""SLA targets, deadlines and breach state for helpdesk requests.

Before this module the SLA was retroactive only: analytics compared elapsed time
against ``HelpdeskPortal.sla_*_hours`` after the fact, and
``HelpdeskRequest.sla_resolution_due_at`` was declared but never written by any
code path. There was no deadline on a ticket, so nothing could answer "which
tickets are about to breach?" -- the question an agent actually asks.

The model here is deliberately simple: **the stored deadline is absolute and
always current**. Paused time is added into it when a pause ends, so a deadline
in the past means a real breach and no reader has to subtract
``total_paused_duration``. The one exception is a ticket paused *right now*,
whose deadline is shifted on the fly by the time elapsed since the pause began --
see ``effective_due_expression``.
"""

from datetime import datetime, time, timedelta

from django.db.models import (
    Case,
    DateTimeField,
    DurationField,
    ExpressionWrapper,
    F,
    Q,
    Value,
    When,
)
from django.utils import timezone

from plane.db.models.helpdesk import HelpdeskRequest, HelpdeskSLAPolicy

# Legs of an SLA. Each has a deadline field and the timestamp that satisfies it.
FIRST_RESPONSE = "first_response"
RESOLUTION = "resolution"

LEG_FIELDS = {
    FIRST_RESPONSE: ("sla_first_response_due_at", "first_responded_at"),
    RESOLUTION: ("sla_resolution_due_at", "resolved_at"),
}

# Leg states.
STATUS_NONE = "none"  # no target configured for this priority
STATUS_OK = "ok"  # running, comfortably inside the window
STATUS_AT_RISK = "at_risk"  # running, deadline within AT_RISK_WINDOW
STATUS_MET = "met"  # satisfied before the deadline
STATUS_BREACHED = "breached"  # deadline passed, or satisfied after it

# How close to the deadline counts as "at risk".
#
# An absolute window rather than a fraction of the SLA on purpose: a fraction
# ("80% of the window elapsed") needs interval-by-float arithmetic that the ORM
# cannot express portably, which would force one definition for the per-ticket
# snapshot and a different one for the list filter. One rule that holds in both
# places is worth more than a cleverer rule that does not.
AT_RISK_WINDOW = timedelta(hours=4)


def resolve_sla_target(portal, priority):
    """Return ``(first_response_hours, resolution_hours)`` for a priority.

    An active policy for the exact priority wins. Otherwise the portal-wide pair
    applies, which is what every portal used before per-priority policies existed.

    A policy that leaves one leg null means "no target for that leg", not
    "inherit from the portal" -- otherwise a portal-wide deadline could never be
    lifted for a single priority.
    """
    if portal is None:
        return None, None

    policy = HelpdeskSLAPolicy.objects.filter(
        portal=portal,
        priority=priority,
        is_active=True,
        deleted_at__isnull=True,
    ).first()
    if policy:
        return policy.first_response_hours, policy.resolution_hours

    return portal.sla_first_response_hours, portal.sla_resolution_hours


def compute_due_dates(helpdesk_request, portal=None, start=None):
    """Absolute deadlines for a request, from the SLA target of its priority and target_date."""
    portal = portal if portal is not None else helpdesk_request.portal
    start = start or helpdesk_request.created_at or timezone.now()
    first_hours, resolution_hours = resolve_sla_target(portal, helpdesk_request.priority)

    # Time already spent paused was never the customer's to wait for, so it is
    # handed back as deadline.
    paused = helpdesk_request.total_paused_duration or timedelta(0)

    first_due = start + timedelta(hours=first_hours) + paused if first_hours else None
    resolution_due = start + timedelta(hours=resolution_hours) + paused if resolution_hours else None

    # If target_date (due date) is set, it extends the resolution deadline if later than policy SLA,
    # or establishes it if no SLA resolution target was configured.
    if helpdesk_request.target_date:
        target_due = timezone.make_aware(
            datetime.combine(helpdesk_request.target_date, time(23, 59, 59))
        ) + paused
        if resolution_due is None or target_due > resolution_due:
            resolution_due = target_due

    return first_due, resolution_due


def apply_sla_due_dates(helpdesk_request, portal=None, commit=True):
    """(Re)compute both deadlines and write them onto the request.

    Call this on creation and whenever the priority changes -- a ticket escalated
    to urgent must inherit the urgent deadline, counted from when it was opened,
    not from when it was escalated.
    """
    first_due, resolution_due = compute_due_dates(helpdesk_request, portal=portal)
    helpdesk_request.sla_first_response_due_at = first_due
    helpdesk_request.sla_resolution_due_at = resolution_due

    if commit:
        HelpdeskRequest.objects.filter(pk=helpdesk_request.pk).update(
            sla_first_response_due_at=first_due,
            sla_resolution_due_at=resolution_due,
        )
    return {
        "sla_first_response_due_at": first_due,
        "sla_resolution_due_at": resolution_due,
    }


def resume_fields_after_pause(helpdesk_request, now=None):
    """Fields to write when a request leaves a ``pauses_sla`` status.

    Returns the accumulated pause total plus both deadlines pushed forward by the
    length of the pause, so the ticket resumes with the same amount of SLA left
    as when it was paused.
    """
    now = now or timezone.now()
    paused_at = helpdesk_request.sla_paused_at
    if not paused_at:
        return {}

    pause_length = now - paused_at
    fields = {
        "total_paused_duration": (helpdesk_request.total_paused_duration or timedelta(0)) + pause_length,
        "sla_paused_at": None,
    }
    for due_field, _ in LEG_FIELDS.values():
        current = getattr(helpdesk_request, due_field)
        if current is not None:
            fields[due_field] = current + pause_length
    return fields


def effective_due(helpdesk_request, leg, now=None):
    """The deadline as it stands right now, accounting for an in-flight pause."""
    due_field, _ = LEG_FIELDS[leg]
    due_at = getattr(helpdesk_request, due_field)
    if due_at is None:
        return None
    if helpdesk_request.sla_paused_at:
        return due_at + ((now or timezone.now()) - helpdesk_request.sla_paused_at)
    return due_at


def leg_state(helpdesk_request, leg, now=None):
    """State of one SLA leg: status, deadline and time remaining."""
    now = now or timezone.now()
    _, completed_field = LEG_FIELDS[leg]
    due_at = effective_due(helpdesk_request, leg, now=now)
    completed_at = getattr(helpdesk_request, completed_field)

    if due_at is None:
        return {
            "status": STATUS_NONE,
            "due_at": None,
            "breached": False,
            "remaining_seconds": None,
        }

    if completed_at is not None:
        breached = completed_at > due_at
        return {
            "status": STATUS_BREACHED if breached else STATUS_MET,
            "due_at": due_at,
            "breached": breached,
            "remaining_seconds": None,
        }

    remaining = due_at - now
    if remaining.total_seconds() <= 0:
        status = STATUS_BREACHED
    elif remaining <= AT_RISK_WINDOW:
        status = STATUS_AT_RISK
    else:
        status = STATUS_OK

    return {
        "status": status,
        "due_at": due_at,
        "breached": status == STATUS_BREACHED,
        "remaining_seconds": int(remaining.total_seconds()),
    }


def sla_snapshot(helpdesk_request, now=None):
    """Both legs plus a rollup, for serialization."""
    now = now or timezone.now()
    first = leg_state(helpdesk_request, FIRST_RESPONSE, now=now)
    resolution = leg_state(helpdesk_request, RESOLUTION, now=now)

    if first["breached"] or resolution["breached"]:
        overall = STATUS_BREACHED
    elif STATUS_AT_RISK in (first["status"], resolution["status"]):
        overall = STATUS_AT_RISK
    elif first["status"] == STATUS_NONE and resolution["status"] == STATUS_NONE:
        overall = STATUS_NONE
    elif STATUS_OK in (first["status"], resolution["status"]):
        overall = STATUS_OK
    else:
        overall = STATUS_MET

    return {
        "status": overall,
        "is_paused": helpdesk_request.sla_paused_at is not None,
        "first_response": first,
        "resolution": resolution,
    }


def _effective_due_expression(due_field, now):
    """``due_field``, shifted by the in-flight pause when there is one."""
    return Case(
        When(
            sla_paused_at__isnull=False,
            then=ExpressionWrapper(
                F(due_field)
                + ExpressionWrapper(
                    Value(now, output_field=DateTimeField()) - F("sla_paused_at"),
                    output_field=DurationField(),
                ),
                output_field=DateTimeField(),
            ),
        ),
        default=F(due_field),
        output_field=DateTimeField(),
    )


def annotate_sla(queryset, now=None):
    """Make pause-adjusted deadlines available to filters and aggregates.

    Adds ``effective_first_response_due`` and ``effective_resolution_due``. Use
    with :func:`sla_status_filter`, which builds its ``Q`` objects against these
    names.

    ``alias()`` rather than ``annotate()`` on purpose. These are ``CASE``
    expressions, and Django puts every selected non-aggregate annotation into
    the ``GROUP BY``. A caller doing ``.values("priority").annotate(Count(...))``
    on an annotated queryset would therefore group by priority *and* by each
    distinct deadline -- one row per ticket instead of one per priority, with
    counts silently wrong. Aliases are usable in ``WHERE`` and in aggregate
    ``filter=`` without being selected, which is exactly what is needed here;
    nothing reads these two off the instance, since the serializer recomputes
    the snapshot in Python.
    """
    now = now or timezone.now()
    return queryset.alias(
        effective_first_response_due=_effective_due_expression("sla_first_response_due_at", now),
        effective_resolution_due=_effective_due_expression("sla_resolution_due_at", now),
    )


def _leg_breached_q(effective_field, completed_field, now):
    return Q(**{f"{effective_field}__isnull": False}) & (
        # Satisfied, but after the deadline.
        Q(**{f"{completed_field}__isnull": False, f"{completed_field}__gt": F(effective_field)})
        # Still open and the deadline has passed.
        | Q(**{f"{completed_field}__isnull": True, f"{effective_field}__lt": now})
    )


def _leg_at_risk_q(effective_field, completed_field, now):
    return Q(
        **{
            f"{effective_field}__isnull": False,
            f"{completed_field}__isnull": True,
            f"{effective_field}__gte": now,
            f"{effective_field}__lte": now + AT_RISK_WINDOW,
        }
    )


def sla_status_filter(value, now=None):
    """``Q`` for ``?sla_status=``. Returns ``None`` for an unknown value.

    Requires the queryset to have been passed through :func:`annotate_sla`.
    """
    now = now or timezone.now()

    breached = _leg_breached_q("effective_first_response_due", "first_responded_at", now) | _leg_breached_q(
        "effective_resolution_due", "resolved_at", now
    )
    at_risk = _leg_at_risk_q("effective_first_response_due", "first_responded_at", now) | _leg_at_risk_q(
        "effective_resolution_due", "resolved_at", now
    )

    if value == STATUS_BREACHED:
        return breached
    if value == STATUS_AT_RISK:
        # A ticket that already breached one leg is reported as breached, not
        # at risk, so the two filters never return the same ticket.
        return at_risk & ~breached
    if value == STATUS_OK:
        return ~breached & ~at_risk
    if value == STATUS_NONE:
        return Q(effective_first_response_due__isnull=True) & Q(effective_resolution_due__isnull=True)
    return None
