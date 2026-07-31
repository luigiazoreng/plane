from rest_framework import status
from rest_framework.response import Response

from plane.app.views.base import BaseViewSet
from plane.db.models.helpdesk import HelpdeskTeam
from plane.app.serializers.helpdesk import HelpdeskTeamSerializer
from plane.app.helpdesk.permissions import get_helpdesk_role, ADMIN


class HelpdeskTeamViewSet(BaseViewSet):
    serializer_class = HelpdeskTeamSerializer
    model = HelpdeskTeam

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .prefetch_related("members")
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
        if role is None or role < ADMIN:
            return Response({"error": "Only Helpdesk Admins can create teams."}, status=status.HTTP_403_FORBIDDEN)
        return super().create(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        role = get_helpdesk_role(request.user, self.kwargs.get("slug"))
        if role is None or role < ADMIN:
            return Response({"error": "Only Helpdesk Admins can update teams."}, status=status.HTTP_403_FORBIDDEN)
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        role = get_helpdesk_role(request.user, self.kwargs.get("slug"))
        if role is None or role < ADMIN:
            return Response({"error": "Only Helpdesk Admins can delete teams."}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    def perform_create(self, serializer):
        from plane.db.models import Workspace
        workspace = Workspace.objects.get(slug=self.kwargs.get("slug"))
        serializer.save(workspace=workspace)
