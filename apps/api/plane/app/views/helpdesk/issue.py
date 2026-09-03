from rest_framework import status
from rest_framework.response import Response

from plane.app.views.base import BaseAPIView, BaseViewSet
from plane.db.models import Issue
from plane.db.models.helpdesk import HelpdeskRequestIssue
from plane.app.serializers.helpdesk import HelpdeskRequestIssueSerializer
from plane.app.helpdesk.permissions import get_helpdesk_role, MEMBER
from plane.app.helpdesk.recurrence import detect_recurrence


class HelpdeskRequestIssueViewSet(BaseViewSet):
    serializer_class = HelpdeskRequestIssueSerializer
    model = HelpdeskRequestIssue
    filterset_fields = ["request"]

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
        )

    def list(self, request, *args, **kwargs):
        if get_helpdesk_role(request.user, self.kwargs.get("slug")) is None:
            return Response({"error": "Access denied."}, status=status.HTTP_403_FORBIDDEN)
        return super().list(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        if get_helpdesk_role(request.user, self.kwargs.get("slug")) is None:
            return Response({"error": "Access denied."}, status=status.HTTP_403_FORBIDDEN)
        return super().retrieve(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        role = get_helpdesk_role(request.user, self.kwargs.get("slug"))
        if role is None or role < MEMBER:
            return Response({"error": "Helpdesk Members or Admins can link issues."}, status=status.HTTP_403_FORBIDDEN)
        return super().create(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        role = get_helpdesk_role(request.user, self.kwargs.get("slug"))
        if role is None or role < MEMBER:
            return Response({"error": "Helpdesk Members or Admins can unlink issues."}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    def perform_create(self, serializer):
        from plane.db.models import Workspace
        workspace = Workspace.objects.get(slug=self.kwargs.get("slug"))
        link = serializer.save(workspace=workspace)
        # Linking a ticket to a work item is a statement that they share a root
        # cause, which is exactly the shared_issue recurrence signal. Run it for
        # the ticket just linked so both it and the tickets already on that
        # issue pick up the connection.
        detect_recurrence(link.request)


class HelpdeskLinkedIssueLookupEndpoint(BaseAPIView):
    def get(self, request, slug):
        if get_helpdesk_role(request.user, slug) is None:
            return Response({"error": "Access denied."}, status=status.HTTP_403_FORBIDDEN)
        issue_ids = request.query_params.getlist("issue_ids")
        issue_ids = [str(issue_id).strip() for issue_id in issue_ids if str(issue_id).strip()]
        if not issue_ids:
            return Response({"results": [], "missing_issue_ids": []})

        issues = list(
            Issue.issue_objects.filter(
                id__in=issue_ids,
                workspace__slug=slug,
                project__project_projectmember__member=request.user,
                project__project_projectmember__is_active=True,
                project__archived_at__isnull=True,
            )
            .distinct()
            .values("id", "project_id")
        )
        found_ids = {str(row["id"]) for row in issues}
        missing_issue_ids = [issue_id for issue_id in issue_ids if issue_id not in found_ids]

        return Response(
            {
                "results": [{"id": str(row["id"]), "project_id": str(row["project_id"])} for row in issues],
                "missing_issue_ids": missing_issue_ids,
            }
        )
