import jwt
from django.conf import settings
from rest_framework import status
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

from plane.app.views.base import BaseViewSet, BaseAPIView
from plane.db.models.helpdesk import HelpdeskRequestComment, HelpdeskRequest, HelpdeskPortal, HelpdeskCustomer
from plane.app.serializers.helpdesk import HelpdeskRequestCommentSerializer


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
        )

    def perform_create(self, serializer):
        hd_request = HelpdeskRequest.objects.get(id=self.kwargs.get("request_pk"))
        comment = serializer.save(
            workspace_id=hd_request.workspace_id,
            request_id=hd_request.id,
            actor=self.request.user,
        )
        if hd_request.first_responded_at is None and comment.actor is not None:
            HelpdeskRequest.objects.filter(id=hd_request.id).update(
                first_responded_at=comment.created_at
            )


class PublicHelpdeskCommentEndpoint(BaseAPIView):
    """Comentários para customers no portal público."""
    permission_classes = [AllowAny]

    def _get_customer_from_token(self, request):
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        if not auth_header.startswith("Bearer "):
            return None
        token = auth_header.split(" ")[1]
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
            return HelpdeskCustomer.objects.filter(id=payload.get("customer_id")).first()
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            return None

    def get(self, request, public_slug, request_pk):
        portal = HelpdeskPortal.objects.filter(public_slug=public_slug, is_public=True).first()
        if not portal:
            return Response({"error": "Portal not found"}, status=status.HTTP_404_NOT_FOUND)

        comments = HelpdeskRequestComment.objects.filter(
            request_id=request_pk,
            request__portal=portal,
            is_internal=False,
        ).order_by("created_at")
        serializer = HelpdeskRequestCommentSerializer(comments, many=True)
        return Response(serializer.data)

    def post(self, request, public_slug, request_pk):
        portal = HelpdeskPortal.objects.filter(public_slug=public_slug, is_public=True).first()
        if not portal:
            return Response({"error": "Portal not found"}, status=status.HTTP_404_NOT_FOUND)

        if not portal.enable_chat:
            return Response({"error": "Chat not enabled for this portal"}, status=status.HTTP_403_FORBIDDEN)

        customer = self._get_customer_from_token(request)
        if customer and str(customer.workspace_id) != str(portal.workspace_id):
            return Response({"error": "Invalid token"}, status=status.HTTP_403_FORBIDDEN)

        hd_request = HelpdeskRequest.objects.filter(id=request_pk, portal=portal).first()
        if not hd_request:
            return Response({"error": "Request not found"}, status=status.HTTP_404_NOT_FOUND)

        content = request.data.get("content", "").strip()
        if not content:
            return Response({"error": "Content is required"}, status=status.HTTP_400_BAD_REQUEST)

        comment = HelpdeskRequestComment.objects.create(
            request=hd_request,
            workspace=portal.workspace,
            customer=customer,
            content=content,
            is_internal=False,
        )
        serializer = HelpdeskRequestCommentSerializer(comment)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
