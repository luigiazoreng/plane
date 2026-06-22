import jwt
from django.conf import settings
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from plane.app.serializers.helpdesk import HelpdeskFormFieldSerializer, HelpdeskFormSerializer, HelpdeskRequestSerializer
from plane.app.views.base import BaseAPIView, BaseViewSet
from plane.app.helpdesk.auto_assignment import assign_helpdesk_request_automatically
from plane.app.helpdesk.form_core import build_default_helpdesk_system_fields, validate_helpdesk_form_submission, generate_ticket_display_id
from plane.app.helpdesk.sse_broker import publish as sse_publish
from plane.db.models import Workspace
from plane.db.models.helpdesk import (
    HelpdeskCustomer,
    HelpdeskForm,
    HelpdeskFormField,
    HelpdeskFormVisibility,
    HelpdeskPortal,
    HelpdeskRequest,
    HelpdeskRequestSource,
    HelpdeskStatus,
)


def get_customer_from_token(request):
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


def get_visible_forms_queryset(portal, customer):
    queryset = (
        HelpdeskForm.objects.filter(portal=portal, is_active=True, deleted_at__isnull=True)
        .prefetch_related("fields")
        .order_by("sequence", "created_at")
    )
    if customer:
        return queryset
    return queryset.filter(visibility=HelpdeskFormVisibility.PUBLIC)


class HelpdeskFormViewSet(BaseViewSet):
    serializer_class = HelpdeskFormSerializer
    model = HelpdeskForm
    filterset_fields = ["portal"]

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("portal")
            .prefetch_related("fields")
            .order_by("sequence", "created_at")
        )

    def perform_create(self, serializer):
        workspace = Workspace.objects.get(slug=self.kwargs.get("slug"))
        portal = HelpdeskPortal.objects.filter(id=self.request.data.get("portal"), workspace=workspace).first()
        if not portal:
            raise ValidationError({"portal": "Portal not found for this workspace."})
        form = serializer.save(workspace=workspace, portal=portal)
        HelpdeskFormField.objects.bulk_create(build_default_helpdesk_system_fields(workspace, form))

    def reorder(self, request, slug):
        items = request.data
        if not isinstance(items, list):
            return Response({"error": "Expected a list"}, status=status.HTTP_400_BAD_REQUEST)

        workspace = Workspace.objects.get(slug=slug)
        forms = HelpdeskForm.objects.filter(workspace=workspace, deleted_at__isnull=True)
        forms_by_id = {str(form.id): form for form in forms}
        to_update = []

        for item in items:
            form = forms_by_id.get(str(item.get("id")))
            if form and "sequence" in item:
                form.sequence = item["sequence"]
                to_update.append(form)

        HelpdeskForm.objects.bulk_update(to_update, ["sequence"])
        serializer = HelpdeskFormSerializer(forms.order_by("sequence", "created_at"), many=True)
        return Response(serializer.data)

    def set_active(self, request, slug, pk):
        workspace = Workspace.objects.get(slug=slug)
        form = HelpdeskForm.objects.filter(id=pk, workspace=workspace, deleted_at__isnull=True).first()
        if not form:
            return Response({"error": "Form not found"}, status=status.HTTP_404_NOT_FOUND)

        form.is_active = bool(request.data.get("is_active", not form.is_active))
        form.save(update_fields=["is_active", "updated_at"])
        return Response(HelpdeskFormSerializer(form).data)


class HelpdeskFormFieldViewSet(BaseViewSet):
    serializer_class = HelpdeskFormFieldSerializer
    model = HelpdeskFormField
    filterset_fields = ["form"]

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("form")
            .order_by("sequence", "created_at")
        )

    def perform_create(self, serializer):
        workspace = Workspace.objects.get(slug=self.kwargs.get("slug"))
        form = HelpdeskForm.objects.filter(id=self.request.data.get("form"), workspace=workspace).first()
        if not form:
            raise ValidationError({"form": "Form not found for this workspace."})
        serializer.save(workspace=workspace, form=form)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.is_system:
            return Response({"error": "System fields cannot be removed."}, status=status.HTTP_400_BAD_REQUEST)
        return super().destroy(request, *args, **kwargs)

    def reorder(self, request, slug):
        items = request.data
        if not isinstance(items, list):
            return Response({"error": "Expected a list"}, status=status.HTTP_400_BAD_REQUEST)

        workspace = Workspace.objects.get(slug=slug)
        fields = HelpdeskFormField.objects.filter(workspace=workspace, deleted_at__isnull=True)
        fields_by_id = {str(field.id): field for field in fields}
        to_update = []

        for item in items:
            field = fields_by_id.get(str(item.get("id")))
            if field and "sequence" in item:
                field.sequence = item["sequence"]
                to_update.append(field)

        HelpdeskFormField.objects.bulk_update(to_update, ["sequence"])
        serializer = HelpdeskFormFieldSerializer(fields.order_by("sequence", "created_at"), many=True)
        return Response(serializer.data)


class PublicHelpdeskFormListEndpoint(BaseAPIView):
    permission_classes = [AllowAny]

    def get(self, request, public_slug):
        portal = HelpdeskPortal.objects.filter(public_slug=public_slug, is_public=True).first()
        if not portal:
            return Response({"error": "Portal not found"}, status=status.HTTP_404_NOT_FOUND)

        customer, error = get_customer_from_token(request)
        if error:
            return error
        if customer and str(customer.workspace_id) != str(portal.workspace_id):
            return Response({"error": "Invalid token"}, status=status.HTTP_403_FORBIDDEN)

        forms = get_visible_forms_queryset(portal, customer)
        serializer = HelpdeskFormSerializer(forms, many=True)
        return Response(serializer.data)


class PublicHelpdeskFormDetailEndpoint(BaseAPIView):
    permission_classes = [AllowAny]

    def get(self, request, public_slug, form_slug):
        portal = HelpdeskPortal.objects.filter(public_slug=public_slug, is_public=True).first()
        if not portal:
            return Response({"error": "Portal not found"}, status=status.HTTP_404_NOT_FOUND)

        customer, error = get_customer_from_token(request)
        if error:
            return error
        if customer and str(customer.workspace_id) != str(portal.workspace_id):
            return Response({"error": "Invalid token"}, status=status.HTTP_403_FORBIDDEN)

        form = get_visible_forms_queryset(portal, customer).filter(slug=form_slug).first()
        if not form:
            return Response({"error": "Form not found"}, status=status.HTTP_404_NOT_FOUND)

        if form.visibility == HelpdeskFormVisibility.PRIVATE and not customer:
            return Response({"error": "Login required to access this form"}, status=status.HTTP_401_UNAUTHORIZED)

        serializer = HelpdeskFormSerializer(form)
        return Response(serializer.data)


class PublicHelpdeskFormSubmitEndpoint(BaseAPIView):
    permission_classes = [AllowAny]

    def post(self, request, public_slug, form_slug):
        portal = HelpdeskPortal.objects.filter(public_slug=public_slug, is_public=True).first()
        if not portal:
            return Response({"error": "Portal not found"}, status=status.HTTP_404_NOT_FOUND)

        customer, error = get_customer_from_token(request)
        if error:
            return error
        if customer and str(customer.workspace_id) != str(portal.workspace_id):
            return Response({"error": "Invalid token for this workspace"}, status=status.HTTP_403_FORBIDDEN)

        form = HelpdeskForm.objects.filter(
            portal=portal,
            slug=form_slug,
            is_active=True,
            deleted_at__isnull=True,
        ).prefetch_related("fields").first()
        if not form:
            return Response({"error": "Form not found"}, status=status.HTTP_404_NOT_FOUND)

        if portal.require_login and not customer:
            return Response({"error": "Login required to submit requests to this portal"}, status=status.HTTP_401_UNAUTHORIZED)
        if form.visibility == HelpdeskFormVisibility.PRIVATE and not customer:
            return Response({"error": "Login required to submit this form"}, status=status.HTTP_401_UNAUTHORIZED)

        contact_email = (request.data.get("contact_email") or "").strip()
        if not customer and not contact_email:
            return Response({"contact_email": "Contact email is required."}, status=status.HTTP_400_BAD_REQUEST)

        result = validate_helpdesk_form_submission(form, request.data)
        if result["errors"]:
            return Response(result["errors"], status=status.HTTP_400_BAD_REQUEST)

        default_status = HelpdeskStatus.objects.filter(
            workspace=portal.workspace,
            is_default=True,
            deleted_at__isnull=True,
        ).first()

        display_id = generate_ticket_display_id(form)
        helpdesk_request = HelpdeskRequest.objects.create(
            portal=portal,
            form=form,
            workspace=portal.workspace,
            customer=customer,
            title=result["title"],
            description=result["description"],
            contact_email=customer.email if customer else contact_email,
            status=default_status,
            source=HelpdeskRequestSource.PUBLIC_FORM,
            form_responses=result["responses"],
            display_id=display_id,
        )
        assign_helpdesk_request_automatically(helpdesk_request, request_payload=request.data)
        sse_publish(str(portal.workspace.slug), {"type": "request.created", "request_id": str(helpdesk_request.id)})
        serializer = HelpdeskRequestSerializer(helpdesk_request)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
