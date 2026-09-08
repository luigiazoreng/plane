from rest_framework import status
from rest_framework.response import Response

from plane.app.helpdesk.permissions import MEMBER, get_helpdesk_role
from plane.app.helpdesk.recurrence import detect_recurrence
from plane.app.serializers.helpdesk import HelpdeskRequestRecurrenceSerializer
from plane.app.views.base import BaseAPIView
from plane.db.models.helpdesk import HelpdeskRequest, HelpdeskRequestRecurrence


def _get_request_in_workspace(slug, request_pk):
    return HelpdeskRequest.objects.filter(
        pk=request_pk, workspace__slug=slug, deleted_at__isnull=True
    ).first()


class HelpdeskRequestRecurrenceEndpoint(BaseAPIView):
    """Earlier tickets this one repeats, and the tickets that repeat it.

    ``repeats`` are the links where this ticket is the newer one; ``repeated_by``
    are the ones opened later that were tied back to it. An agent looking at an
    old ticket cares about the second list -- it is the evidence that a fix never
    actually held.
    """

    def get(self, request, slug, request_pk):
        if get_helpdesk_role(request.user, slug) is None:
            return Response({"error": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        helpdesk_request = _get_request_in_workspace(slug, request_pk)
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
                "repeats": HelpdeskRequestRecurrenceSerializer(repeats, many=True).data,
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

    def post(self, request, slug, request_pk):
        """Re-run detection for a ticket.

        Detection normally runs at creation and when a work item is linked. This
        exists for the case where the links were established after the fact --
        an old ticket retitled, or tickets imported in bulk.
        """
        role = get_helpdesk_role(request.user, slug)
        if role is None or role < MEMBER:
            return Response(
                {"error": "Helpdesk Members or Admins can re-run recurrence detection."},
                status=status.HTTP_403_FORBIDDEN,
            )

        helpdesk_request = _get_request_in_workspace(slug, request_pk)
        if not helpdesk_request:
            return Response({"error": "Request not found."}, status=status.HTTP_404_NOT_FOUND)

        links = detect_recurrence(helpdesk_request)
        return Response(
            {"detected": len(links), "results": HelpdeskRequestRecurrenceSerializer(links, many=True).data},
            status=status.HTTP_200_OK,
        )
