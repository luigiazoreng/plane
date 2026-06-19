from rest_framework import status
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

from plane.app.views.base import BaseViewSet, BaseAPIView
from plane.db.models.helpdesk import HelpdeskPortal, HelpdeskForm, HelpdeskFormField
from plane.app.serializers.helpdesk import HelpdeskPortalSerializer
from plane.app.helpdesk.form_core import build_default_helpdesk_template_fields


class HelpdeskPortalViewSet(BaseViewSet):
    serializer_class = HelpdeskPortalSerializer
    model = HelpdeskPortal

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
        )

    def perform_create(self, serializer):
        from plane.db.models import Workspace
        workspace = Workspace.objects.get(slug=self.kwargs.get("slug"))
        portal = serializer.save(workspace=workspace)

        # Create the default form template for new portals
        form = HelpdeskForm.objects.create(
            workspace=workspace,
            portal=portal,
            name="Default request form",
            slug="default-request-form",
            is_active=True,
            sequence=10000,
        )
        fields = build_default_helpdesk_template_fields(workspace, form)
        HelpdeskFormField.objects.bulk_create(fields)


class PublicHelpdeskPortalEndpoint(BaseAPIView):
    permission_classes = [AllowAny]

    def get(self, request, public_slug):
        portal = HelpdeskPortal.objects.filter(public_slug=public_slug, is_public=True).first()
        if not portal:
            return Response({"error": "Portal not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = HelpdeskPortalSerializer(portal)
        return Response(serializer.data, status=status.HTTP_200_OK)
