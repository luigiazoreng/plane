from rest_framework import status
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.exceptions import ValidationError
import jwt
from django.conf import settings

from plane.app.views.base import BaseViewSet
from plane.db.models.helpdesk import HelpdeskRequest, HelpdeskPortal, HelpdeskCustomer
from plane.app.serializers.helpdesk import HelpdeskRequestSerializer


class HelpdeskRequestViewSet(BaseViewSet):
    serializer_class = HelpdeskRequestSerializer
    model = HelpdeskRequest

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
        )

    def perform_create(self, serializer):
        from plane.db.models import Workspace
        workspace = Workspace.objects.get(slug=self.kwargs.get("slug"))
        portal_id = self.request.data.get("portal")
        portal = HelpdeskPortal.objects.filter(id=portal_id, workspace=workspace).first()
        if not portal:
            raise ValidationError("Portal not found for this workspace.")
        serializer.save(workspace=workspace, portal=portal)


class PublicHelpdeskRequestEndpoint(BaseViewSet):
    permission_classes = [AllowAny]
    serializer_class = HelpdeskRequestSerializer
    model = HelpdeskRequest

    def _get_customer_from_token(self, request):
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        if not auth_header.startswith("Bearer "):
            return None, None
        token = auth_header.split(" ")[1]
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
            customer = HelpdeskCustomer.objects.filter(id=payload.get("customer_id")).first()
            return customer, None
        except jwt.ExpiredSignatureError:
            return None, Response({"error": "Token expired"}, status=status.HTTP_401_UNAUTHORIZED)
        except jwt.InvalidTokenError:
            return None, Response({"error": "Invalid token"}, status=status.HTTP_401_UNAUTHORIZED)

    def list(self, request, public_slug):
        portal = HelpdeskPortal.objects.filter(public_slug=public_slug, is_public=True).first()
        if not portal:
            return Response({"error": "Portal not found"}, status=status.HTTP_404_NOT_FOUND)

        customer, error = self._get_customer_from_token(request)
        if error:
            return error
        if not customer:
            return Response({"error": "Login required to list requests"}, status=status.HTTP_401_UNAUTHORIZED)
        if str(customer.workspace_id) != str(portal.workspace_id):
            return Response({"error": "Invalid token"}, status=status.HTTP_403_FORBIDDEN)

        requests_qs = HelpdeskRequest.objects.filter(portal=portal, customer=customer).order_by("-created_at")
        serializer = HelpdeskRequestSerializer(requests_qs, many=True)
        return Response(serializer.data)

    def retrieve(self, request, public_slug, pk=None):
        portal = HelpdeskPortal.objects.filter(public_slug=public_slug, is_public=True).first()
        if not portal:
            return Response({"error": "Portal not found"}, status=status.HTTP_404_NOT_FOUND)

        customer, error = self._get_customer_from_token(request)
        if error:
            return error

        hd_request = HelpdeskRequest.objects.filter(id=pk, portal=portal).first()
        if not hd_request:
            return Response({"error": "Request not found"}, status=status.HTTP_404_NOT_FOUND)

        if hd_request.customer and hd_request.customer != customer:
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        serializer = HelpdeskRequestSerializer(hd_request)
        return Response(serializer.data)

    def create(self, request, public_slug):
        portal = HelpdeskPortal.objects.filter(public_slug=public_slug, is_public=True).first()
        if not portal:
            return Response({"error": "Portal not found"}, status=status.HTTP_404_NOT_FOUND)

        customer, error = self._get_customer_from_token(request)
        if error:
            return error

        if customer and str(customer.workspace_id) != str(portal.workspace_id):
            return Response({"error": "Invalid token for this workspace"}, status=status.HTTP_403_FORBIDDEN)

        if portal.require_login and not customer:
            return Response({"error": "Login required to submit requests to this portal"}, status=status.HTTP_401_UNAUTHORIZED)

        serializer = HelpdeskRequestSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(
                portal=portal,
                workspace=portal.workspace,
                customer=customer,
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
