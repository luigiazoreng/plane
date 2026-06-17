from plane.app.views.base import BaseViewSet
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
