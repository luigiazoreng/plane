from rest_framework import status
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

from plane.app.views.base import BaseViewSet, BaseAPIView
from plane.db.models.helpdesk import HelpdeskPortal, HelpdeskForm, HelpdeskFormField
from plane.app.serializers.helpdesk import HelpdeskPortalSerializer
from plane.app.helpdesk.form_core import build_default_helpdesk_template_fields
from plane.app.helpdesk.permissions import get_helpdesk_role, ADMIN, GUEST


class HelpdeskPortalViewSet(BaseViewSet):
    serializer_class = HelpdeskPortalSerializer
    model = HelpdeskPortal

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
        )

    def list(self, request, *args, **kwargs):
        slug = self.kwargs.get("slug")
        if get_helpdesk_role(request.user, slug) is None:
            return Response({"error": "Access denied."}, status=status.HTTP_403_FORBIDDEN)
        return super().list(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        slug = self.kwargs.get("slug")
        if get_helpdesk_role(request.user, slug) is None:
            return Response({"error": "Access denied."}, status=status.HTTP_403_FORBIDDEN)
        return super().retrieve(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        slug = self.kwargs.get("slug")
        role = get_helpdesk_role(request.user, slug)
        if role is None or role < ADMIN:
            return Response({"error": "Only Helpdesk Admins can manage portals."}, status=status.HTTP_403_FORBIDDEN)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        slug = self.kwargs.get("slug")
        role = get_helpdesk_role(request.user, slug)
        if role is None or role < ADMIN:
            return Response({"error": "Only Helpdesk Admins can manage portals."}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        slug = self.kwargs.get("slug")
        role = get_helpdesk_role(request.user, slug)
        if role is None or role < ADMIN:
            return Response({"error": "Only Helpdesk Admins can manage portals."}, status=status.HTTP_403_FORBIDDEN)
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        slug = self.kwargs.get("slug")
        role = get_helpdesk_role(request.user, slug)
        if role is None or role < ADMIN:
            return Response({"error": "Only Helpdesk Admins can manage portals."}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    def perform_create(self, serializer):
        from plane.db.models import Workspace, WorkspaceMember, HelpdeskMember
        workspace = Workspace.objects.get(slug=self.kwargs.get("slug"))

        is_first_portal = not HelpdeskPortal.objects.filter(workspace=workspace).exists()

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

        # Seed all workspace admins as Helpdesk Admins on first portal creation
        if is_first_portal:
            admin_member_ids = list(
                WorkspaceMember.objects.filter(
                    workspace=workspace,
                    role=20,
                    is_active=True,
                ).values_list("member_id", flat=True)
            )
            existing_ids = set(
                HelpdeskMember.objects.filter(
                    workspace=workspace,
                    member_id__in=admin_member_ids,
                ).values_list("member_id", flat=True)
            )
            to_create = [
                HelpdeskMember(workspace=workspace, member_id=mid, role=20)
                for mid in admin_member_ids
                if mid not in existing_ids
            ]
            if to_create:
                HelpdeskMember.objects.bulk_create(to_create, ignore_conflicts=True)


class PublicHelpdeskPortalEndpoint(BaseAPIView):
    permission_classes = [AllowAny]

    def get(self, request, public_slug):
        portal = HelpdeskPortal.objects.filter(public_slug=public_slug, is_public=True).first()
        if not portal:
            return Response({"error": "Portal not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = HelpdeskPortalSerializer(portal)
        return Response(serializer.data, status=status.HTTP_200_OK)


class HelpdeskPortalEmailLogsEndpoint(BaseAPIView):
    def get(self, request, slug, pk):
        role = get_helpdesk_role(request.user, slug)
        if role is None or role < ADMIN:
            return Response({"error": "Only Helpdesk Admins can view email logs."}, status=status.HTTP_403_FORBIDDEN)
            
        from plane.db.models.helpdesk import HelpdeskRequestComment
        from plane.app.serializers.helpdesk import HelpdeskRequestCommentAdminSerializer
        
        # Fetch comments that have an email_status and are associated with this portal
        comments = HelpdeskRequestComment.objects.filter(
            request__portal_id=pk,
            request__portal__workspace__slug=slug
        ).exclude(
            email_status=HelpdeskRequestComment.EmailDeliveryStatus.NOT_SENT
        ).select_related("request", "actor", "customer").order_by("-created_at")[:100]  # Limit to 100 for now
        
        # The admin serializer, so the log carries `sender_verification`. This
        # endpoint is already gated on the Helpdesk ADMIN role above.
        serializer = HelpdeskRequestCommentAdminSerializer(comments, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
