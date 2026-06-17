from rest_framework.response import Response

from plane.app.views.base import BaseAPIView, BaseViewSet
from plane.db.models import Issue
from plane.db.models.helpdesk import HelpdeskRequestIssue
from plane.app.serializers.helpdesk import HelpdeskRequestIssueSerializer


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

    def perform_create(self, serializer):
        from plane.db.models import Workspace
        workspace = Workspace.objects.get(slug=self.kwargs.get("slug"))
        serializer.save(workspace=workspace)


class HelpdeskLinkedIssueLookupEndpoint(BaseAPIView):
    def get(self, request, slug):
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
