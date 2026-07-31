from django.db.models import Count, Case, When, IntegerField, Min
from rest_framework import status
from rest_framework.response import Response

from plane.app.views.base import BaseAPIView, BaseViewSet
from plane.db.models.helpdesk import (
    HelpdeskRequest,
    HelpdeskRequestActivity,
    HelpdeskStatus,
)
from plane.app.serializers.helpdesk import (
    HelpdeskRequestActivitySerializer,
    HelpdeskRequestSerializer,
)
from plane.app.helpdesk.permissions import get_helpdesk_role, GUEST


class HelpdeskRequestActivityViewSet(BaseViewSet):
    serializer_class = HelpdeskRequestActivitySerializer
    model = HelpdeskRequestActivity

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(
                workspace__slug=self.kwargs.get("slug"),
                request_id=self.kwargs.get("request_pk"),
            )
            .select_related("actor")
            .order_by("created_at")
        )

    def list(self, request, *args, **kwargs):
        if get_helpdesk_role(request.user, self.kwargs.get("slug")) is None:
            return Response({"error": "Access denied."}, status=status.HTTP_403_FORBIDDEN)
        return super().list(request, *args, **kwargs)


class HelpdeskCustomerHistoryEndpoint(BaseAPIView):
    """Returns past tickets from the same customer/contact_email for the History tab."""

    def get(self, request, slug, pk):
        if get_helpdesk_role(request.user, slug) is None:
            return Response({"error": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        current_request = HelpdeskRequest.objects.filter(id=pk, workspace__slug=slug).first()
        if not current_request:
            return Response({"error": "Request not found."}, status=status.HTTP_404_NOT_FOUND)

        # Filter by customer FK if present, otherwise by contact_email
        query = HelpdeskRequest.objects.filter(
            workspace__slug=slug,
            archived_at__isnull=True,
        ).exclude(id=current_request.id)

        if current_request.customer_id:
            query = query.filter(customer_id=current_request.customer_id)
        elif current_request.contact_email:
            query = query.filter(contact_email=current_request.contact_email)
        else:
            return Response([])

        past_requests = query.select_related("status").order_by("-created_at")[:20]
        data = HelpdeskRequestSerializer(past_requests, many=True, context={"request": request}).data
        return Response(data, status=status.HTTP_200_OK)


class HelpdeskCustomerStatsEndpoint(BaseAPIView):
    """Returns aggregated stats for a customer (total, open, resolved, firstContactAt)
    for the right panel Customer section."""

    def get(self, request, slug, pk):
        if get_helpdesk_role(request.user, slug) is None:
            return Response({"error": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        current_request = HelpdeskRequest.objects.filter(id=pk, workspace__slug=slug).first()
        if not current_request:
            return Response({"error": "Request not found."}, status=status.HTTP_404_NOT_FOUND)

        query = HelpdeskRequest.objects.filter(
            workspace__slug=slug,
            archived_at__isnull=True,
        )

        if current_request.customer_id:
            query = query.filter(customer_id=current_request.customer_id)
        elif current_request.contact_email:
            query = query.filter(contact_email=current_request.contact_email)
        else:
            return Response({
                "total": 1,
                "open": 1,
                "resolved": 0,
                "firstContactAt": current_request.created_at.isoformat(),
            })

        terminal_status_ids = list(
            HelpdeskStatus.objects.filter(
                workspace__slug=slug, is_terminal=True
            ).values_list("id", flat=True)
        )

        stats = query.aggregate(
            total=Count("id"),
            resolved=Count(
                Case(
                    When(status_id__in=terminal_status_ids, then=1),
                    output_field=IntegerField(),
                )
            ),
            first_contact=Min("created_at"),
        )

        total = stats["total"] or 0
        resolved = stats["resolved"] or 0
        open_count = total - resolved
        first_contact = stats["first_contact"]

        return Response({
            "total": total,
            "open": open_count,
            "resolved": resolved,
            "firstContactAt": first_contact.isoformat() if first_contact else None,
        }, status=status.HTTP_200_OK)
