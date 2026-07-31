from django.db.models import Q
from rest_framework import status
from rest_framework.response import Response

from plane.app.views.base import BaseViewSet
from plane.db.models.helpdesk import HelpdeskMacro
from plane.app.serializers.helpdesk import HelpdeskMacroSerializer
from plane.app.helpdesk.permissions import get_helpdesk_role, MEMBER, ADMIN


class HelpdeskMacroViewSet(BaseViewSet):
    serializer_class = HelpdeskMacroSerializer
    model = HelpdeskMacro

    def get_queryset(self):
        slug = self.kwargs.get("slug")
        return (
            super()
            .get_queryset()
            .filter(
                workspace__slug=slug,
            )
            .filter(Q(is_public=True) | Q(created_by=self.request.user))
            .order_by("sequence", "name")
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
            return Response({"error": "Helpdesk Members or Admins can create macros."}, status=status.HTTP_403_FORBIDDEN)
        return super().create(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        role = get_helpdesk_role(request.user, self.kwargs.get("slug"))
        if role is None or role < MEMBER:
            return Response({"error": "Helpdesk Members or Admins can update macros."}, status=status.HTTP_403_FORBIDDEN)
        instance = self.get_object()
        if not instance.is_public and instance.created_by != request.user and role < ADMIN:
            return Response({"error": "Cannot edit private macro owned by another user."}, status=status.HTTP_403_FORBIDDEN)
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        role = get_helpdesk_role(request.user, self.kwargs.get("slug"))
        if role is None or role < MEMBER:
            return Response({"error": "Helpdesk Members or Admins can delete macros."}, status=status.HTTP_403_FORBIDDEN)
        instance = self.get_object()
        if not instance.is_public and instance.created_by != request.user and role < ADMIN:
            return Response({"error": "Cannot delete private macro owned by another user."}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    def perform_create(self, serializer):
        from plane.db.models import Workspace
        workspace = Workspace.objects.get(slug=self.kwargs.get("slug"))
        serializer.save(workspace=workspace)
