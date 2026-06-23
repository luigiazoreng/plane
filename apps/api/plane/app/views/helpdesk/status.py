from rest_framework.response import Response
from rest_framework import status

from plane.app.views.base import BaseViewSet
from plane.db.models import HelpdeskStatus, Workspace
from plane.app.serializers.helpdesk import HelpdeskStatusSerializer
from plane.db.models.helpdesk import DEFAULT_HELPDESK_STATUSES
from plane.app.helpdesk.permissions import get_helpdesk_role, ADMIN


class HelpdeskStatusViewSet(BaseViewSet):
    serializer_class = HelpdeskStatusSerializer
    model = HelpdeskStatus

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .order_by("sequence")
        )

    def list(self, request, *args, **kwargs):
        if get_helpdesk_role(request.user, self.kwargs.get("slug")) is None:
            return Response({"error": "Access denied."}, status=status.HTTP_403_FORBIDDEN)
        return super().list(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        if get_helpdesk_role(request.user, self.kwargs.get("slug")) is None:
            return Response({"error": "Access denied."}, status=status.HTTP_403_FORBIDDEN)
        return super().retrieve(request, *args, **kwargs)

    def _require_admin(self, request, slug):
        role = get_helpdesk_role(request.user, slug)
        if role is None or role < ADMIN:
            return Response({"error": "Only Helpdesk Admins can manage statuses."}, status=status.HTTP_403_FORBIDDEN)
        return None

    def create(self, request, *args, **kwargs):
        denied = self._require_admin(request, self.kwargs.get("slug"))
        if denied:
            return denied
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        denied = self._require_admin(request, self.kwargs.get("slug"))
        if denied:
            return denied
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        denied = self._require_admin(request, self.kwargs.get("slug"))
        if denied:
            return denied
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        denied = self._require_admin(request, self.kwargs.get("slug"))
        if denied:
            return denied
        return super().destroy(request, *args, **kwargs)

    def perform_create(self, serializer):
        workspace = Workspace.objects.get(slug=self.kwargs.get("slug"))
        serializer.save(workspace=workspace)

    def reorder(self, request, slug):
        denied = self._require_admin(request, slug)
        if denied:
            return denied
        """
        Accepts: [{"id": "<uuid>", "sequence": <float>}, ...]
        Updates the sequence of each status in bulk.
        """
        items = request.data
        if not isinstance(items, list):
            return Response({"error": "Expected a list"}, status=status.HTTP_400_BAD_REQUEST)

        workspace = Workspace.objects.get(slug=slug)
        qs = HelpdeskStatus.objects.filter(workspace=workspace)
        id_map = {str(s.id): s for s in qs}

        to_update = []
        for item in items:
            obj = id_map.get(str(item.get("id")))
            if obj and "sequence" in item:
                obj.sequence = item["sequence"]
                to_update.append(obj)

        HelpdeskStatus.objects.bulk_update(to_update, ["sequence"])
        serializer = HelpdeskStatusSerializer(qs.order_by("sequence"), many=True)
        return Response(serializer.data)

    def set_default(self, request, slug, pk):
        denied = self._require_admin(request, slug)
        if denied:
            return denied
        workspace = Workspace.objects.get(slug=slug)
        HelpdeskStatus.objects.filter(workspace=workspace).update(is_default=False)
        obj = HelpdeskStatus.objects.get(id=pk, workspace=workspace)
        obj.is_default = True
        obj.save()
        serializer = HelpdeskStatusSerializer(obj)
        return Response(serializer.data)
