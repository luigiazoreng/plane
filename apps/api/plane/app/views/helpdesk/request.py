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
            .filter(workspace__slug=self.kwargs.get("slug"), project_id=self.kwargs.get("project_id"))
        )

    def perform_create(self, serializer):
        portal = HelpdeskPortal.objects.filter(project_id=self.kwargs.get("project_id")).first()
        if not portal:
            raise ValidationError("Please create a Helpdesk Portal for the project first.")
        serializer.save(project_id=self.kwargs.get("project_id"), portal=portal)



class PublicHelpdeskRequestEndpoint(BaseViewSet):
    permission_classes = [AllowAny]
    serializer_class = HelpdeskRequestSerializer
    model = HelpdeskRequest

    def create(self, request, public_slug):
        portal = HelpdeskPortal.objects.filter(public_slug=public_slug, is_public=True).first()
        if not portal:
            return Response({"error": "Portal not found"}, status=status.HTTP_404_NOT_FOUND)

        customer = None
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        if auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            try:
                payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
                customer = HelpdeskCustomer.objects.filter(id=payload.get("customer_id")).first()
            except jwt.ExpiredSignatureError:
                return Response({"error": "Token expired"}, status=status.HTTP_401_UNAUTHORIZED)
            except jwt.InvalidTokenError:
                return Response({"error": "Invalid token"}, status=status.HTTP_401_UNAUTHORIZED)

        if portal.require_login and not customer:
            return Response({"error": "Login required to submit requests to this portal"}, status=status.HTTP_401_UNAUTHORIZED)

        serializer = HelpdeskRequestSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(
                portal=portal,
                project=portal.project,
                customer=customer,
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
