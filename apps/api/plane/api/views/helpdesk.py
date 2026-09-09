# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db.models import Count, Prefetch, Q
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

# Module imports
from plane.api.serializers.helpdesk import (
    HelpdeskRequestAPISerializer,
    HelpdeskRequestRecurrenceAPISerializer,
    HelpdeskSLAPolicyAPISerializer,
    HelpdeskStatusAPISerializer,
)
from plane.app.helpdesk import sla as sla_service
from plane.app.helpdesk.permissions import ADMIN, MEMBER, get_helpdesk_role
from plane.app.helpdesk.recurrence import (
    annotate_is_recurrent,
    annotate_recurrence_count,
    detect_recurrence,
)
from plane.app.helpdesk.sse_broker import publish
from plane.db.models import Workspace
from plane.db.models.helpdesk import (
    HelpdeskForm,
    HelpdeskPortal,
    HelpdeskRequest,
    HelpdeskRequestPriority,
    HelpdeskRequestRecurrence,
    HelpdeskSLAPolicy,
    HelpdeskStatus,
    HelpdeskTeam,
)

from .base import BaseAPIView

# Safe methods need any helpdesk role; writes need MEMBER; SLA policy writes
# need ADMIN. Mirrors the floors the app layer already enforces, so an API key
# never grants more than the same person has in the UI.
SAFE_METHODS = ("GET", "HEAD", "OPTIONS")


class HelpdeskAPIPermission(BasePermission):
    """Any helpdesk role may read; MEMBER and above may write."""

    required_write_role = MEMBER

    def has_permission(self, request, view):
        slug = view.kwargs.get("slug")
        if not slug:
            return False
        role = get_helpdesk_role(request.user, slug)
        if role is None:
            return False
        if request.method in SAFE_METHODS:
            return True
        return role >= self.required_write_role


class HelpdeskAdminAPIPermission(HelpdeskAPIPermission):
    """Reading is open to agents, but only ADMINs may change SLA policy."""

    required_write_role = ADMIN


class HelpdeskRequestBaseAPIEndpoint(BaseAPIView):
    serializer_class = HelpdeskRequestAPISerializer
    model = HelpdeskRequest
    permission_classes = [HelpdeskAPIPermission]

    def base_queryset(self):
        queryset = HelpdeskRequest.objects.filter(
            workspace__slug=self.kwargs.get("slug"),
            deleted_at__isnull=True,
        ).select_related("status", "portal", "form", "customer")
        queryset = sla_service.annotate_sla(queryset)
        return annotate_recurrence_count(annotate_is_recurrent(queryset))

    def validate_related_ids(self, request, workspace):
        """Reject related objects that live in another workspace.

        ``form``, ``team`` and ``status`` are plain PK fields on the serializer,
        so without this a caller holding a key for workspace A could attach
        workspace B's form to a ticket just by knowing its id.
        """
        checks = (
            ("form", HelpdeskForm),
            ("team", HelpdeskTeam),
            ("status", HelpdeskStatus),
        )
        for field, model in checks:
            value = request.data.get(field)
            if not value:
                continue
            if not model.objects.filter(pk=value, workspace=workspace, deleted_at__isnull=True).exists():
                return Response(
                    {field: f"{model._meta.verbose_name} not found for this workspace."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        return None


class HelpdeskRequestListCreateAPIEndpoint(HelpdeskRequestBaseAPIEndpoint):
    """Helpdesk ticket list and create."""

    use_read_replica = True

    # comma-separated multi-value params, same convention as the app layer
    MULTI_VALUE_FILTERS = {
        "priority": "priority__in",
        "status": "status__in",
        "portal": "portal__in",
        "source": "source__in",
        "team": "team__in",
    }

    ALLOWED_ORDER_BY = {
        "created_at",
        "-created_at",
        "updated_at",
        "-updated_at",
        "sla_resolution_due_at",
        "-sla_resolution_due_at",
    }

    def get_queryset(self):
        queryset = self.base_queryset()

        if self.request.query_params.get("include_archived", "").lower() not in ("1", "true", "yes"):
            queryset = queryset.filter(archived_at__isnull=True)

        for param, lookup in self.MULTI_VALUE_FILTERS.items():
            raw = self.request.query_params.get(param)
            if raw:
                values = [item for item in raw.split(",") if item]
                if values:
                    queryset = queryset.filter(**{lookup: values})

        sla_status = self.request.query_params.get("sla_status")
        if sla_status:
            sla_filter = sla_service.sla_status_filter(sla_status)
            if sla_filter is None:
                return queryset.none()
            queryset = queryset.filter(sla_filter)

        is_recurrent = self.request.query_params.get("is_recurrent")
        if is_recurrent is not None:
            queryset = queryset.filter(is_recurrent=is_recurrent.lower() in ("1", "true", "yes"))

        created_at_gte = self.request.query_params.get("created_at__gte")
        created_at_lte = self.request.query_params.get("created_at__lte")
        if created_at_gte:
            queryset = queryset.filter(created_at__date__gte=created_at_gte)
        if created_at_lte:
            queryset = queryset.filter(created_at__date__lte=created_at_lte)

        order_by = self.request.query_params.get("order_by", "-created_at")
        if order_by not in self.ALLOWED_ORDER_BY:
            order_by = "-created_at"
        return queryset.order_by(order_by)

    def get(self, request, slug):
        """List helpdesk tickets.

        Filterable by priority, status, portal, source, team, SLA state
        (``sla_status=breached|at_risk|ok|none``) and recurrence
        (``is_recurrent=true``).
        """
        sla_status = request.query_params.get("sla_status")
        if sla_status and sla_service.sla_status_filter(sla_status) is None:
            return Response(
                {
                    "error": "Invalid sla_status.",
                    "allowed": [
                        sla_service.STATUS_BREACHED,
                        sla_service.STATUS_AT_RISK,
                        sla_service.STATUS_OK,
                        sla_service.STATUS_NONE,
                    ],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return self.paginate(
            request=request,
            queryset=self.get_queryset(),
            on_results=lambda requests: HelpdeskRequestAPISerializer(
                requests, many=True, fields=self.fields, expand=self.expand
            ).data,
        )

    def post(self, request, slug):
        """Create a helpdesk ticket.

        The SLA deadlines are derived from the policy of the ticket's priority;
        they are not accepted from the payload.
        """
        workspace = Workspace.objects.filter(slug=slug).first()
        if not workspace:
            return Response({"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)

        portal = HelpdeskPortal.objects.filter(id=request.data.get("portal"), workspace=workspace).first()
        if not portal:
            return Response(
                {"portal": "Portal not found for this workspace."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        invalid = self.validate_related_ids(request, workspace)
        if invalid:
            return invalid

        serializer = HelpdeskRequestAPISerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        status_obj = None
        status_id = request.data.get("status")
        if status_id:
            status_obj = HelpdeskStatus.objects.filter(id=status_id, workspace=workspace).first()
        else:
            status_obj = HelpdeskStatus.objects.filter(
                workspace=workspace, is_default=True, deleted_at__isnull=True
            ).first()

        helpdesk_request = serializer.save(workspace=workspace, portal=portal, status=status_obj)
        sla_service.apply_sla_due_dates(helpdesk_request, portal=portal)
        detect_recurrence(helpdesk_request)
        publish(slug, {"type": "request.created", "request_id": str(helpdesk_request.id)})

        helpdesk_request.refresh_from_db()
        return Response(
            HelpdeskRequestAPISerializer(helpdesk_request).data,
            status=status.HTTP_201_CREATED,
        )


class HelpdeskRequestDetailAPIEndpoint(HelpdeskRequestBaseAPIEndpoint):
    """Helpdesk ticket retrieve, update and delete."""

    def _get_object(self, slug, request_id):
        return self.base_queryset().filter(pk=request_id).first()

    def get(self, request, slug, request_id):
        """Retrieve a helpdesk ticket."""
        helpdesk_request = self._get_object(slug, request_id)
        if not helpdesk_request:
            return Response({"error": "Request not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(
            HelpdeskRequestAPISerializer(helpdesk_request, fields=self.fields, expand=self.expand).data,
            status=status.HTTP_200_OK,
        )

    def patch(self, request, slug, request_id):
        """Update a helpdesk ticket.

        Changing ``priority`` recomputes both SLA deadlines from the new
        policy, counted from when the ticket was opened. Moving into or out of a
        status with ``pauses_sla`` starts or ends the pause and shifts the
        deadlines accordingly.
        """
        helpdesk_request = self._get_object(slug, request_id)
        if not helpdesk_request:
            return Response({"error": "Request not found."}, status=status.HTTP_404_NOT_FOUND)

        invalid = self.validate_related_ids(request, helpdesk_request.workspace)
        if invalid:
            return invalid

        old_priority = helpdesk_request.priority
        old_status = helpdesk_request.status
        old_target_date = helpdesk_request.target_date

        new_status = None
        status_id = request.data.get("status")
        if status_id and str(status_id) != str(helpdesk_request.status_id):
            new_status = HelpdeskStatus.objects.filter(id=status_id, workspace__slug=slug).first()

        serializer = HelpdeskRequestAPISerializer(helpdesk_request, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        update_fields = {}
        if new_status:
            if new_status.is_terminal:
                update_fields["resolved_at"] = timezone.now()
            else:
                update_fields["resolved_at"] = None

            was_paused = bool(old_status and old_status.pauses_sla)
            will_pause = bool(new_status.pauses_sla and not new_status.is_terminal)
            if was_paused and not will_pause and helpdesk_request.sla_paused_at:
                update_fields.update(sla_service.resume_fields_after_pause(helpdesk_request))
            if will_pause and not was_paused:
                update_fields["sla_paused_at"] = timezone.now()

        if update_fields:
            HelpdeskRequest.objects.filter(pk=helpdesk_request.pk).update(**update_fields)

        priority_changed = bool(request.data.get("priority") and request.data["priority"] != old_priority)
        target_date_changed = "target_date" in request.data and (
            str(request.data.get("target_date") or "") != str(old_target_date or "")
        )
        if priority_changed or target_date_changed:
            helpdesk_request.refresh_from_db()
            sla_service.apply_sla_due_dates(helpdesk_request)

        publish(slug, {"type": "request.updated", "request_id": str(helpdesk_request.id)})

        return Response(
            HelpdeskRequestAPISerializer(self._get_object(slug, request_id)).data,
            status=status.HTTP_200_OK,
        )

    def delete(self, request, slug, request_id):
        """Delete a helpdesk ticket."""
        helpdesk_request = HelpdeskRequest.objects.filter(
            pk=request_id, workspace__slug=slug, deleted_at__isnull=True
        ).first()
        if not helpdesk_request:
            return Response({"error": "Request not found."}, status=status.HTTP_404_NOT_FOUND)
        helpdesk_request.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class HelpdeskPriorityListAPIEndpoint(BaseAPIView):
    """The priority vocabulary, with the SLA target that currently applies to each.

    Exists so a caller does not have to hardcode the priority values or guess
    which deadline a ticket will get before creating it.
    """

    permission_classes = [HelpdeskAPIPermission]
    use_read_replica = True

    def get(self, request, slug):
        portal = None
        portal_id = request.query_params.get("portal")
        if portal_id:
            portal = HelpdeskPortal.objects.filter(id=portal_id, workspace__slug=slug).first()
            if not portal:
                return Response(
                    {"error": "Portal not found for this workspace."},
                    status=status.HTTP_404_NOT_FOUND,
                )

        results = []
        for priority, label in HelpdeskRequestPriority.choices:
            first_hours, resolution_hours = (
                sla_service.resolve_sla_target(portal, priority) if portal else (None, None)
            )
            results.append(
                {
                    "value": priority,
                    "label": label,
                    "first_response_hours": first_hours,
                    "resolution_hours": resolution_hours,
                }
            )
        return Response({"results": results, "portal": str(portal.id) if portal else None})


class HelpdeskStatusListAPIEndpoint(BaseAPIView):
    """Workspace helpdesk statuses, including which ones stop the SLA clock."""

    permission_classes = [HelpdeskAPIPermission]
    use_read_replica = True

    def get(self, request, slug):
        statuses = HelpdeskStatus.objects.filter(
            workspace__slug=slug, deleted_at__isnull=True
        ).order_by("sequence")
        return Response(HelpdeskStatusAPISerializer(statuses, many=True).data)


class HelpdeskSLAPolicyListCreateAPIEndpoint(BaseAPIView):
    """Per-priority SLA policy list and create."""

    serializer_class = HelpdeskSLAPolicyAPISerializer
    model = HelpdeskSLAPolicy
    permission_classes = [HelpdeskAdminAPIPermission]

    def get_queryset(self):
        queryset = HelpdeskSLAPolicy.objects.filter(
            workspace__slug=self.kwargs.get("slug"), deleted_at__isnull=True
        ).select_related("portal")
        portal_id = self.request.query_params.get("portal")
        if portal_id:
            queryset = queryset.filter(portal_id=portal_id)
        return queryset.order_by("portal", "priority")

    def get(self, request, slug):
        """List SLA policies."""
        return self.paginate(
            request=request,
            queryset=self.get_queryset(),
            on_results=lambda policies: HelpdeskSLAPolicyAPISerializer(
                policies, many=True, fields=self.fields, expand=self.expand
            ).data,
        )

    def post(self, request, slug):
        """Create an SLA policy for one priority of a portal."""
        workspace = Workspace.objects.filter(slug=slug).first()
        if not workspace:
            return Response({"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)

        # Scope the portal to the workspace in the URL, or an admin of one
        # workspace could attach a policy to another workspace's portal.
        portal = HelpdeskPortal.objects.filter(id=request.data.get("portal"), workspace=workspace).first()
        if not portal:
            return Response(
                {"portal": "Portal not found for this workspace."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = HelpdeskSLAPolicyAPISerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(workspace=workspace, portal=portal)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class HelpdeskSLAPolicyDetailAPIEndpoint(BaseAPIView):
    """SLA policy retrieve, update and delete."""

    serializer_class = HelpdeskSLAPolicyAPISerializer
    model = HelpdeskSLAPolicy
    permission_classes = [HelpdeskAdminAPIPermission]

    def _get_object(self, slug, policy_id):
        return HelpdeskSLAPolicy.objects.filter(
            pk=policy_id, workspace__slug=slug, deleted_at__isnull=True
        ).first()

    def get(self, request, slug, policy_id):
        """Retrieve an SLA policy."""
        policy = self._get_object(slug, policy_id)
        if not policy:
            return Response({"error": "SLA policy not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(HelpdeskSLAPolicyAPISerializer(policy).data)

    def patch(self, request, slug, policy_id):
        """Update an SLA policy.

        Deadlines on tickets already open are not rewritten here: they are
        recomputed the next time the ticket's priority changes. Rewriting them
        in bulk would silently move the goalposts on work already in flight.
        """
        policy = self._get_object(slug, policy_id)
        if not policy:
            return Response({"error": "SLA policy not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = HelpdeskSLAPolicyAPISerializer(policy, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    def delete(self, request, slug, policy_id):
        """Delete an SLA policy, restoring the portal-wide fallback for that priority."""
        policy = self._get_object(slug, policy_id)
        if not policy:
            return Response({"error": "SLA policy not found."}, status=status.HTTP_404_NOT_FOUND)
        policy.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class HelpdeskSLASummaryAPIEndpoint(BaseAPIView):
    """Live SLA health: how many tickets are breached or about to be."""

    permission_classes = [HelpdeskAPIPermission]
    use_read_replica = True

    def get(self, request, slug):
        queryset = HelpdeskRequest.objects.filter(
            workspace__slug=slug,
            archived_at__isnull=True,
            deleted_at__isnull=True,
        )
        portal_id = request.query_params.get("portal")
        if portal_id:
            queryset = queryset.filter(portal_id=portal_id)

        queryset = sla_service.annotate_sla(queryset)
        breached = sla_service.sla_status_filter(sla_service.STATUS_BREACHED)
        at_risk = sla_service.sla_status_filter(sla_service.STATUS_AT_RISK)

        totals = queryset.aggregate(
            total=Count("id"),
            breached=Count("id", filter=breached),
            at_risk=Count("id", filter=at_risk),
            unresolved=Count("id", filter=Q(resolved_at__isnull=True)),
        )

        rows = {
            row["priority"]: row
            for row in queryset.values("priority").annotate(
                total=Count("id"),
                breached=Count("id", filter=breached),
                at_risk=Count("id", filter=at_risk),
            )
        }
        by_priority = [
            {
                "priority": priority,
                "total": rows.get(priority, {}).get("total", 0),
                "breached": rows.get(priority, {}).get("breached", 0),
                "at_risk": rows.get(priority, {}).get("at_risk", 0),
            }
            for priority, _label in HelpdeskRequestPriority.choices
        ]

        return Response(
            {
                "totals": totals,
                "by_priority": by_priority,
                "at_risk_window_hours": sla_service.AT_RISK_WINDOW.total_seconds() / 3600,
            }
        )


class HelpdeskRequestRecurrenceAPIEndpoint(BaseAPIView):
    """Tickets that repeat this one, and the ones it repeats."""

    permission_classes = [HelpdeskAPIPermission]

    def _get_request(self, slug, request_id):
        return HelpdeskRequest.objects.filter(
            pk=request_id, workspace__slug=slug, deleted_at__isnull=True
        ).first()

    def get(self, request, slug, request_id):
        """List the recurrence links of a ticket."""
        helpdesk_request = self._get_request(slug, request_id)
        if not helpdesk_request:
            return Response({"error": "Request not found."}, status=status.HTTP_404_NOT_FOUND)

        repeats = HelpdeskRequestRecurrence.objects.filter(
            request=helpdesk_request, deleted_at__isnull=True
        ).select_related("related_request")
        repeated_by = HelpdeskRequestRecurrence.objects.filter(
            related_request=helpdesk_request, deleted_at__isnull=True
        ).select_related("request")

        match_type = request.query_params.get("match_type")
        if match_type:
            repeats = repeats.filter(match_type=match_type)
            repeated_by = repeated_by.filter(match_type=match_type)

        return Response(
            {
                "repeats": HelpdeskRequestRecurrenceAPISerializer(repeats, many=True).data,
                "repeated_by": [
                    {
                        "id": str(link.id),
                        "match_type": link.match_type,
                        "score": link.score,
                        "created_at": link.created_at,
                        "related_request_detail": {
                            "id": str(link.request.id),
                            "display_id": link.request.display_id,
                            "title": link.request.title,
                            "priority": link.request.priority,
                            "status": str(link.request.status_id) if link.request.status_id else None,
                            "created_at": link.request.created_at,
                            "resolved_at": link.request.resolved_at,
                        },
                    }
                    for link in repeated_by
                ],
            }
        )

    def post(self, request, slug, request_id):
        """Re-run recurrence detection for a ticket."""
        helpdesk_request = self._get_request(slug, request_id)
        if not helpdesk_request:
            return Response({"error": "Request not found."}, status=status.HTTP_404_NOT_FOUND)

        links = detect_recurrence(helpdesk_request)
        return Response(
            {
                "detected": len(links),
                "results": HelpdeskRequestRecurrenceAPISerializer(links, many=True).data,
            },
            status=status.HTTP_200_OK,
        )
