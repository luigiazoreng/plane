import hashlib
import jwt
import datetime
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from zxcvbn import zxcvbn

from plane.app.views.base import BaseAPIView
from plane.authentication.utils.host import base_host
from plane.bgtasks.helpdesk_forgot_password_task import helpdesk_forgot_password
from plane.db.models import Workspace
from plane.db.models.helpdesk import HelpdeskCustomer, HelpdeskPortal, HelpdeskRequest
from plane.app.serializers.helpdesk import HelpdeskCustomerSerializer
from plane.throttles.helpdesk import HelpdeskPublicAuthThrottle

PASSWORD_RESET_PURPOSE = "helpdesk_password_reset"


def _claim_anonymous_requests(customer):
    """Link any anonymous requests with matching contact_email to this customer."""
    HelpdeskRequest.objects.filter(
        portal__workspace=customer.workspace,
        contact_email__iexact=customer.email,
        customer__isnull=True,
        deleted_at__isnull=True,
    ).update(customer=customer)

def get_customer_token(customer):
    now = timezone.now()
    payload = {
        "customer_id": str(customer.id),
        "workspace_id": str(customer.workspace_id),
        "email": customer.email,
        "exp": now + datetime.timedelta(days=7),
        "iat": now,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def _password_signature(customer):
    # Ties the reset token to the current password hash so it is
    # invalidated automatically once the password has been changed.
    return hashlib.sha256((customer.password or "").encode()).hexdigest()[:16]


def get_password_reset_token(customer):
    now = timezone.now()
    payload = {
        "purpose": PASSWORD_RESET_PURPOSE,
        "customer_id": str(customer.id),
        "workspace_id": str(customer.workspace_id),
        "pwd_sig": _password_signature(customer),
        "exp": now + datetime.timedelta(hours=1),
        "iat": now,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")

class HelpdeskCustomerRegisterEndpoint(BaseAPIView):
    permission_classes = [AllowAny]

    def post(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if not workspace:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        email = str(request.data.get("email") or "").strip().lower()
        password = request.data.get("password")
        name = str(request.data.get("name") or "").strip()

        if not email or not password or not name:
            return Response({"error": "Email, password and name are required"}, status=status.HTTP_400_BAD_REQUEST)

        if HelpdeskCustomer.objects.filter(email=email, workspace=workspace).exists():
            return Response({"error": "Email already exists"}, status=status.HTTP_400_BAD_REQUEST)

        customer = HelpdeskCustomer(email=email, name=name, workspace=workspace)
        customer.set_password(password)
        customer.save()
        _claim_anonymous_requests(customer)

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

        email = str(request.data.get("email") or "").strip().lower()
        password = request.data.get("password")

        if not email or not password:
            return Response({"error": "Email and password are required"}, status=status.HTTP_400_BAD_REQUEST)

        customer = HelpdeskCustomer.objects.filter(email=email, workspace=workspace).first()
        if not customer or not customer.check_password(password):
            return Response({"error": "Invalid credentials"}, status=status.HTTP_401_UNAUTHORIZED)

        if not customer.is_active:
            return Response({"error": "This account has been deactivated"}, status=status.HTTP_401_UNAUTHORIZED)

        _claim_anonymous_requests(customer)
        token = get_customer_token(customer)
        return Response(
            {
                "token": token,
                "customer": HelpdeskCustomerSerializer(customer).data,
            },
            status=status.HTTP_200_OK,
        )


class PublicHelpdeskCustomerRegisterEndpoint(BaseAPIView):
    permission_classes = [AllowAny]
    throttle_classes = [HelpdeskPublicAuthThrottle]

    def post(self, request, public_slug):
        portal = HelpdeskPortal.objects.filter(public_slug=public_slug, is_public=True).first()
        if not portal:
            return Response({"error": "Portal not found"}, status=status.HTTP_404_NOT_FOUND)

        workspace = portal.workspace
        email = str(request.data.get("email") or "").strip().lower()
        password = request.data.get("password")
        name = str(request.data.get("name") or "").strip()

        if not email or not password or not name:
            return Response({"error": "Email, password and name are required"}, status=status.HTTP_400_BAD_REQUEST)

        if HelpdeskCustomer.objects.filter(email=email, workspace=workspace).exists():
            return Response({"error": "Email already exists"}, status=status.HTTP_400_BAD_REQUEST)

        customer = HelpdeskCustomer(email=email, name=name, workspace=workspace)
        customer.set_password(password)
        customer.save()
        _claim_anonymous_requests(customer)

        token = get_customer_token(customer)
        return Response(
            {
                "token": token,
                "customer": HelpdeskCustomerSerializer(customer).data,
            },
            status=status.HTTP_201_CREATED,
        )


class PublicHelpdeskCustomerLoginEndpoint(BaseAPIView):
    permission_classes = [AllowAny]
    throttle_classes = [HelpdeskPublicAuthThrottle]

    def post(self, request, public_slug):
        portal = HelpdeskPortal.objects.filter(public_slug=public_slug, is_public=True).first()
        if not portal:
            return Response({"error": "Portal not found"}, status=status.HTTP_404_NOT_FOUND)

        workspace = portal.workspace
        email = str(request.data.get("email") or "").strip().lower()
        password = request.data.get("password")

        if not email or not password:
            return Response({"error": "Email and password are required"}, status=status.HTTP_400_BAD_REQUEST)

        customer = HelpdeskCustomer.objects.filter(email=email, workspace=workspace).first()
        if not customer or not customer.check_password(password):
            return Response({"error": "Invalid credentials"}, status=status.HTTP_401_UNAUTHORIZED)

        if not customer.is_active:
            return Response({"error": "This account has been deactivated"}, status=status.HTTP_401_UNAUTHORIZED)

        _claim_anonymous_requests(customer)
        token = get_customer_token(customer)
        return Response(
            {
                "token": token,
                "customer": HelpdeskCustomerSerializer(customer).data,
            },
            status=status.HTTP_200_OK,
        )


class PublicHelpdeskCustomerForgotPasswordEndpoint(BaseAPIView):
    permission_classes = [AllowAny]
    throttle_classes = [HelpdeskPublicAuthThrottle]

    def post(self, request, public_slug):
        portal = HelpdeskPortal.objects.filter(public_slug=public_slug, is_public=True).first()
        if not portal:
            return Response({"error": "Portal not found"}, status=status.HTTP_404_NOT_FOUND)

        email = str(request.data.get("email") or "").strip().lower()
        if not email:
            return Response({"error": "Email is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            validate_email(email)
        except ValidationError:
            return Response({"error": "Enter a valid email address"}, status=status.HTTP_400_BAD_REQUEST)

        generic_message = {"message": "If an account exists for this email, a reset link has been sent."}

        customer = HelpdeskCustomer.objects.filter(email=email, workspace=portal.workspace, is_active=True).first()
        if not customer:
            # Do not reveal whether the account exists or is active.
            return Response(generic_message, status=status.HTTP_200_OK)

        token = get_password_reset_token(customer)
        current_site = base_host(request=request, is_app=True)
        helpdesk_forgot_password.delay(customer.name, customer.email, public_slug, token, current_site)
        return Response(generic_message, status=status.HTTP_200_OK)


class PublicHelpdeskCustomerResetPasswordEndpoint(BaseAPIView):
    permission_classes = [AllowAny]
    throttle_classes = [HelpdeskPublicAuthThrottle]

    def post(self, request, public_slug):
        portal = HelpdeskPortal.objects.filter(public_slug=public_slug, is_public=True).first()
        if not portal:
            return Response({"error": "Portal not found"}, status=status.HTTP_404_NOT_FOUND)

        token = request.data.get("token")
        password = request.data.get("password")
        if not token or not password:
            return Response({"error": "Token and password are required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        except jwt.ExpiredSignatureError:
            return Response({"error": "This reset link has expired"}, status=status.HTTP_400_BAD_REQUEST)
        except jwt.InvalidTokenError:
            return Response({"error": "This reset link is invalid"}, status=status.HTTP_400_BAD_REQUEST)

        if payload.get("purpose") != PASSWORD_RESET_PURPOSE or payload.get("workspace_id") != str(portal.workspace_id):
            return Response({"error": "This reset link is invalid"}, status=status.HTTP_400_BAD_REQUEST)

        customer = HelpdeskCustomer.objects.filter(id=payload.get("customer_id"), workspace=portal.workspace).first()
        if not customer or _password_signature(customer) != payload.get("pwd_sig"):
            return Response({"error": "This reset link has already been used"}, status=status.HTTP_400_BAD_REQUEST)

        if not customer.is_active:
            return Response({"error": "This account has been deactivated"}, status=status.HTTP_400_BAD_REQUEST)

        results = zxcvbn(password)
        if results["score"] < 3:
            return Response(
                {"error": "This password is too weak. Try a longer, less common password."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        customer.set_password(password)
        customer.save()
        return Response({"message": "Password reset successfully"}, status=status.HTTP_200_OK)

