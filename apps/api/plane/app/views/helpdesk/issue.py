from plane.app.views.base import BaseViewSet
from plane.db.models.helpdesk import HelpdeskRequestIssue
from plane.app.serializers.helpdesk import HelpdeskRequestIssueSerializer


class HelpdeskRequestIssueViewSet(BaseViewSet):
    serializer_class = HelpdeskRequestIssueSerializer
    model = HelpdeskRequestIssue

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"), project_id=self.kwargs.get("project_id"))
        )

    def perform_create(self, serializer):
        serializer.save(project_id=self.kwargs.get("project_id"))

