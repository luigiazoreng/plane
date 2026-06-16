from rest_framework import status
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

from plane.app.views.base import BaseViewSet, BaseAPIView
from plane.db.models.helpdesk import HelpdeskPortal
from plane.app.serializers.helpdesk import HelpdeskPortalSerializer


class HelpdeskPortalViewSet(BaseViewSet):
    serializer_class = HelpdeskPortalSerializer
    model = HelpdeskPortal

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"), project_id=self.kwargs.get("project_id"))
        )

    def perform_create(self, serializer):
        project_id = self.kwargs.get("project_id")
        if HelpdeskPortal.objects.filter(project_id=project_id).exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError("A portal already exists for this project.")
        serializer.save(project_id=project_id)


class PublicHelpdeskPortalEndpoint(BaseAPIView):
    permission_classes = [AllowAny]

    def get(self, request, public_slug):
        portal = HelpdeskPortal.objects.filter(public_slug=public_slug, is_public=True).first()
        if not portal:
            return Response({"error": "Portal not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = HelpdeskPortalSerializer(portal)
        return Response(serializer.data, status=status.HTTP_200_OK)
