import jwt
from django.conf import settings
from rest_framework import status
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

from plane.app.views.base import BaseViewSet, BaseAPIView
from plane.db.models.helpdesk import HelpdeskRequestComment, HelpdeskRequest, HelpdeskPortal, HelpdeskCustomer
from plane.app.serializers.helpdesk import HelpdeskRequestCommentSerializer
from plane.app.helpdesk.sse_broker import publish
from plane.app.helpdesk.permissions import get_helpdesk_role, MEMBER, GUEST
from plane.app.helpdesk.attachments import COMMENT_ENTITY, assets_for, bind_assets, synthesize_content
from plane.app.helpdesk.activity import record_helpdesk_comment_activity
from .form import get_customer_from_token


class HelpdeskRequestCommentViewSet(BaseViewSet):
    """Comentários para agentes internos — requer autenticação Plane."""
    serializer_class = HelpdeskRequestCommentSerializer
    model = HelpdeskRequestComment

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(
                workspace__slug=self.kwargs.get("slug"),
                request_id=self.kwargs.get("request_pk"),
            )
            # actor_detail/customer_detail are nested serializers; without this
            # the list view issues one query per comment.
            .select_related("actor", "customer")
        )

    def list(self, request, *args, **kwargs):
        if get_helpdesk_role(request.user, self.kwargs.get("slug")) is None:
            return Response({"error": "Access denied."}, status=status.HTTP_403_FORBIDDEN)
        queryset = self.get_queryset()
        # Resolve every comment's attachments in one query rather than letting
        # the serializer fall back to a lookup per comment.
        context = self.get_serializer_context()
        context["attachments_by_entity"] = assets_for(COMMENT_ENTITY, [c.id for c in queryset])
        return Response(
            HelpdeskRequestCommentSerializer(queryset, many=True, context=context).data,
            status=status.HTTP_200_OK,
        )

    def retrieve(self, request, *args, **kwargs):
        if get_helpdesk_role(request.user, self.kwargs.get("slug")) is None:
            return Response({"error": "Access denied."}, status=status.HTTP_403_FORBIDDEN)
        return super().retrieve(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        slug = self.kwargs.get("slug")
        role = get_helpdesk_role(request.user, slug)
        if role is None or role < MEMBER:
            return Response({"error": "Helpdesk Members or Admins can create comments."}, status=status.HTTP_403_FORBIDDEN)
        return super().create(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        slug = self.kwargs.get("slug")
        role = get_helpdesk_role(request.user, slug)
        if role is None or role < MEMBER:
            return Response({"error": "Helpdesk Members or Admins can update comments."}, status=status.HTTP_403_FORBIDDEN)
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        slug = self.kwargs.get("slug")
        role = get_helpdesk_role(request.user, slug)
        if role is None or role < MEMBER:
            return Response({"error": "Helpdesk Members or Admins can delete comments."}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    def perform_create(self, serializer):
        from plane.bgtasks.helpdesk_email_task import send_helpdesk_comment_email

        hd_request = HelpdeskRequest.objects.get(id=self.kwargs.get("request_pk"))
        
        # Determine email_status before saving. An internal note is never
        # delivered by email, so it must not even be marked PENDING.
        delivery_channels = serializer.validated_data.get("delivery_channels", [])
        is_internal = serializer.validated_data.get("is_internal", False)
        should_send_email = "email" in delivery_channels and not is_internal

        email_status = HelpdeskRequestComment.EmailDeliveryStatus.NOT_SENT
        if should_send_email:
            email_status = HelpdeskRequestComment.EmailDeliveryStatus.PENDING

        comment = serializer.save(
            workspace_id=hd_request.workspace_id,
            request_id=hd_request.id,
            actor=self.request.user,
            email_status=email_status,
        )

        # Claim the attachments before anything observes the comment. The SSE
        # event makes other agents refetch, and the email task reads the comment
        # in a separate process -- both would see it without its files if this
        # ran after them.
        bind_assets(
            self.request.data.get("asset_ids"),
            workspace_id=hd_request.workspace_id,
            entity_type=COMMENT_ENTITY,
            entity_identifier=comment.id,
        )

        if hd_request.first_responded_at is None and comment.actor is not None:
            HelpdeskRequest.objects.filter(id=hd_request.id).update(
                first_responded_at=comment.created_at
            )

        # Record activity for the timeline
        record_helpdesk_comment_activity(hd_request, self.request.user, is_internal=is_internal)

        publish(self.kwargs.get("slug", ""), {"type": "comment.created", "request_id": str(hd_request.id)})

        if should_send_email:
            send_helpdesk_comment_email.delay(comment.id)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["workspace_slug"] = self.kwargs.get("slug")
        return context


class PublicHelpdeskCommentEndpoint(BaseAPIView):
    """Comentários para customers no portal público."""
    permission_classes = [AllowAny]

    def get(self, request, public_slug, request_pk):
        portal = (
            HelpdeskPortal.objects.select_related("workspace")
            .filter(public_slug=public_slug, is_public=True)
            .first()
        )
        if not portal:
            return Response({"error": "Portal not found"}, status=status.HTTP_404_NOT_FOUND)

        customer, error = get_customer_from_token(request)
        if error:
            return error

        if customer and str(customer.workspace_id) != str(portal.workspace_id):
            return Response({"error": "Invalid token for this workspace"}, status=status.HTTP_403_FORBIDDEN)

        if portal.require_login and not customer:
            return Response({"error": "Login required to view comments"}, status=status.HTTP_401_UNAUTHORIZED)

        hd_request = (
            HelpdeskRequest.objects.select_related("customer")
            .filter(id=request_pk, portal=portal)
            .first()
        )
        if not hd_request:
            return Response({"error": "Request not found"}, status=status.HTTP_404_NOT_FOUND)

        if hd_request.customer and hd_request.customer != customer:
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        comments = (
            HelpdeskRequestComment.objects.filter(
                request=hd_request,
                is_internal=False,
            )
            .select_related("actor", "customer")
            .order_by("created_at")
        )
        serializer = HelpdeskRequestCommentSerializer(
            comments,
            many=True,
            context={
                # public_slug routes attachment URLs through the portal
                # endpoint, which the customer can actually reach.
                "public_slug": public_slug,
                "attachments_by_entity": assets_for(COMMENT_ENTITY, [c.id for c in comments]),
            },
        )
        return Response(serializer.data)

    def post(self, request, public_slug, request_pk):
        portal = (
            HelpdeskPortal.objects.select_related("workspace")
            .filter(public_slug=public_slug, is_public=True)
            .first()
        )
        if not portal:
            return Response({"error": "Portal not found"}, status=status.HTTP_404_NOT_FOUND)

        customer, error = get_customer_from_token(request)
        if error:
            return error

        if customer and str(customer.workspace_id) != str(portal.workspace_id):
            return Response({"error": "Invalid token for this workspace"}, status=status.HTTP_403_FORBIDDEN)

        if portal.require_login and not customer:
            return Response({"error": "Login required to post comments"}, status=status.HTTP_401_UNAUTHORIZED)

        hd_request = (
            HelpdeskRequest.objects.select_related("form", "customer")
            .filter(id=request_pk, portal=portal)
            .first()
        )
        if not hd_request:
            return Response({"error": "Request not found"}, status=status.HTTP_404_NOT_FOUND)

        if hd_request.customer and hd_request.customer != customer:
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        chat_enabled = hd_request.form.enable_chat if hd_request.form else portal.enable_chat
        if not chat_enabled:
            error_msg = "Chat not enabled for this form" if hd_request.form else "Chat not enabled for this portal"
            return Response({"error": error_msg}, status=status.HTTP_403_FORBIDDEN)

        content = request.data.get("content", "").strip()
        asset_ids = request.data.get("asset_ids", [])
        has_assets = bool(asset_ids and isinstance(asset_ids, (list, tuple)) and len(asset_ids) > 0)
        if not content and not has_assets:
            return Response({"error": "Content or attachment is required"}, status=status.HTTP_400_BAD_REQUEST)

        if not content and has_assets:
            content = synthesize_content(len(asset_ids))

        comment = HelpdeskRequestComment.objects.create(
            request=hd_request,
            workspace=portal.workspace,
            customer=customer,
            content=content,
            is_internal=False,
        )

        # This path bypasses the serializer entirely, so it binds attachments
        # itself rather than sharing perform_create's hook. Both call the same
        # helper so the claim rules cannot drift apart.
        bind_assets(
            asset_ids,
            workspace_id=portal.workspace_id,
            entity_type=COMMENT_ENTITY,
            entity_identifier=comment.id,
        )

        # Record activity for the timeline
        record_helpdesk_comment_activity(hd_request, None, is_internal=False)

        publish(str(portal.workspace.slug), {"type": "comment.created", "request_id": str(hd_request.id)})

        serializer = HelpdeskRequestCommentSerializer(comment, context={"public_slug": public_slug})
        return Response(serializer.data, status=status.HTTP_201_CREATED)
