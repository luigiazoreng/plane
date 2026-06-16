import jwt
import datetime
from django.conf import settings
from rest_framework import status
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

from plane.app.views.base import BaseAPIView
from plane.db.models import Workspace
from plane.db.models.helpdesk import HelpdeskCustomer
from plane.app.serializers.helpdesk import HelpdeskCustomerSerializer

def get_customer_token(customer):
    payload = {
        "customer_id": str(customer.id),
        "email": customer.email,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(days=7),
        "iat": datetime.datetime.utcnow(),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")

class HelpdeskCustomerRegisterEndpoint(BaseAPIView):
    permission_classes = [AllowAny]

    def post(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if not workspace:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        email = request.data.get("email")
        password = request.data.get("password")
        name = request.data.get("name")

        if not email or not password or not name:
            return Response({"error": "Email, password and name are required"}, status=status.HTTP_400_BAD_REQUEST)

        if HelpdeskCustomer.objects.filter(email=email, workspace=workspace).exists():
            return Response({"error": "Email already exists"}, status=status.HTTP_400_BAD_REQUEST)

        customer = HelpdeskCustomer(email=email, name=name, workspace=workspace)
        customer.set_password(password)
        customer.save()

        token = get_customer_token(customer)
        return Response(
            {
                "token": token,
                "customer": HelpdeskCustomerSerializer(customer).data,
            },
            status=status.HTTP_201_CREATED,
        )

class HelpdeskCustomerLoginEndpoint(BaseAPIView):
    permission_classes = [AllowAny]

    def post(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if not workspace:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        email = request.data.get("email")
        password = request.data.get("password")

        if not email or not password:
            return Response({"error": "Email and password are required"}, status=status.HTTP_400_BAD_REQUEST)

        customer = HelpdeskCustomer.objects.filter(email=email, workspace=workspace).first()
        if not customer or not customer.check_password(password):
            return Response({"error": "Invalid credentials"}, status=status.HTTP_401_UNAUTHORIZED)

        token = get_customer_token(customer)
        return Response(
            {
                "token": token,
                "customer": HelpdeskCustomerSerializer(customer).data,
            },
            status=status.HTTP_200_OK,
        )
